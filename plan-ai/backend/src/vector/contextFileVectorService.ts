import type { Express } from "express";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import { logger } from "../utils/logger";
import {
  resolveWorkspaceEmbeddingConfig,
  type WorkspaceEmbeddingConfig,
} from "../utils/aiModelUtils";
import prisma from "../prisma/prismaClient";
import { aiUsageService } from "../services/aiUsageService";
import {
  deleteVectorsByContext,
  deleteVectorsByFile,
  ensureContextCollection,
  upsertContextVectors,
  queryVectors,
  getFullContextPayloads,
  getRepomixContextPayloads,
  type ContextVectorPoint,
} from "./contextVectorStore";

import { v4 as uuidv4 } from "uuid";
import { extractTextFromUpload, isSupportedUploadMimeType } from "../utils/documentTextExtractor";

const EMBEDDING_DIMENSION = Number.parseInt(process.env.OPENAI_EMBEDDING_DIMENSION ?? "1536", 10);
const TEXT_CHUNK_SIZE = Number.parseInt(process.env.CONTEXT_VECTOR_CHUNK_SIZE ?? "800", 10);
const TEXT_CHUNK_OVERLAP = Number.parseInt(process.env.CONTEXT_VECTOR_CHUNK_OVERLAP ?? "160", 10);
// Cap on the text embedded for a RAG QUERY. text-embedding-3-small accepts
// 8191 tokens; a user can paste a 60KB+ message, which blows past that — the
// provider then returns a degenerate 200 and langchain crashes reading
// data[0] (prod incident 2026-06-15). A RAG query only needs the INTENT, and
// the signal lives in the head, so 8000 chars (~2000 tokens, ~4× margin) is
// plenty and safe even for token-dense (CJK/code) input.
const MAX_EMBED_QUERY_CHARS = Number.parseInt(process.env.MAX_EMBED_QUERY_CHARS ?? "8000", 10);

// BYOK embeddings: build a client per workspace config (resolved at call time)
// instead of a global singleton, so each customer's embeddings bill their own
// key. Embeddings run through the workspace's OpenRouter key by default (with an
// OpenAI fallback for legacy keys) — see resolveWorkspaceEmbeddingConfig.
const buildEmbeddings = (config: WorkspaceEmbeddingConfig) =>
  new OpenAIEmbeddings({
    openAIApiKey: config.apiKey,
    model: config.model,
    maxRetries: 2,
    timeout: 60000,
    ...(config.baseURL ? { configuration: { baseURL: config.baseURL } } : {}),
  });

const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: TEXT_CHUNK_SIZE,
  chunkOverlap: TEXT_CHUNK_OVERLAP,
});

const ensureCollectionIfNeeded = async (): Promise<void> => {
  await ensureContextCollection(EMBEDDING_DIMENSION);
};

export const initializeContextVectorStore = ensureCollectionIfNeeded;

export { getFullContextPayloads, getRepomixContextPayloads };

const normalizeChunks = (chunks: string[]): string[] =>
  chunks.map((chunk) => chunk.trim()).filter((chunk) => chunk.length > 0);

const bufferToText = (file: Express.Multer.File): string | null => {
  if (file.buffer.length === 0) {
    return null;
  }

  try {
    return file.buffer.toString("utf8");
  } catch (error) {
    logger.warn("Failed to convert buffer to text for context file", error);
    return null;
  }
};

const extractTextForContextFile = async (file: Express.Multer.File): Promise<string | null> => {
  try {
    if (isSupportedUploadMimeType(file.mimetype)) {
      return await extractTextFromUpload(file);
    }

    if (file.mimetype.startsWith("text/") || file.mimetype === "application/json") {
      return bufferToText(file);
    }

    return null;
  } catch (error) {
    logger.warn("Failed to extract text for context file", error);
    return null;
  }
};

export interface IndexContextFileVectorsArgs {
  contextId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  file: Express.Multer.File;
}

export interface IndexRawTextArgs {
  contextId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  rawText: string;
}

export const indexRawText = async (args: IndexRawTextArgs): Promise<void> => {
  const { contextId, fileId, fileName, mimeType, rawText } = args;

  try {
    if (!rawText || rawText.trim().length === 0) {
      logger.info(
        `Skipping vector index for context file ${fileId}; no extractable text (mime: ${mimeType}).`,
      );
      return;
    }

    const normalizedText = rawText.trim();
    const rawChunks = await textSplitter.splitText(normalizedText);

    // Calculate start and end line for each chunk
    let currentSearchIndex = 0;
    const chunks = normalizeChunks(rawChunks).map((chunk) => {
      const matchIndex = normalizedText.indexOf(chunk, currentSearchIndex);
      const startIndex = matchIndex !== -1 ? matchIndex : currentSearchIndex;
      currentSearchIndex = startIndex + chunk.length;

      // Calculate start line by counting newlines before the chunk
      const textBefore = normalizedText.substring(0, startIndex);
      const startLine = textBefore.split("\n").length;

      // Calculate end line by counting newlines inside the chunk
      const chunkLines = chunk.split("\n").length;
      const endLine = startLine + chunkLines - 1;

      return `[File: ${fileName}, Lines: ${startLine}-${endLine}]\n${chunk}`;
    });

    if (chunks.length === 0) {
      logger.info(
        `Skipping vector index for context file ${fileId}; text splitter produced no chunks.`,
      );
      return;
    }

    // Resolve the workspace + its BYOK OpenAI key up front so embeddings bill
    // the customer's key (not the platform's). Also reused for usage logging.
    const contextRecord = await prisma.context.findUnique({ where: { id: contextId } });
    if (!contextRecord) {
      logger.warn(
        `Skipping vector index for context file ${fileId}; context ${contextId} not found.`,
      );
      return;
    }
    const embeddingConfig = await resolveWorkspaceEmbeddingConfig(contextRecord.workspaceId);
    const embeddings = buildEmbeddings(embeddingConfig);

    await ensureCollectionIfNeeded();

    // 1. Delete previous vectors for this file
    await deleteVectorsByFile(contextId, fileId).catch((error) => {
      logger.warn(`Failed to delete previous vectors for context file ${fileId}`, error);
    });

    // 2. Double-Batching logic (OpenAI Embeddings + Qdrant Upsert)
    // We batch both to stay under OpenAI limits and Qdrant payload limits.
    const BATCH_SIZE = 100;
    let totalIndexed = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batchChunks = chunks.slice(i, i + BATCH_SIZE);

      // OpenAI Batch
      const batchVectors = await embeddings.embedDocuments(batchChunks);

      // Build Points for this batch
      const points: ContextVectorPoint[] = batchChunks.map((chunk, index) => ({
        id: uuidv4(),
        vector: batchVectors[index],
        payload: {
          contextId,
          fileId,
          chunkIndex: i + index,
          text: chunk,
          sourceFileName: fileName,
          mimeType,
        },
      }));

      // Qdrant Batch Upload
      if (points.length > 0) {
        await upsertContextVectors(points);
        totalIndexed += points.length;
      }

      logger.info(
        `Indexed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} for file ${fileId} (${totalIndexed} total chunks)`,
      );
    }

    logger.info(
      `Successfully indexed ${totalIndexed} vector chunks for context ${contextId} file ${fileId}.`,
    );

    // Track AI Usage centrally for all embeddings (contextRecord resolved above)
    if (totalIndexed > 0) {
      const estimatedTokens = Math.ceil(normalizedText.length / 4);
      await aiUsageService
        .logUsage({
          userId: contextRecord.userId,
          workspaceId: contextRecord.workspaceId,
          feature: "DOC",
          provider: embeddingConfig.baseURL ? "openrouter" : "openai",
          model: embeddingConfig.model,
          inputTokens: estimatedTokens,
          outputTokens: 0,
        })
        .catch((err) => logger.warn("Failed to log embedding usage:", err));
    }
  } catch (error) {
    logger.error(`Failed to index raw text ${fileId} for context ${contextId}`, error);
    throw error;
  }
};

export const indexContextFileVectors = async (args: IndexContextFileVectorsArgs): Promise<void> => {
  try {
    const rawText = await extractTextForContextFile(args.file);
    if (!rawText) return;

    await indexRawText({
      contextId: args.contextId,
      fileId: args.fileId,
      fileName: args.fileName,
      mimeType: args.mimeType,
      rawText,
    });
  } catch (error) {
    logger.error(`Failed to completely process file ${args.fileId}`, error);
    throw error;
  }
};

export const removeContextFileVectors = async (
  contextId: string,
  fileId: string,
): Promise<void> => {
  try {
    await ensureCollectionIfNeeded();
    await deleteVectorsByFile(contextId, fileId);
  } catch (error) {
    logger.error(`Failed to delete vectors for context file ${fileId}`, error);
  }
};

export const removeContextVectors = async (contextId: string): Promise<void> => {
  try {
    await ensureCollectionIfNeeded();
    await deleteVectorsByContext(contextId);
  } catch (error) {
    logger.error(`Failed to delete vectors for context ${contextId}`, error);
  }
};

export const queryContexts = async (
  contextIds: string[],
  queryText: string,
  limit = 10,
): Promise<string[]> => {
  if (contextIds.length === 0 || !queryText.trim()) {
    return [];
  }

  try {
    // Resolve the workspace + its BYOK OpenAI key before embedding the query.
    const contextRecord = await prisma.context.findUnique({ where: { id: contextIds[0] } });
    if (!contextRecord) {
      logger.warn(`queryContexts: context ${contextIds[0]} not found — skipping.`);
      return [];
    }
    const embeddingConfig = await resolveWorkspaceEmbeddingConfig(contextRecord.workspaceId);
    const embeddings = buildEmbeddings(embeddingConfig);

    // Truncate before embedding so an oversized paste can't blow the model's
    // token limit (and crash langchain). RAG only needs the query's intent.
    const safeQueryText = queryText.slice(0, MAX_EMBED_QUERY_CHARS);
    if (queryText.length > MAX_EMBED_QUERY_CHARS) {
      logger.info(
        `queryContexts: truncated query from ${queryText.length} to ${MAX_EMBED_QUERY_CHARS} chars before embedding.`,
      );
    }

    const vector = await embeddings.embedQuery(safeQueryText);
    const points = await queryVectors(contextIds, vector, limit);

    // Track AI Usage centrally for querying embeddings
    {
      const estimatedTokens = Math.ceil(safeQueryText.length / 4);
      aiUsageService
        .logUsage({
          userId: contextRecord.userId,
          workspaceId: contextRecord.workspaceId,
          feature: "DOC",
          provider: embeddingConfig.baseURL ? "openrouter" : "openai",
          model: embeddingConfig.model,
          inputTokens: estimatedTokens,
          outputTokens: 0,
        })
        .catch((err) => logger.warn("Failed to log embedding query usage:", err));
    }

    return points
      .map((p: ContextVectorPoint) => p.payload?.text)
      .filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0);
  } catch (error) {
    logger.error("Failed to query context vectors", error);
    return [];
  }
};
