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
      //
      // These keywords feed Deepgram's `keyterm` hints during live recording.
      // Deepgram only benefits from terms a GENERIC English STT would
      // mis-hear — proper nouns, brand names, acronyms, foreign words.
      // Plain dictionary words and generic jargon hurt more than they help
      // (they bias transcription toward those terms unnecessarily).
      const keywordPrompt = `You are a Speech-To-Text dictionary builder. Extract up to 25 of the most important terms from this document that would be difficult for a speech recognition engine to transcribe correctly without prior knowledge.

INCLUDE (in priority order):
1. **People names** — first, last, or full names ("Xavier Roca", "Noelia").
2. **Company / customer / vendor / brand names** — including unusual capitalization or compound words ("BlueBerryBytes", "Figma", "Stripe", "Vercel", "MongoDB", "OpenRouter").
3. **Product / app / feature / project names** specific to this organization ("ChatGPT", "BigQuery", "Project Falcon", "Phoenix Migration").
4. **Acronyms and initialisms** that sound nothing like their letters when spoken ("RBAC", "OKR", "gRPC", "CI/CD", "TSOA", "MERN", "SaaS", "OAuth").
5. **Technical jargon, frameworks, libraries, tools, protocols** ("microservices", "idempotent", "WebSocket", "Prisma", "BullMQ", "Tailwind", "Vite", "kubectl").
6. **Foreign / non-English / regional words** ("Bürgerservice", "Daẃti", "façade") and uncommon proper nouns (cities, regions, dialects).

EXCLUDE:
- Plain English dictionary words ("meeting", "project", "team", "user", "data", "system", "implement", "improve").
- Generic verbs / adjectives / adverbs ("create", "fast", "scalable", "quickly").
- Numbers, dates, currencies, version strings ("2.0.1", "Q3", "$50").
- Full sentences or phrases longer than 3 tokens.
- Common file extensions in isolation (".pdf", ".csv") — but compound names like "package.json" are fine.

OUTPUT RULES (critical — Deepgram is strict):
- Quality > quantity. 10 perfect terms beat 25 mediocre ones.
- 1–3 tokens MAX per term. Single token strongly preferred.
- **Preserve EXACT capitalization** as the term appears in the source ("MongoDB" not "mongodb", "iPhone" not "Iphone"). Deepgram is case-sensitive.
- The term MUST actually appear at least once in the document. Do not invent.
- Deduplicate variants — pick the canonical spelling from the source.

Document text snippet:
${rawText.slice(0, 20000)}`;

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
        // Defensive sanitization — the LLM occasionally slips garbage in
        // despite the prompt: pure numbers, empty strings, generic words,
        // overlong phrases. Filter before persisting so Context.keywords
        // stays high-signal for Deepgram.
        const GENERIC_STOP_WORDS = new Set([
          "meeting",
          "project",
          "team",
          "user",
          "users",
          "data",
          "system",
          "function",
          "variable",
          "feature",
          "client",
          "agenda",
          "task",
          "tasks",
          "note",
          "notes",
        ]);

        const extractedKeywords = keywordsResult.output.keywords
          .map((k: unknown) => String(k).trim())
          .filter((k: string) => {
            if (k.length === 0) return false;
            if (k.length > 60) return false; // sentence-like — drop
            // Drop pure numbers / dates / currencies.
            if (/^[\d\s.,/$€£%-]+$/.test(k)) return false;
            // Drop generic stop words (case-insensitive match).
            if (GENERIC_STOP_WORDS.has(k.toLowerCase())) return false;
            // Drop terms with more than 3 tokens — phrases beyond that
            // rarely help Deepgram.
            if (k.split(/\s+/).length > 3) return false;
            return true;
          });

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
