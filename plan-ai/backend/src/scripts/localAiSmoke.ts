/**
 * End-to-end check of the self-hosted LLM and embeddings, through the same
 * functions production uses.
 *
 *   LLM_PROVIDER=local EMBEDDINGS_PROVIDER=local yarn local-ai:smoke
 *
 * 1. Structured extraction with a schema, like task extraction does
 *    (Output.object, which the local server must honour as json_schema).
 * 2. Streaming chat, like the chat panel.
 * 3. Embeddings, and a round trip through the Qdrant collection that local
 *    vectors get (created, written, searched, cleaned up).
 */
import { generateText, Output, streamText } from "ai";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import {
  DEFAULT_AI_MODEL,
  FAST_AI_MODEL,
  getConfiguredModel,
  getStructuredProviderOptions,
  resolveWorkspaceEmbeddingConfig,
} from "../utils/aiModelUtils";
import { getEmbeddingsProvider, getLlmProvider, getLocalLlmConfig } from "../utils/localAi";
import { buildEmbeddings } from "../vector/contextFileVectorService";
import {
  deleteVectorsByContext,
  ensureContextCollection,
  queryVectors,
  upsertContextVectors,
} from "../vector/contextVectorStore";
import { getContextCollectionName } from "../vector/qdrantClient";

const TRANSCRIPT = `User 0: Buenos días. Repasamos el estado del proyecto.
Others 0: La integración con Twenty sigue fallando con algunas empresas, hay que revisarla esta semana.
User 0: Vale. Marta, ¿te encargas tú de los tickets de Jira?
Others 1: Sí, los reviso el miércoles. Además el cliente de Dubái quiere una demo el jueves a las diez.
User 0: Perfecto, yo preparo la demo. Y necesitamos que la transcripción funcione en local.`;

const TaskSchema = z.object({
  summary: z.string().describe("Two sentences, in the language of the meeting"),
  language: z.string().describe("ISO code of the meeting's language"),
  tasks: z.array(
    z.object({
      title: z.string(),
      assignee: z.string().nullable(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
      dueDate: z.string().nullable().describe("As said in the meeting, or null"),
    }),
  ),
});

const seconds = (t0: number) => `${((Date.now() - t0) / 1000).toFixed(1)} s`;

const main = async (): Promise<void> => {
  console.log(
    `LLM_PROVIDER=${getLlmProvider()} (${getLocalLlmConfig().model} at ${getLocalLlmConfig().baseUrl})  EMBEDDINGS_PROVIDER=${getEmbeddingsProvider()}`,
  );

  // 1 ── structured extraction
  let t0 = Date.now();
  const extraction = await generateText({
    model: getConfiguredModel(DEFAULT_AI_MODEL),
    providerOptions: getStructuredProviderOptions(DEFAULT_AI_MODEL),
    output: Output.object({ schema: TaskSchema }),
    prompt: `Extract the action items from this meeting transcript.\n\n${TRANSCRIPT}`,
  });
  const parsed = TaskSchema.parse(extraction.output);
  console.log(`\n1. Structured extraction (${seconds(t0)}), schema valid:`);
  console.log(`   summary:  ${parsed.summary}`);
  console.log(`   language: ${parsed.language}`);
  for (const t of parsed.tasks) {
    console.log(
      `   - [${t.priority}] ${t.title} (${t.assignee ?? "sin asignar"}, ${t.dueDate ?? "sin fecha"})`,
    );
  }
  console.log(`   tokens in/out: ${extraction.usage.inputTokens}/${extraction.usage.outputTokens}`);

  // 2 ── streaming chat
  t0 = Date.now();
  const stream = streamText({
    model: getConfiguredModel(FAST_AI_MODEL),
    prompt: `En una frase: ¿quién prepara la demo según esta reunión?\n\n${TRANSCRIPT}`,
  });
  let chunks = 0;
  let answer = "";
  for await (const part of stream.textStream) {
    chunks += 1;
    answer += part;
  }
  console.log(`\n2. Streaming chat (${seconds(t0)}, ${chunks} chunks): ${answer.trim()}`);

  // 3 ── embeddings + Qdrant
  t0 = Date.now();
  const config = await resolveWorkspaceEmbeddingConfig("smoke-workspace");
  const embeddings = buildEmbeddings(config);
  const docs = [
    "El cliente de Dubái quiere una demo el jueves a las diez.",
    "Marta revisará los tickets de Jira el miércoles.",
    "La integración con Twenty falla con algunas empresas.",
  ];
  const vectors = await embeddings.embedDocuments(docs);
  console.log(
    `\n3. Embeddings (${seconds(t0)}): model ${config.model}, ${vectors.length} vectors of ${vectors[0].length} dimensions`,
  );

  const contextId = `smoke-local-ai-${uuidv4()}`;
  await ensureContextCollection(vectors[0].length);
  await upsertContextVectors(
    docs.map((text, i) => ({
      id: uuidv4(),
      vector: vectors[i],
      payload: { contextId, fileId: "smoke", chunkIndex: i, text },
    })),
  );
  const query = "¿Cuándo es la demo para el cliente?";
  const hits = await queryVectors([contextId], await embeddings.embedQuery(query), 1);
  console.log(`   collection ${getContextCollectionName()}`);
  console.log(`   "${query}" -> "${hits[0]?.payload.text}"`);
  await deleteVectorsByContext(contextId);

  const ok =
    parsed.tasks.length > 0 && answer.trim().length > 0 && hits[0]?.payload.text === docs[0];
  console.log(ok ? "\nOK" : "\nSOMETHING IS OFF, see above");
  process.exit(ok ? 0 : 1);
};

main().catch((err) => {
  console.error("local-ai:smoke failed:", err);
  process.exit(1);
});
