import { generateText, Output } from "ai";
import { z } from "zod";
import {
  getWorkspaceModel,
  getStructuredProviderOptions,
  FAST_AI_MODEL,
} from "../utils/aiModelUtils";
import { logger } from "../utils/logger";

/**
 * Conversational triage for Berry.
 *
 * Replaces the original two-branch rule (under 25 chars → canned reply, over →
 * generate). That rule never read the message, so "hola", "¿hablas inglés?" and
 * "quiero una app" all got the same answer, and an idea split across two
 * messages could never accumulate into a brief.
 *
 * One cheap call per message decides what the prospect actually wants and what
 * to say back. The expensive pipeline (doc + diagram + mockups + deck) still
 * only fires when there is a real brief — chat is cheap, generation is not.
 */

/** Turns kept for context. Enough to accumulate a brief, short enough to stay cheap. */
const HISTORY_LIMIT = 10;

export interface ConversationTurn {
  role: "user" | "bot";
  text: string;
}

// `.nullable()` not `.optional()`: strict structured-output providers require
// every property in `required`. Same convention as `aiTaskCoachService`.
const TriageSchema = z.object({
  intent: z
    .enum(["GREETING", "QUESTION", "BRIEF", "NEEDS_MORE", "OFF_TOPIC", "FOLLOW_UP"])
    .describe("What the prospect is doing in their latest message"),
  language: z
    .enum(["en", "es"])
    .describe(
      "The language the prospect is WRITING in — read it from their messages, NOT from any " +
        "hint about their app settings. If they write in English, this is 'en' even if their " +
        "device is Spanish.",
    ),
  reply: z
    .string()
    .describe("What to say back, in the prospect's language. Conversational, max 2 sentences."),
  readyToGenerate: z
    .boolean()
    .describe("True ONLY when there is enough detail to produce a real proposal"),
  brief: z
    .string()
    .nullable()
    .describe(
      "When readyToGenerate is true: the consolidated brief across the whole conversation, in the prospect's language. Otherwise null.",
    ),
  deliverables: z
    .array(z.enum(["DOC", "MOCKUPS", "SLIDES"]))
    .describe(
      "What to actually produce. DOC = written proposal + architecture diagram. " +
        "MOCKUPS = two screen designs to choose from. SLIDES = a branded deck. " +
        "Honour an explicit request ('mándame unas slides', 'quiero ver cómo quedaría'); " +
        "otherwise return all three.",
    ),
});

export type TriageResult = z.infer<typeof TriageSchema>;

const SYSTEM = `Eres Berry, el asistente comercial de BlueberryBytes, una agencia de software.

Hablas con un cliente potencial por Telegram. Tu trabajo es entender qué producto
quiere y, cuando tengas suficiente, avisar de que ya se puede generar la propuesta.

CÓMO RESPONDER
- Responde SIEMPRE en el idioma del cliente.
- Breve y natural, como una persona por chat. Máximo dos frases.
- Nunca inventes plazos, precios ni compromisos.
- No digas que eres una IA salvo que te lo pregunten directamente.

QUÉ MARCAR
- GREETING: saludo o presentación. Preséntate y pregunta qué quiere construir.
- QUESTION: pregunta sobre vosotros, el proceso, idiomas, precios. Respóndela con
  naturalidad y reconduce hacia qué quiere construir. Sobre precios: depende del
  alcance y se ve en una llamada.
- BRIEF: describe un producto con suficiente detalle (qué es, para quién o para qué).
  Marca readyToGenerate=true y rellena "brief".
- NEEDS_MORE: menciona algo pero es demasiado vago para diseñar nada
  ("quiero una app", "algo para mi negocio"). Haz UNA pregunta concreta que
  desbloquee: para quién es, o qué problema resuelve.
- FOLLOW_UP: reacciona a algo que YA le has enviado. Muy habitual: acabas de
  mandarle dos diseños (Claro y Oscuro) y responde eligiendo ("el oscuro", "me
  gusta el claro", "el segundo"), o comenta la propuesta. Mira el historial: si
  ya has entregado algo, un mensaje corto casi siempre es esto, NO un tema nuevo.
- OFF_TOPIC: nada que ver. Reconduce con amabilidad.

CÓMO TRATAR UN FOLLOW_UP
- readyToGenerate=false SIEMPRE (ya está generado; no lo repitas).
- Si elige un diseño: alégrate, confírmale su elección por su nombre ("¡genial,
  nos quedamos con el oscuro!") y ofrece el siguiente paso — una llamada rápida
  con el equipo para concretar. Nunca le pidas que vuelva a describir la idea.
- Si comenta o pide un cambio: reconócelo y dile que lo revisa el equipo.

CUÁNDO GENERAR
Sé generoso: si sabes QUÉ se construye y PARA QUIÉN, ya es suficiente. No
interrogues al cliente. Dos o tres intercambios como mucho.
Si en varios mensajes ha ido dando detalles sueltos, JÚNTALOS en "brief" — el
cliente no tiene por qué repetirlo todo en un solo mensaje.
NUNCA vuelvas a generar por un mensaje corto de reacción: eso es FOLLOW_UP.`;

/** Formats history for the prompt. */
const renderHistory = (history: ConversationTurn[]): string =>
  history.length
    ? history
        .map((turn) => `${turn.role === "user" ? "Cliente" : "Berry"}: ${turn.text}`)
        .join("\n")
    : "(primer mensaje)";

/**
 * Decides what to do with one incoming message.
 *
 * Returns null when triage fails, so the caller can fall back rather than leave
 * the prospect on read.
 */
export const triageMessage = async (
  message: string,
  history: ConversationTurn[],
  workspaceId: string,
  languageCode?: string,
): Promise<TriageResult | null> => {
  try {
    const model = await getWorkspaceModel(workspaceId, FAST_AI_MODEL);

    const response = await generateText({
      model,
      providerOptions: getStructuredProviderOptions(FAST_AI_MODEL),
      output: Output.object({
        name: "BerryTriage",
        description: "Decide how Berry should respond to this prospect message.",
        schema: TriageSchema,
      }),
      system: SYSTEM,
      prompt:
        // language_code is only a WEAK tiebreaker for a message too short to
        // read (e.g. "ok"). It must never override the language they visibly
        // write in — that was the bug where an English chat got Spanish replies.
        (languageCode
          ? `(Pista débil, solo si el mensaje es ambiguo — idioma del dispositivo: ${languageCode}. Ignórala si el texto está claramente en otro idioma.)\n\n`
          : "") +
        `CONVERSACIÓN HASTA AHORA:\n${renderHistory(history)}\n\nÚLTIMO MENSAJE DEL CLIENTE:\n${message}`,
      temperature: 0.5,
      abortSignal: AbortSignal.timeout(15_000),
    });

    const result = response.output as TriageResult;
    if (!result?.reply?.trim()) return null;

    // A model that omits `deliverables` (or returns []) would silently produce
    // nothing at all — the prospect would get a "here you go" and no files.
    if (!result.deliverables?.length) {
      result.deliverables = ["DOC", "MOCKUPS", "SLIDES"];
    }

    // A model can set readyToGenerate without producing a brief; generating from
    // an empty string would burn the pipeline on nothing.
    if (result.readyToGenerate && !result.brief?.trim()) {
      return { ...result, readyToGenerate: false };
    }

    return result;
  } catch (err) {
    logger.warn("[telegram] triage failed", err);
    return null;
  }
};

/** Appends a turn and trims to the retention window. */
export const appendTurn = (
  history: ConversationTurn[],
  role: ConversationTurn["role"],
  text: string,
): ConversationTurn[] => [...history, { role, text }].slice(-HISTORY_LIMIT);

/** Reads history off the stored JSON column, tolerating anything malformed. */
export const parseConversation = (value: unknown): ConversationTurn[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (turn): turn is ConversationTurn =>
      Boolean(turn) &&
      typeof turn === "object" &&
      typeof (turn as ConversationTurn).text === "string" &&
      ((turn as ConversationTurn).role === "user" || (turn as ConversationTurn).role === "bot"),
  );
};
