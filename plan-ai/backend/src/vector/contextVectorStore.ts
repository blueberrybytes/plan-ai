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

export interface QdrantScoredPoint {
  id: string | number;
  version: number;
  score: number;
  payload?: Record<string, unknown> | null;
  vector?: number[] | Record<string, number[]> | null;
}

export const queryVectors = async (
  contextIds: string[],
  vector: number[],
  limit = 5,
): Promise<ContextVectorPoint[]> => {
  if (!contextIds || contextIds.length === 0) {
    return [];
  }

  // Filter to include any of the provided contextIds
  const filter: QdrantFilter = {
    should: contextIds.map((cid) => ({
      key: "contextId",
      match: { value: cid },
    })),
  };

  const name = getContextCollectionName();
  const results = await qdrantClient.search(name, {
    vector,
    filter,
    limit,
    with_payload: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return results.map((res: any) => ({
    id: String(res.id),
    vector: [], // We don't need the vector back usually
    payload: res.payload as unknown as ContextVectorPayload,
  }));
};

/**
 * Retrieves all context chunks for the given contextIds without applying vector similarity matching.
 * This is used for "FULL_INJECTION" strategies where the context fits entirely inside the LLM prompt.
 */
export const getFullContextPayloads = async (contextIds: string[]): Promise<string[]> => {
  if (!contextIds || contextIds.length === 0) {
    return [];
  }

  const filter: QdrantFilter = {
    should: contextIds.map((cid) => ({
      key: "contextId",
      match: { value: cid },
    })),
  };

  const name = getContextCollectionName();

  try {
    const results = await qdrantClient.scroll(name, {
      filter,
      limit: 10000,
      with_payload: true,
      with_vector: false,
    });

    if (!results.points) {
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payloads = results.points.map((p: any) => p.payload as unknown as ContextVectorPayload);

    // Sort by file and chunk index so the text flows naturally
    payloads.sort((a, b) => {
      if (a.fileId === b.fileId) {
        return a.chunkIndex - b.chunkIndex;
      }
      return a.fileId.localeCompare(b.fileId);
    });

    return payloads.map((p) => p.text);
  } catch (error) {
    logger.error("Failed to scroll full context payloads from Qdrant", error);
    return [];
  }
};
