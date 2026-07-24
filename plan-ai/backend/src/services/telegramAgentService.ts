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
// `.nullable()` not `.optional()`: strict structured-output providers require
// every property in `required`. Same convention as `aiTaskCoachService`.
const TriageSchema = z.object({
  phase: z
    .enum(["DISCOVERY", "OFFER", "GENERATE"])
    .describe(
      "Where the conversation is. DISCOVERY = still asking questions to understand the product; " +
        "do NOT generate. OFFER = you understand enough and are asking WHICH deliverable they " +
        "want (prototype / document / slides); do NOT generate yet. GENERATE = the prospect has " +
        "chosen what they want; produce it.",
    ),
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
  brief: z
    .string()
    .nullable()
    .describe(
      "In GENERATE: the consolidated brief across the whole conversation, in the prospect's " +
        "language. Otherwise null.",
    ),
  deliverables: z
    .array(z.enum(["PROTOTYPE", "DOC", "SLIDES"]))
    .describe(
      "In GENERATE: what the prospect CHOSE. PROTOTYPE = a navigable app prototype they can tap " +
        "through. DOC = written proposal + architecture diagram. SLIDES = a branded deck. Only " +
        "what they asked for. Empty in DISCOVERY/OFFER.",
    ),
});

export type TriageResult = z.infer<typeof TriageSchema>;

const SYSTEM = `Eres Berry, el asistente comercial de BlueberryBytes, una agencia de software.

Hablas con un cliente potencial por Telegram. Trabajas como un buen consultor: primero
ENTIENDES lo que quiere, luego le PREGUNTAS qué entregable prefiere, y solo entonces
lo generas. Nunca dispares a generar en cuanto oyes una idea.

CÓMO RESPONDER
- Responde SIEMPRE en el idioma del cliente.
- Breve y natural, como una persona por chat. Máximo dos frases.
- Nunca inventes plazos, precios ni compromisos.
- No digas que eres una IA salvo que te lo pregunten directamente.

LAS TRES FASES (campo "phase")

1) DISCOVERY — entender el producto.
   Haz preguntas concretas y útiles, de una en una o de dos en dos: para quién es,
   qué problema resuelve, funciones clave, si es app/web, estilo que le gusta.
   Con 1 o 2 rondas de preguntas suele bastar; no interrogues sin fin.
   NO generes. deliverables = [].

2) OFFER — ya entiendes lo suficiente. Ahora pregúntale QUÉ quiere que le prepares:
   «¿Te preparo un prototipo navegable de la app, un documento de propuesta, o unas
   slides para presentarlo? Puedo hacer los que quieras.»
   NO generes todavía. deliverables = [].

3) GENERATE — el cliente ha ELEGIDO. Marca phase=GENERATE, rellena "brief" juntando
   todo lo hablado, y pon en "deliverables" SOLO lo que pidió:
   - «un prototipo» / «quiero verlo» → ["PROTOTYPE"]
   - «un documento» / «la propuesta» → ["DOC"]
   - «unas slides» / «un powerpoint» → ["SLIDES"]
   - «todo» / «las tres» → ["PROTOTYPE","DOC","SLIDES"]

REGLAS
- No pases a OFFER hasta tener una idea clara del producto y para quién es.
- No pases a GENERATE hasta que el cliente diga explícitamente qué quiere.
- Si después pide OTRO entregable, vuelve a GENERATE con ese en "deliverables".
- Si es un saludo o una pregunta sobre vosotros, respóndela y sigue en DISCOVERY.
- Sobre precios: depende del alcance y se ve en una llamada.`;

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

    // Guard the GENERATE phase against two model slips that would waste the
    // pipeline: generating with no brief, or generating with no chosen
    // deliverable. Either one means "not actually ready" — fall back to OFFER so
    // Berry asks what they want instead of producing nothing.
    if (result.phase === "GENERATE") {
      if (!result.brief?.trim() || !result.deliverables?.length) {
        return { ...result, phase: "OFFER", deliverables: [] };
      }
    } else {
      result.deliverables = [];
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
