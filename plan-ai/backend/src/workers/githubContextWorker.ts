import { Worker, Job } from "bullmq";
import Redis from "ioredis";
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

const execAsync = util.promisify(exec);
const prisma = new PrismaClient();

const REDIS_URL = EnvUtils.get("REDIS_URL") || "redis://localhost:6379";

const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const githubContextWorker = new Worker<GithubContextJobPayload>(
  "GithubContextQueue",
  async (job: Job<GithubContextJobPayload>) => {
    logger.info(`Processing GithubContextJob ${job.id} for context ${job.data.contextId}`);
    const { contextId, githubRepoId, installationId } = job.data;

    const tmpDir = path.join("/tmp", "planai_repos", contextId);

    try {
      const [owner, repo] = githubRepoId.split("/");
      if (!owner || !repo) throw new Error(`Invalid repo string: ${githubRepoId}`);

      const octokit = await githubIntegrationService.getInstallationOctokit(Number(installationId));

      logger.info(`Downloading tarball for ${githubRepoId}...`);
      // Octokit returns an ArrayBuffer for tarball streams
      const response = await octokit.rest.repos.downloadTarballArchive({
        owner,
        repo,
        ref: job.data.branch || "HEAD",
      });

      fs.mkdirSync(tmpDir, { recursive: true });
      const tarPath = path.join(tmpDir, "repo.tar.gz");
      fs.writeFileSync(tarPath, Buffer.from(response.data as ArrayBuffer));

      // Extract using tar (cross platform safety)
      logger.info(`Extracting tarball for ${githubRepoId}...`);
      await tar.x({
        file: tarPath,
        cwd: tmpDir,
        strip: 1, // GitHub tarballs usually have a randomly named root folder inside the gz
      });

      logger.info(`Executing Repomix on ${githubRepoId}...`);
      const ignorePatterns =
        "node_modules/**,dist/**,public/**,coverage/**,.env,assets/**,.vscode/**,.git/**,.mypy_cache/**,.pytest_cache/**,.ruff_cache/**,.venv/**,env/**,build/**,.dart_tool/**,ios/**,android/**,windows/**,macos/**,linux/**,jmeter/**,data/**,models/**,ml_models/**,htmlcov/**,.husky/**,.vite/**,.next/**,test/**,tests/**,e2e/**,__tests__/**,fixtures/**,*.json,*.lock,*.yaml,*.sql,*.csv,*.md,*.jmx,*.log,docs/**,*.txt";

      await execAsync(
        `npx repomix . --style xml --compress --ignore "${ignorePatterns}" -o repomix.xml`,
        { cwd: tmpDir },
      );

      const xmlText = fs.readFileSync(path.join(tmpDir, "repomix.xml"), "utf-8");

      logger.info(`Indexing XML raw text (${xmlText.length} bytes) to Qdrant...`);
      await indexRawText({
        contextId,
        fileId: `github-${githubRepoId.replace("/", "-")}`,
        fileName: githubRepoId,
        mimeType: "application/xml",
        rawText: xmlText,
      });

      // Update Prisma Context metadata
      const context = await prisma.context.findUnique({ where: { id: contextId } });
      if (context) {
        // Pre-emptive cleanup: prevent duplicate UI entries if we are syncing a new branch on an already registered repo.
        const existingFiles = await prisma.contextFile.findMany({ where: { contextId } });
        for (const f of existingFiles) {
          const meta =
            typeof f.metadata === "object" && f.metadata ? (f.metadata as Prisma.JsonObject) : null;
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
          Buffer.from(xmlText, "utf-8"),
          context.userId,
          contextId,
          `${githubRepoId.replace("/", "-")}.xml`,
          "application/xml",
        );

        // Attach to database so it shows up in UI files list
        await contextService.attachFileToContext(context.workspaceId, contextId, {
          bucketPath: storagePath,
          fileName: `GitHub: ${githubRepoId}`,
          mimeType: "application/xml",
          sizeBytes: Buffer.byteLength(xmlText, "utf-8"),
          metadata: {
            publicUrl,
            source: "GITHUB_SYNC",
            repo: githubRepoId,
            branch: job.data.branch || "HEAD",
          },
        });

        const meta =
          typeof context.metadata === "object" && context.metadata
            ? { ...(context.metadata as Prisma.JsonObject) }
            : {};
        meta.syncStatus = "COMPLETED";
        meta.githubBranch = job.data.branch || "HEAD";
        meta.lastSyncAt = new Date().toISOString();

        // Trigger GitNexus analysis if enabled
        if (EnvUtils.get("USE_GITNEXUS") === "true") {
          try {
            const mcpUrl = EnvUtils.get("GITNEXUS_MCP_URL");
            if (mcpUrl) {
              logger.info(`Triggering GitNexus analysis for ${githubRepoId} in context sync...`);
              const analyzeUrl = mcpUrl.replace("/api/mcp", "/api/analyze");
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
                  dropEmbeddings: true, // Exact match only for speed
                }),
              });

              if (gitnexusResponse.ok) {
                logger.info(`GitNexus analysis completed for ${githubRepoId}.`);
                meta.gitnexusReady = true;
              } else {
                logger.warn(`GitNexus analysis failed with status: ${gitnexusResponse.status}`);
              }
            }
          } catch (gitnexusErr) {
            logger.error(`Error triggering GitNexus analysis during context sync`, gitnexusErr);
          }
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

      logger.info(`Successfully completed GithubContextJob ${job.id}`);
    } catch (error) {
      console.error(error);
      logger.error(`Error processing GithubContextJob ${job.id}`, error);

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
        logger.info(`Cleaned up temp directory ${tmpDir}`);
      }
    }
  },
  { connection, concurrency: 1 },
);

githubContextWorker.on("completed", (job) => {
  logger.info(`Job ${job.id} has completed!`);
});

githubContextWorker.on("failed", (job, err) => {
  logger.error(`Job ${job?.id} has failed with ${err.message}`);
});
