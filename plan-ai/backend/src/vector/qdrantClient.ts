import { getEmbeddingsProvider, getLocalEmbeddingsConfig } from "../utils/localAi";
import { QdrantClient } from "@qdrant/js-client-rest";
import { logger } from "../utils/logger";

const resolveQdrantUrl = (): string => {
  const explicitUrl = process.env.QDRANT_URL;
  if (explicitUrl && explicitUrl.trim().length > 0) {
    return explicitUrl;
  }

  const port = process.env.QDRANT_PORT ?? "6333";
  return `http://127.0.0.1:${port}`;
};

const qdrantUrl = resolveQdrantUrl();
const qdrantApiKey =
  process.env.QDRANT_API_KEY ?? process.env.QDRANT__SERVICE__API_KEY ?? undefined;

if (!qdrantUrl) {
  const message = "Qdrant URL could not be resolved. Set QDRANT_URL or QDRANT_PORT.";
  logger.error(message);
  throw new Error(message);
}

export const qdrantClient = new QdrantClient({
  url: qdrantUrl,
  apiKey: qdrantApiKey,
});

export const getContextCollectionName = (): string => {
  const base = process.env.QDRANT_CONTEXT_COLLECTION ?? "context_files";
  // Local embedding models produce vectors of another size (bge-m3: 1024,
  // OpenAI: 1536), and one collection can't hold both. Each local model gets
  // its own collection, so switching providers never mixes vectors, and
  // switching back finds the original collection untouched.
  if (getEmbeddingsProvider() !== "local") return base;
  const { model, dimension } = getLocalEmbeddingsConfig();
  return `${base}__${model.replace(/[^a-zA-Z0-9_-]/g, "-")}_${dimension}`;
};
