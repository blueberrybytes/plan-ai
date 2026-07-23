/**
 * Localization for Berry's FIXED chrome — the canned messages, deck section
 * titles and prototype fallback screen.
 *
 * The AI-generated content (triage replies, the proposal, the prototypes) is
 * already produced in the prospect's language because every generation prompt
 * asks for it. Only the hardcoded strings needed translating, and this is them.
 *
 * Language comes from Telegram's `from.language_code` (an IETF tag it sends on
 * every message), so the very first message is already in the right language —
 * no detection call, no guessing. English is the default, since most prospects
 * are English-speaking; add a locale by extending `STRINGS`.
 */

export type Lang = "en" | "es";
const DEFAULT_LANG: Lang = "en";

/** Normalizes an IETF tag ("en-US", "es-ES", "ca") to a supported locale. */
export const resolveLang = (languageCode?: string): Lang => {
  const base = (languageCode ?? "").slice(0, 2).toLowerCase();
  // Catalan prospects read Spanish; group them rather than fall back to English.
  if (base === "es" || base === "ca") return "es";
  if (base === "en") return "en";
  return DEFAULT_LANG;
};

export interface BerryStrings {
  greeting: string;
  tooShort: string;
  rateLimited: string;
  failed: string;
  partial: string;
  transcriptionFailed: string;
  emptyAudio: string;
  textOnly: string;
  listening: string;
  preparing: string;
  prototypesReady: string;
  chooseDesign: string;
  docCaption: string;
  viewOnline: string;
  viewProposalLabel: string;
  openPrototypeLabel: (variant: string) => string;
  designOption: (variant: string) => string;
  /** Human label for a variant key, e.g. "Claro" → "Light" in English. */
  variantLabel: (variantKey: string) => string;
  // Deck section titles.
  deckSubtitle: string;
  deckChallenge: string;
  deckScope: string;
  deckArchitecture: string;
  // Prototype fallback screen.
  fallbackTitle: string;
  fallbackBody: string;
  fallbackBack: string;
}

const VARIANT_LABELS: Record<string, { en: string; es: string }> = {
  Claro: { en: "Light", es: "Claro" },
  Oscuro: { en: "Dark", es: "Oscuro" },
};

const en: BerryStrings = {
  greeting:
    "Hi 👋 I'm Berry, the assistant at BlueberryBytes.\n\n" +
    "Tell me what product you have in mind — a couple of sentences is enough — and in under a " +
    "minute I'll send you a proposal with its document and an architecture diagram.\n\n" +
    "Example: “I want an app for my waiters to take orders that go straight to the kitchen.”",
  tooShort:
    "Tell me a bit more and I'll put the proposal together 🙂 " +
    "A sentence or two about what you want to build and who it's for is enough.",
  rateLimited:
    "You've reached today's limit of proposals. " +
    "Write to us at hola@blueberrybytes.com and we'll carry on there 🙂",
  failed:
    "That one got the better of me. Someone on the team will review it and get back to you — " +
    "or write to us at hola@blueberrybytes.com.",
  partial:
    "I've sent you the designs, but the document gave me trouble. " +
    "A human will review it and get it to you today.",
  transcriptionFailed: "I couldn't quite hear that audio 😕 Could you type it out for me?",
  emptyAudio:
    "I couldn't make out anything in the audio — it may have cut out, or been in a language I " +
    "don't handle yet. Could you type it?",
  textOnly: "For now I only understand text — send me the idea in writing and I'll prepare it 🙂",
  listening: "Listening to your audio 🎧",
  preparing: "Great, give me a few seconds and I'll put the proposal together ⚙️",
  prototypesReady:
    "And here they are, navigable, so you can open them on your phone. " +
    "They're prototypes to set the direction — the final design is worked out with you.",
  chooseDesign:
    "Which one fits you better, light or dark? It's a sketch to set the direction — " +
    "the final design is worked out with you.",
  docCaption:
    "Here's the proposal. Generated with AI and reviewed by our team before any commitment — " +
    "if it fits, we'll build you the prototype.",
  viewOnline: "You can also view it online, with the diagram included.",
  viewProposalLabel: "View the proposal",
  openPrototypeLabel: (v) => `Open ${v} prototype`,
  designOption: (v) => `${v} option`,
  variantLabel: (key) => VARIANT_LABELS[key]?.en ?? key,
  deckSubtitle: "Preliminary proposal · BlueberryBytes",
  deckChallenge: "The challenge",
  deckScope: "Proposed scope",
  deckArchitecture: "Architecture",
  fallbackTitle: "Screen under construction",
  fallbackBody:
    "This part of the flow is built in the final project. This is a prototype to set the direction.",
  fallbackBack: "Back",
};

const es: BerryStrings = {
  greeting:
    "Hola 👋 Soy Berry, el asistente de BlueberryBytes.\n\n" +
    "Cuéntame qué producto tienes en mente — con un par de frases me vale — y en menos de un minuto " +
    "te devuelvo una propuesta con su documento y un diagrama de arquitectura.\n\n" +
    "Ejemplo: «Quiero una app para que mis camareros tomen comandas y vayan directas a cocina.»",
  tooShort:
    "Cuéntame un poco más y te preparo la propuesta 🙂 " +
    "Con una o dos frases sobre qué quieres construir y para quién es suficiente.",
  rateLimited:
    "Has llegado al límite de propuestas por hoy. " +
    "Escríbenos a hola@blueberrybytes.com y seguimos por ahí 🙂",
  failed:
    "Se me ha atragantado esta. Un humano del equipo lo revisa y te contesta — " +
    "o escríbenos a hola@blueberrybytes.com.",
  partial:
    "Te he mandado los bocetos, pero el documento se me ha resistido. " +
    "Lo revisa un humano y te lo hacemos llegar hoy mismo.",
  transcriptionFailed: "No he podido escuchar bien ese audio 😕 ¿Me lo escribes en un mensaje?",
  emptyAudio:
    "No he entendido nada en el audio — puede que se cortara o que hablaras en un idioma " +
    "que aún no tengo activado. ¿Me lo escribes?",
  textOnly: "De momento solo entiendo texto — mándame la idea escrita y te la preparo 🙂",
  listening: "Escuchando tu audio 🎧",
  preparing: "Perfecto, dame unos segundos y te preparo la propuesta ⚙️",
  prototypesReady:
    "Y aquí los tienes navegables, para que los abras en el móvil. " +
    "Son prototipos para fijar la dirección — el diseño final se trabaja contigo.",
  chooseDesign:
    "¿Cuál te encaja más, la clara o la oscura? Es un boceto para fijar la dirección — " +
    "el diseño final se trabaja contigo.",
  docCaption:
    "Aquí tienes la propuesta. Generada con IA y revisada por nuestro equipo antes de " +
    "cualquier compromiso — si te encaja, te preparamos el prototipo.",
  viewOnline: "También puedes verla online, con el diagrama incluido.",
  viewProposalLabel: "Ver la propuesta",
  openPrototypeLabel: (v) => `Abrir prototipo ${v}`,
  designOption: (v) => `Opción ${v}`,
  variantLabel: (key) => VARIANT_LABELS[key]?.es ?? key,
  deckSubtitle: "Propuesta preliminar · BlueberryBytes",
  deckChallenge: "El reto",
  deckScope: "Alcance propuesto",
  deckArchitecture: "Arquitectura",
  fallbackTitle: "Pantalla en construcción",
  fallbackBody:
    "Esta parte del flujo se desarrolla en el proyecto final. Es un prototipo para fijar la dirección.",
  fallbackBack: "Volver",
};

const STRINGS: Record<Lang, BerryStrings> = { en, es };

export const berryStrings = (lang: Lang): BerryStrings => STRINGS[lang];
