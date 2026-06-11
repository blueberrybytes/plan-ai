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
 * Parses a raw Qdrant payload (Record<string, unknown>) into a typed ContextVectorPayload.
 * Returns null if required fields are missing or have the wrong type — avoids unsafe casts.
 */
function parsePayload(
  raw: Record<string, unknown> | null | undefined,
): ContextVectorPayload | null {
  if (!raw) return null;
  const { contextId, fileId, chunkIndex, text, sourceFileName, mimeType } = raw;
  if (
    typeof contextId !== "string" ||
    typeof fileId !== "string" ||
    typeof chunkIndex !== "number" ||
    typeof text !== "string"
  ) {
    return null;
  }
  return {
    contextId,
    fileId,
    chunkIndex,
    text,
    ...(typeof sourceFileName === "string" ? { sourceFileName } : {}),
    ...(typeof mimeType === "string" ? { mimeType } : {}),
  };
}

/**
 * Helper: paginate through all Qdrant scroll results for a given filter.
 * Qdrant returns a next_page_offset that must be followed to get all points.
 */
type QdrantScrollResult = Awaited<ReturnType<typeof qdrantClient.scroll>>;

async function scrollAll(
  name: string,
  filter: QdrantFilter,
  pageSize = 1000,
): Promise<ContextVectorPayload[]> {
  const all: ContextVectorPayload[] = [];
  let offset: QdrantScrollResult["next_page_offset"] = undefined;

  // Retry helper for transient network errors (e.g. Railway ECONNREFUSED hiccups)
  const scrollWithRetry = async (retries = 3, delayMs = 1000): Promise<QdrantScrollResult> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await qdrantClient.scroll(name, {
          filter,
          limit: pageSize,
          with_payload: true,
          with_vector: false,
          ...(offset !== undefined ? { offset } : {}),
        });
      } catch (err) {
        const isTransient =
          err instanceof Error &&
          (err.message.includes("ECONNREFUSED") ||
            err.message.includes("fetch failed") ||
            err.message.includes("ECONNRESET") ||
            err.message.includes("ETIMEDOUT"));

        if (isTransient && attempt < retries) {
          const wait = delayMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s
          logger.warn(
            `[scrollAll] Qdrant transient error (attempt ${attempt}/${retries}), retrying in ${wait}ms: ${(err as Error).message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, wait));
        } else {
          throw err;
        }
      }
    }
    // Should never be reached (always returns or throws), but required by TS
    throw new Error("[scrollAll] Retry loop exhausted unexpectedly");
  };

  do {
    const page = await scrollWithRetry();

    if (page.points && page.points.length > 0) {
      for (const p of page.points) {
        const parsed = parsePayload(p.payload as Record<string, unknown> | null | undefined);
        if (parsed) all.push(parsed);
      }
    }

    offset = page.next_page_offset ?? undefined;
  } while (offset !== undefined && offset !== null);

  return all;
}

/**
 * Retrieves all context chunks for the given contextIds without applying vector similarity matching.
 * This is used for "FULL_INJECTION" strategies where the context fits entirely inside the LLM prompt.
 * Uses paginated scrolling so large contexts (>1000 Qdrant points) are returned in full.
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
    const payloads = await scrollAll(name, filter);

    // Sort by file and chunk index so the text flows naturally
    payloads.sort((a, b) => {
      if (a.fileId === b.fileId) return a.chunkIndex - b.chunkIndex;
      return a.fileId.localeCompare(b.fileId);
    });

    return payloads.map((p) => p.text);
  } catch (error) {
    logger.error("Failed to scroll full context payloads from Qdrant", error);
    return [];
  }
};

/**
 * Retrieves only the chunks for a specific fileId within a context.
 * Used by investigateRepoWithCache to fetch the repomix XML without mixing in
 * other context files (PDFs, transcripts, text docs) from the same project context.
 */
export const getRepomixContextPayloads = async (
  contextIds: string[],
  fileId: string,
): Promise<string[]> => {
  if (!contextIds || contextIds.length === 0 || !fileId) {
    return [];
  }

  const filter: QdrantFilter = {
    must: [
      {
        key: "fileId",
        match: { value: fileId },
      } as QdrantMatch,
      ...contextIds.map((cid) => ({ key: "contextId", match: { value: cid } }) as QdrantMatch),
    ],
  };

  const name = getContextCollectionName();

  try {
    const payloads = await scrollAll(name, filter);

    // Sort by chunk index to preserve document order
    payloads.sort((a, b) => a.chunkIndex - b.chunkIndex);

    return payloads.map((p) => p.text);
  } catch (error) {
    logger.error("Failed to scroll repomix payloads from Qdrant", error);
    return [];
  }
};
