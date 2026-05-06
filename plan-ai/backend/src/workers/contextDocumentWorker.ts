import { Worker, Job } from "bullmq";
import Redis from "ioredis";
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
import OpenAI from "openai";

const prisma = new PrismaClient();
const REDIS_URL = EnvUtils.get("REDIS_URL") || "redis://localhost:6379";

const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

const LLM_MODEL = "gpt-4o-mini"; // Fast, cheap, capable reasoning for Markdown structuring

export const contextDocumentWorker = new Worker<ContextDocumentJobPayload>(
  "ContextDocumentQueue",
  async (job: Job<ContextDocumentJobPayload>) => {
    logger.info(`Processing ContextDocumentJob ${job.id} for file ${job.data.fileId}`);

    const { contextId, fileId, userId, workspaceId } = job.data;

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

      // Use LLM to structure the messy OCR text into clean Markdown
      const openai = new OpenAI({
        apiKey: EnvUtils.get("OPENAI_API_KEY"),
      });

      const systemPrompt = `You are an expert Document Recovery AI.
The user has provided raw OCR text extracted from a Presentation or PDF document. 
Your job is to rebuild the logical structure of this document into a pristine Markdown format.
Rules:
1. Fix broken paragraphs, lists, and tables that the OCR scattered.
2. Group logical concepts together under appropriate Markdown headers (##, ###).
3. Do NOT add commentary or fake information. Preserve all facts and data from the document.
4. Output cleanly formatted Markdown that is ideal for Vector Embeddings (RAG).`;

      const response = await openai.chat.completions.create({
        model: LLM_MODEL,
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: rawText },
        ],
      });

      const cleanedMarkdown = response.choices[0]?.message?.content || "";
      const usage = response.usage;

      // Log Token Usage
      if (usage) {
        await aiUsageService.logUsage({
          userId,
          workspaceId,
          feature: "DOC",
          provider: "OPENAI",
          model: LLM_MODEL,
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
        });
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
      console.error(error);
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
  },
  { connection, concurrency: 2 },
);

contextDocumentWorker.on("completed", (job) => {
  logger.info(`ContextDocumentJob ${job.id} has completed!`);
});

contextDocumentWorker.on("failed", (job, err) => {
  logger.error(`ContextDocumentJob ${job?.id} has failed with ${err.message}`);
});
