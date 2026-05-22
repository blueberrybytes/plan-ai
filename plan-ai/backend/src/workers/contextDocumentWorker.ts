import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import * as Sentry from "@sentry/node";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";
import { ContextDocumentJobPayload } from "../queue/contextDocumentQueue";
import { PrismaClient, Prisma } from "@prisma/client";
import { getContextFileContentFromFirebaseStorage } from "../firebase/firebaseStorage";
import {
  extractTextFromUpload,
  isSupportedContextFileMimeType,
} from "../utils/documentTextExtractor";
import { indexRawText } from "../vector/contextFileVectorService";
import { aiUsageService } from "../services/aiUsageService";
import { generateText, Output } from "ai";
import { getWorkspaceModel, FAST_AI_MODEL } from "../utils/aiModelUtils";
import { z } from "zod";

const prisma = new PrismaClient();
const REDIS_URL = EnvUtils.get("REDIS_URL") || "redis://localhost:6379";

const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const contextDocumentWorker = new Worker<ContextDocumentJobPayload>(
  "ContextDocumentQueue",
  async (job: Job<ContextDocumentJobPayload>) => {
    const { contextId, fileId, userId, workspaceId } = job.data;
    return Sentry.withScope(async (scope) => {
      scope.setUser({ id: userId });
      scope.setTag("workspaceId", workspaceId);
      scope.setTag("contextId", contextId);
      scope.setTag("fileId", fileId);
      scope.setTag("jobId", String(job.id ?? "unknown"));
      scope.setTag("queue", "ContextDocumentQueue");

      logger.info(`Processing ContextDocumentJob ${job.id} for file ${fileId}`);

      try {
      const fileRecord = await prisma.contextFile.findUnique({
        where: { id: fileId },
      });

      if (!fileRecord) {
        throw new Error(`ContextFile ${fileId} not found`);
      }

      // Download from Firebase Storage
      const buffer = await getContextFileContentFromFirebaseStorage(fileRecord.bucketPath, userId);

      // Extract Raw Text
      if (!isSupportedContextFileMimeType(fileRecord.mimeType)) {
        throw new Error(`Unsupported mimeType for background indexing: ${fileRecord.mimeType}`);
      }

      const rawText = await extractTextFromUpload({
        buffer,
        mimetype: fileRecord.mimeType,
        originalname: fileRecord.fileName,
      } as Express.Multer.File);

      if (!rawText || rawText.trim().length === 0) {
        throw new Error("No extractable text found in document.");
      }

      let cleanedMarkdown = rawText;

      const isStructuredFormat =
        fileRecord.mimeType.startsWith("text/") ||
        fileRecord.mimeType === "application/json" ||
        fileRecord.mimeType === "application/xml";

      const model = await getWorkspaceModel(workspaceId, FAST_AI_MODEL);

      // 1. Setup Keyword Extraction Promise
      const keywordPrompt = `You are a Speech-To-Text dictionary builder. Extract up to 25 of the most important terms from this document that would be difficult for a speech recognition engine to transcribe correctly without prior knowledge.

Focus on:
- **People names** (first, last, or full names)
- **Company and brand names** (e.g. "Figma", "Stripe", "Vercel")
- **Product names** (e.g. "ChatGPT", "BigQuery", "Kubernetes")
- **Acronyms and abbreviations** (e.g. "RBAC", "OKR", "gRPC", "CI/CD")
- **Technical jargon and domain-specific terms** (e.g. "microservices", "idempotent", "WebSocket")
- **Project or feature names** specific to this organization
- **Uncommon proper nouns** (cities, tools, libraries, frameworks)

Do NOT include:
- Common English words (e.g. "meeting", "project", "team")
- Generic programming terms that any transcriber would know (e.g. "function", "variable")

Document text snippet:
${rawText.slice(0, 12000)}`;

      const keywordsPromise = generateText({
        model,
        temperature: 0.1,
        abortSignal: AbortSignal.timeout(30000),
        output: Output.object({
          schema: z.object({
            keywords: z.array(z.string()).describe("The extracted unique keywords and terms."),
          }),
        }),
        prompt: keywordPrompt,
      }).catch((err) => {
        logger.warn(`Keyword extraction failed for document ${fileId}`, err);
        return null;
      });

      // 2. Setup Markdown Formatting Promise (only if unstructured)
      let formattingPromise: Promise<Awaited<ReturnType<typeof generateText>> | null> | null = null;
      if (!isStructuredFormat) {
        const systemPrompt = `You are an expert Document Recovery AI.
The user has provided raw OCR text extracted from a Presentation or PDF document. 
Your job is to rebuild the logical structure of this document into a pristine Markdown format.
Rules:
1. Fix broken paragraphs, lists, and tables that the OCR scattered.
2. Group logical concepts together under appropriate Markdown headers (##, ###).
3. Do NOT add commentary or fake information. Preserve all facts and data from the document.
4. Output cleanly formatted Markdown that is ideal for Vector Embeddings (RAG).`;

        formattingPromise = generateText({
          model,
          temperature: 0.1,
          abortSignal: AbortSignal.timeout(60000),
          system: systemPrompt,
          prompt: rawText,
        }).catch((err) => {
          logger.warn(`Formatting failed for document ${fileId}`, err);
          return null;
        });
      }

      // 3. Execute concurrently
      const [keywordsResult, formattingResult] = await Promise.all([
        keywordsPromise,
        formattingPromise,
      ]);

      // 4. Process formatting result
      if (formattingResult) {
        cleanedMarkdown = formattingResult.text || rawText;
        if (formattingResult.usage) {
          await aiUsageService.logUsage({
            userId,
            workspaceId,
            feature: "DOC",
            provider: "OPENROUTER",
            model: FAST_AI_MODEL,
            inputTokens: formattingResult.usage.inputTokens || 0,
            outputTokens: formattingResult.usage.outputTokens || 0,
          });
        }
      }

      // 5. Process keyword result
      if (keywordsResult && keywordsResult.output) {
        const extractedKeywords = keywordsResult.output.keywords.map(String);

        if (keywordsResult.usage) {
          await aiUsageService.logUsage({
            userId,
            workspaceId,
            feature: "DOC", // Logging under DOC
            provider: "OPENROUTER",
            model: FAST_AI_MODEL,
            inputTokens: keywordsResult.usage.inputTokens || 0,
            outputTokens: keywordsResult.usage.outputTokens || 0,
          });
        }

        if (extractedKeywords.length > 0) {
          const ctx = await prisma.context.findUnique({
            where: { id: contextId },
            select: { keywords: true },
          });
          if (ctx) {
            const currentKeywords = ctx.keywords || [];
            // Merge unique keywords
            const uniqueKeywords = Array.from(new Set([...currentKeywords, ...extractedKeywords]));

            await prisma.context.update({
              where: { id: contextId },
              data: { keywords: uniqueKeywords },
            });
            logger.info(
              `Extracted ${extractedKeywords.length} new keywords. Context ${contextId} now has ${uniqueKeywords.length} keywords.`,
            );
          }
        }
      }
      // Index the Cleaned Markdown
      await indexRawText({
        contextId,
        fileId,
        fileName: fileRecord.fileName,
        mimeType: fileRecord.mimeType,
        rawText: cleanedMarkdown,
      });

      // Update Metadata to COMPLETED
      const meta =
        typeof fileRecord.metadata === "object" && fileRecord.metadata
          ? { ...(fileRecord.metadata as Prisma.JsonObject) }
          : {};
      meta.processingStatus = "COMPLETED";

      await prisma.contextFile.update({
        where: { id: fileId },
        data: { metadata: meta },
      });

        logger.info(`Successfully completed ContextDocumentJob ${job.id}`);
      } catch (error) {
        logger.error(`Error processing ContextDocumentJob ${job.id}`, error);

        // Update Prisma to FAILED
        const fileRecord = await prisma.contextFile.findUnique({
          where: { id: fileId },
        });
        if (fileRecord) {
          const meta =
            typeof fileRecord.metadata === "object" && fileRecord.metadata
              ? { ...(fileRecord.metadata as Prisma.JsonObject) }
              : {};
          meta.processingStatus = "FAILED";
          meta.processingError = (error as Error).message || "Unknown error";

          await prisma.contextFile.update({
            where: { id: fileId },
            data: { metadata: meta },
          });
        }
        throw error;
      }
    });
  },
  { connection, concurrency: 2 },
);

contextDocumentWorker.on("completed", (job) => {
  logger.info(`ContextDocumentJob ${job.id} has completed!`);
});

contextDocumentWorker.on("failed", (job, err) => {
  logger.error(`ContextDocumentJob ${job?.id} has failed with ${err.message}`);
});
