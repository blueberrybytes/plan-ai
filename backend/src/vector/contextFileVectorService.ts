import type { Express } from "express";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";
import {
  deleteVectorsByContext,
  deleteVectorsByFile,
  ensureContextCollection,
  upsertContextVectors,
  queryVectors,
  type ContextVectorPoint,
} from "./contextVectorStore";
import { v4 as uuidv4 } from "uuid";
import { extractTextFromUpload, isSupportedUploadMimeType } from "../utils/documentTextExtractor";

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
const EMBEDDING_DIMENSION = Number.parseInt(process.env.OPENAI_EMBEDDING_DIMENSION ?? "1536", 10);
const TEXT_CHUNK_SIZE = Number.parseInt(process.env.CONTEXT_VECTOR_CHUNK_SIZE ?? "800", 10);
const TEXT_CHUNK_OVERLAP = Number.parseInt(process.env.CONTEXT_VECTOR_CHUNK_OVERLAP ?? "160", 10);

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: EnvUtils.get("OPENAI_API_KEY"),
  model: EMBEDDING_MODEL,
});

const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: TEXT_CHUNK_SIZE,
  chunkOverlap: TEXT_CHUNK_OVERLAP,
});

const ensureCollectionIfNeeded = async (): Promise<void> => {
  await ensureContextCollection(EMBEDDING_DIMENSION);
};

export const initializeContextVectorStore = ensureCollectionIfNeeded;

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

export const indexContextFileVectors = async (args: IndexContextFileVectorsArgs): Promise<void> => {
  const { contextId, fileId, fileName, mimeType, file } = args;

  try {
    const rawText = await extractTextForContextFile(file);

    if (!rawText || rawText.trim().length === 0) {
      logger.info(
        `Skipping vector index for context file ${fileId}; no extractable text (mime: ${mimeType}).`,
      );
      return;
    }

    const normalizedText = rawText.trim();
    const rawChunks = await textSplitter.splitText(normalizedText);
    const chunks = normalizeChunks(rawChunks).map((chunk) => `[File: ${fileName}]\n${chunk}`);

    if (chunks.length === 0) {
      logger.info(
        `Skipping vector index for context file ${fileId}; text splitter produced no chunks.`,
      );
      return;
    }

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
  } catch (error) {
    logger.error(`Failed to index context file ${fileId} for context ${contextId}`, error);
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
    const vector = await embeddings.embedQuery(queryText);
    const points = await queryVectors(contextIds, vector, limit);

    return points
      .map((p: ContextVectorPoint) => p.payload.text)
      .filter((t: unknown): t is string => typeof t === "string" && t.length > 0);
  } catch (error) {
    logger.error("Failed to query context vectors", error);
    return [];
  }
};
