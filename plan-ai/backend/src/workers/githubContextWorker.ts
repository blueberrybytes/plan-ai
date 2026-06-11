import { Worker, Job } from "bullmq";
import * as Sentry from "@sentry/node";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";
import { GithubContextJobPayload } from "../queue/githubContextQueue";
import { githubIntegrationService } from "../services/githubIntegrationService";
import { indexRawText } from "../vector/contextFileVectorService";
import { PrismaClient, Prisma } from "@prisma/client";
import { exec } from "child_process";
import util from "util";
import fs from "fs";
import path from "path";
import * as tar from "tar";
import { uploadContextFileToFirebaseStorage } from "../firebase/firebaseStorage";
import { contextService } from "../services/contextService";
import { contextDocumentQueue } from "../queue/contextDocumentQueue";
import { checkSubscription } from "../services/subscriptionGuard";
import { ladybugService } from "../services/ladybugService";

const execAsync = util.promisify(exec);
const prisma = new PrismaClient();

import { createWorkerConnection } from "../queue/redisConnection";

const connection = createWorkerConnection();

export const githubContextWorker = new Worker<GithubContextJobPayload>(
  "GithubContextQueue",
  async (job: Job<GithubContextJobPayload>) => {
    const { contextId, githubRepoId, installationId } = job.data;
    return Sentry.withScope(async (scope) => {
      scope.setTag("contextId", contextId);
      scope.setTag("githubRepoId", githubRepoId);
      scope.setTag("jobId", String(job.id ?? "unknown"));
      scope.setTag("queue", "GithubContextQueue");

      // Resolve workspace/user from the context record for richer attribution
      // AND for the subscription check below.
      let resolvedWorkspaceId: string | null = null;
      try {
        const ctx = await prisma.context.findUnique({
          where: { id: contextId },
          select: { workspaceId: true, userId: true },
        });
        if (ctx) {
          scope.setUser({ id: ctx.userId });
          scope.setTag("workspaceId", ctx.workspaceId);
          resolvedWorkspaceId = ctx.workspaceId;
        }
      } catch {
        // Best-effort context lookup — don't block the job on it
      }

      // Skip processing if the workspace's subscription has lapsed. This
      // protects against BullMQ retries firing days after enqueue.
      if (resolvedWorkspaceId) {
        const sub = await checkSubscription(resolvedWorkspaceId);
        if (!sub.active) {
          logger.warn(
            `[worker:github] Skipping job ${job.id} — workspace ${resolvedWorkspaceId} subscription ${sub.reason ?? "missing"}`,
          );
          return;
        }
      }

      logger.info(`Processing GithubContextJob ${job.id} for context ${contextId}`);

      const tmpDir = path.join("/tmp", "planai_repos", contextId);

      try {
        logger.info(
          `[GithubWorker] 🔄 Starting job ${job.id} | repo=${githubRepoId} | branch=${job.data.branch || "HEAD"} | contextId=${contextId}`,
        );

        const [owner, repo] = githubRepoId.split("/");
        if (!owner || !repo) throw new Error(`Invalid repo string: ${githubRepoId}`);

        const octokit = await githubIntegrationService.getInstallationOctokit(
          Number(installationId),
        );

        const t0 = Date.now();
        logger.info(`[GithubWorker] ↓ Downloading tarball for ${githubRepoId}...`);
        // Octokit returns an ArrayBuffer for tarball streams
        const response = await octokit.rest.repos.downloadTarballArchive({
          owner,
          repo,
          ref: job.data.branch || "HEAD",
        });

        fs.mkdirSync(tmpDir, { recursive: true });
        const tarPath = path.join(tmpDir, "repo.tar.gz");
        fs.writeFileSync(tarPath, Buffer.from(response.data as ArrayBuffer));
        const tarSizeKb = Math.round(Buffer.byteLength(response.data as ArrayBuffer) / 1024);
        logger.info(
          `[GithubWorker] ✓ Tarball downloaded (${tarSizeKb} KB) in ${Date.now() - t0}ms`,
        );

        // Extract using tar (cross platform safety)
        logger.info(`[GithubWorker] 🗂  Extracting tarball...`);
        const t1 = Date.now();
        await tar.x({
          file: tarPath,
          cwd: tmpDir,
          strip: 1, // GitHub tarballs usually have a randomly named root folder inside the gz
        });
        logger.info(`[GithubWorker] ✓ Extracted in ${Date.now() - t1}ms`);

        logger.info(`[GithubWorker] 🧹 Running Repomix on ${githubRepoId}...`);
        const t2 = Date.now();
        // Whitelist approach: only include actual source code files.
        // Much more reliable than blacklisting — translation JSONs, SVGs, images,
        // GraphQL schemas, lockfiles, migrations etc. are excluded automatically.
        // Repomix also respects the repo's own .gitignore and its built-in defaults
        // already exclude node_modules / dist / build dirs.
        const includePatterns = [
          // Web / JS ecosystem (covers React, Next.js, React Native, Node, etc.)
          "**/*.ts",
          "**/*.tsx",
          "**/*.js",
          "**/*.jsx",
          "**/*.mjs",
          "**/*.cjs",
          "**/*.vue",
          "**/*.svelte",
          "**/*.astro",
          // Styles (useful for responsiveness/layout tasks)
          "**/*.css",
          "**/*.scss",
          "**/*.sass",
          "**/*.less",
          // Flutter / Dart
          "**/*.dart",
          // Python (backend, AI/ML, scripts)
          "**/*.py",
          // Go
          "**/*.go",
          // JVM
          "**/*.java",
          "**/*.kt",
          "**/*.groovy",
          "**/*.scala",
          // Systems / native
          "**/*.rs",
          "**/*.c",
          "**/*.cpp",
          "**/*.h",
          "**/*.hpp",
          // Mobile native
          "**/*.swift",
          "**/*.m",
          "**/*.mm",
          // Other backend
          "**/*.rb",
          "**/*.php",
          "**/*.cs",
          "**/*.ex",
          "**/*.exs",
          // Shell / scripts
          "**/*.sh",
          "**/*.bash",
          "**/*.zsh",
          // Infrastructure
          "**/*.tf",
          "**/*.hcl",
          // Config files (small, high signal for AI tasks)
          "package.json",
          "tsconfig.json",
          "tsconfig.*.json",
          "next.config.*",
          "vite.config.*",
          "tailwind.config.*",
          "pubspec.yaml", // Flutter
          "pyproject.toml",
          "setup.py",
          "requirements.txt", // Python
          "go.mod", // Go
          "Cargo.toml", // Rust
          "build.gradle",
          "build.gradle.kts",
          "pom.xml", // JVM
          "Gemfile", // Ruby
          "composer.json", // PHP
          "Dockerfile",
          "docker-compose.*",
          // Schema / data model (but NOT migrations or generated)
          "prisma/schema.prisma",
          "**/schema.prisma",
        ].join(",");

        await execAsync(
          `npx repomix . --style markdown --compress --include "${includePatterns}" -o repomix.md`,
          { cwd: tmpDir },
        );

        const repoText = fs.readFileSync(path.join(tmpDir, "repomix.md"), "utf-8");
        logger.info(
          `[GithubWorker] ✓ Repomix done in ${Date.now() - t2}ms | mdSize=${Math.round(repoText.length / 1024)}KB`,
        );

        // NOTE: Qdrant indexing happens AFTER we create the Prisma ContextFile row below,
        // so we can use attachedFile.id as fileId — matching what getRepomixContextPayloads queries.

        // Update Prisma Context metadata
        const context = await prisma.context.findUnique({ where: { id: contextId } });
        if (context) {
          // Pre-emptive cleanup: prevent duplicate UI entries if we are syncing a new branch on an already registered repo.
          const existingFiles = await prisma.contextFile.findMany({ where: { contextId } });
          for (const f of existingFiles) {
            const meta =
              typeof f.metadata === "object" && f.metadata
                ? (f.metadata as Prisma.JsonObject)
                : null;
            if (meta && meta.source === "GITHUB_SYNC" && meta.repo === githubRepoId) {
              await contextService
                .removeFileFromContext(context.workspaceId, contextId, f.id)
                .catch((e) => {
                  logger.warn(`Failed to cleanup old github ContextFile row:`, e);
                });
            }
          }

          // Upload to Firebase so UI can download/view it natively
          const { storagePath, publicUrl } = await uploadContextFileToFirebaseStorage(
            Buffer.from(repoText, "utf-8"),
            context.userId,
            contextId,
            `${githubRepoId.replace("/", "-")}.md`,
            "text/markdown",
          );

          // Attach to database so it shows up in UI files list
          const attachedFile = await contextService.attachFileToContext(
            context.workspaceId,
            contextId,
            {
              bucketPath: storagePath,
              fileName: `GitHub: ${githubRepoId}`,
              mimeType: "text/markdown",
              sizeBytes: Buffer.byteLength(repoText, "utf-8"),
              metadata: {
                publicUrl,
                source: "GITHUB_SYNC",
                repo: githubRepoId,
                branch: job.data.branch || "HEAD",
              },
            },
          );

          // Index to Qdrant using attachedFile.id so getRepomixContextPayloads can find it.
          // This MUST happen after attachFileToContext so the IDs match.
          logger.info(
            `[GithubWorker] 📦 Indexing Markdown to Qdrant (fileId=${attachedFile.id})...`,
          );
          job.log(`Indexing Markdown to Qdrant (fileId=${attachedFile.id})...`);
          const t3 = Date.now();
          await indexRawText({
            contextId,
            fileId: attachedFile.id,
            fileName: githubRepoId,
            mimeType: "text/markdown",
            rawText: repoText,
          });
          logger.info(`[GithubWorker] ✓ Qdrant indexed in ${Date.now() - t3}ms`);

          // Ladybug: per-repo GitNexus index so task refinement can query THIS
          // repo's graph (not the global plan index) via the gitnexus CLI.
          // Best-effort: a failure here must never fail the sync.
          // Drop our own artifacts first so the throwaway git commit inside
          // generateLadybug doesn't swallow the (potentially huge) tarball.
          fs.rmSync(tarPath, { force: true });
          fs.rmSync(path.join(tmpDir, "repomix.md"), { force: true });
          logger.info(
            `[GithubWorker] 🐞 Generating ladybug (per-repo GitNexus index) for ${githubRepoId}...`,
          );
          const t4 = Date.now();
          const ladybug = await ladybugService.generateLadybug({
            repoDir: tmpDir,
            userId: context.userId,
            contextId,
            fileId: attachedFile.id,
            repoName: githubRepoId,
          });
          logger.info(
            `[GithubWorker] ${ladybug ? "✓ Ladybug ready" : "⚠️ Ladybug skipped/failed (non-fatal)"} in ${Date.now() - t4}ms | fileId=${attachedFile.id}`,
          );
          if (ladybug) {
            const fileMeta =
              typeof attachedFile.metadata === "object" && attachedFile.metadata
                ? { ...(attachedFile.metadata as Prisma.JsonObject) }
                : {};
            fileMeta.ladybug = ladybug as unknown as Prisma.JsonObject;
            await prisma.contextFile.update({
              where: { id: attachedFile.id },
              data: { metadata: fileMeta },
            });
          }

          // Queue keyword extraction so this repo's domain terms (product
          // names, function names, framework jargon) land in Context.keywords —
          // critical so Deepgram gets keyterm hints when recording a meeting
          // about this project.
          await contextDocumentQueue
            .add(
              "process-pdf-llm",
              {
                contextId,
                fileId: attachedFile.id,
                userId: context.userId,
                workspaceId: context.workspaceId,
              },
              { jobId: `context-doc-${attachedFile.id}-${Date.now()}` },
            )
            .catch((err) => logger.warn("Failed to queue keyword extraction for github file", err));

          const meta =
            typeof context.metadata === "object" && context.metadata
              ? { ...(context.metadata as Prisma.JsonObject) }
              : {};
          meta.syncStatus = "COMPLETED";
          meta.githubBranch = job.data.branch || "HEAD";
          meta.lastSyncAt = new Date().toISOString();

          // Trigger GitNexus analysis if enabled
          if (EnvUtils.get("USE_GITNEXUS", "") === "true") {
            try {
              const mcpUrl = EnvUtils.get("GITNEXUS_MCP_URL", "");
              if (mcpUrl) {
                const analyzeBaseUrl = new URL(mcpUrl);
                analyzeBaseUrl.pathname = "/api/analyze";
                const analyzeUrl = analyzeBaseUrl.toString();

                logger.info(
                  `[GithubWorker] 🧠 Triggering GitNexus analysis | repo=${githubRepoId} | url=${analyzeUrl}`,
                );
                const t4 = Date.now();

                const {
                  data: { token },
                } = await octokit.rest.apps.createInstallationAccessToken({
                  installation_id: Number(installationId),
                });
                const gitUrl = `https://x-access-token:${token}@github.com/${githubRepoId}.git`;

                const gitnexusResponse = await fetch(analyzeUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    url: gitUrl,
                    dropEmbeddings: true,
                  }),
                });

                const elapsed = Date.now() - t4;
                if (gitnexusResponse.ok) {
                  logger.info(
                    `[GithubWorker] ✅ GitNexus analysis completed for ${githubRepoId} in ${elapsed}ms`,
                  );
                  meta.gitnexusReady = true;
                } else {
                  const body = await gitnexusResponse.text().catch(() => "");
                  logger.warn(
                    `[GithubWorker] ⚠️ GitNexus analysis failed | status=${gitnexusResponse.status} | elapsed=${elapsed}ms | body=${body.slice(0, 200)}`,
                  );
                }
              } else {
                logger.warn(
                  `[GithubWorker] USE_GITNEXUS=true but GITNEXUS_MCP_URL is not set — skipping GitNexus analysis`,
                );
              }
            } catch (gitnexusErr) {
              logger.error(`[GithubWorker] ❌ Error triggering GitNexus analysis`, gitnexusErr);
              await job.log(
                `[ERROR] GitNexus analysis failed: ${gitnexusErr instanceof Error ? gitnexusErr.message : String(gitnexusErr)}`,
              );
            }
          } else {
            logger.info(`[GithubWorker] USE_GITNEXUS is not 'true' — skipping GitNexus analysis`);
          }

          await prisma.context.update({
            where: { id: contextId },
            data: { metadata: meta },
          });

          // ----------------------------------------------------
          // Auto-Architect Generation Fire & Forget (DISABLED)
          // ----------------------------------------------------
          // logger.info(`Scaffolding Auto-Architect diagrams for ${githubRepoId}...`);
          // We no longer automatically generate ER and Architecture diagrams upon repo sync
          // to save AI tokens and prevent cluttering the user's workspace.
        }

        logger.info(
          `[GithubWorker] ✅ Job ${job.id} completed successfully | totalTime=${Date.now() - t0}ms`,
        );
      } catch (error) {
        console.error(error);
        logger.error(`Error processing GithubContextJob ${job.id}`, error);
        await job.log(
          `[ERROR] Job failed: ${error instanceof Error ? error.message : String(error)}`,
        );

        // Update Prisma to FAILED
        const context = await prisma.context.findUnique({ where: { id: contextId } });
        if (context) {
          const meta =
            typeof context.metadata === "object" && context.metadata
              ? { ...(context.metadata as Prisma.JsonObject) }
              : {};
          meta.syncStatus = "FAILED";

          await prisma.context.update({
            where: { id: contextId },
            data: { metadata: meta },
          });
        }
        throw error;
      } finally {
        // Clean up tmp directory
        if (fs.existsSync(tmpDir)) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          logger.info(`[GithubWorker] 🧹 Cleaned up temp directory ${tmpDir}`);
        }
      }
    });
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 300_000, // 5 minutes — tarball download + Repomix + GitNexus can take 60s+
    stalledInterval: 120_000, // Check for stalled jobs every 2 minutes
  },
);

githubContextWorker.on("completed", (job) => {
  logger.info(`Job ${job.id} has completed!`);
});

githubContextWorker.on("failed", (job, err) => {
  logger.error(`Job ${job?.id} has failed with ${err.message}`);
});
