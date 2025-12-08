import { qdrantClient, getContextCollectionName } from "./qdrantClient";
import { logger } from "../utils/logger";

const DEFAULT_DISTANCE = "Cosine";

export type ContextVectorPayload = {
  contextId: string;
  fileId: string;
  chunkIndex: number;
  text: string;
  sourceFileName?: string;
  mimeType?: string;
};

export type ContextVectorPoint = {
  id: string;
  vector: number[];
  payload: ContextVectorPayload;
};

type QdrantMatch = {
  key: string;
  match: {
    value: string | number | boolean;
  };
};

type QdrantFilter = {
  must?: QdrantMatch[];
  should?: QdrantMatch[];
  must_not?: QdrantMatch[];
};

type QdrantCollectionInfo = {
  collections?: Array<{ name: string }>;
};

const toFilterByFile = (contextId: string, fileId: string): QdrantFilter => ({
  must: [
    {
      key: "contextId",
      match: {
        value: contextId,
      },
    } as QdrantMatch,
    {
      key: "fileId",
      match: {
        value: fileId,
      },
    } as QdrantMatch,
  ],
});

const toFilterByContext = (contextId: string): QdrantFilter => ({
  must: [
    {
      key: "contextId",
      match: {
        value: contextId,
      },
    } as QdrantMatch,
  ],
});

const toQdrantPayload = (payload: ContextVectorPayload): Record<string, string | number> => ({
  contextId: payload.contextId,
  fileId: payload.fileId,
  chunkIndex: payload.chunkIndex,
  text: payload.text,
  ...(payload.sourceFileName ? { sourceFileName: payload.sourceFileName } : {}),
  ...(payload.mimeType ? { mimeType: payload.mimeType } : {}),
});

export const ensureContextCollection = async (
  dimension: number,
  distance: "Cosine" | "Dot" | "Euclid" = DEFAULT_DISTANCE,
): Promise<void> => {
  const name = getContextCollectionName();
  const existing = (await qdrantClient.getCollections()) as QdrantCollectionInfo;
  const alreadyExists = existing.collections?.some((c) => c.name === name) ?? false;

  if (alreadyExists) {
    return;
  }

  await qdrantClient.createCollection(name, {
    vectors: {
      size: dimension,
      distance,
    },
  });
  logger.info(`Created Qdrant collection ${name} (dimension=${dimension}, distance=${distance})`);
};

export const upsertContextVectors = async (points: ContextVectorPoint[]): Promise<void> => {
  if (points.length === 0) {
    return;
  }

  const name = getContextCollectionName();
  const payloadPoints = points.map((point) => ({
    id: point.id,
    vector: point.vector,
    payload: toQdrantPayload(point.payload),
  }));

  await qdrantClient.upsert(name, {
    wait: true,
    points: payloadPoints,
  });
};

export const deleteVectorsByFile = async (contextId: string, fileId: string): Promise<void> => {
  const name = getContextCollectionName();
  await qdrantClient.delete(name, {
    wait: true,
    filter: toFilterByFile(contextId, fileId),
  });
};

export const deleteVectorsByContext = async (contextId: string): Promise<void> => {
  const name = getContextCollectionName();
  await qdrantClient.delete(name, {
    wait: true,
    filter: toFilterByContext(contextId),
  });
};
