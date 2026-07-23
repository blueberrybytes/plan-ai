import { PrismaClient } from "@prisma/client";
import { generateText } from "ai";
import { getWorkspaceModel, getFallbackProviderOptions, DOC_MODEL } from "../utils/aiModelUtils";
import { logger } from "../utils/logger";
import {
  finalizePrototypeHtml,
  hasStructuralErrors,
  sanitizePrototypeHtml,
} from "../utils/htmlSanitize";
import { berryStrings, resolveLang } from "./telegramI18n";

const prisma = new PrismaClient();

/**
 * Generates navigable HTML prototypes from a prospect's brief.
 *
 * Why HTML and not another image: a link opens on any phone, renders a real
 * interface the prospect can scroll and tap, and — crucially — needs no headless
 * browser on our side. Screenshotting would have meant pulling Chromium into the
 * backend, reversing the decision recorded in `mermaidRender.ts`.
 *
 * The model writes markup that we then serve from our own domain, so NOTHING it
 * produces is trusted: every generation goes through `sanitizePrototypeHtml`
 * before it is stored, and the viewer renders it inside a locked-down iframe.
 */

/** Retries when the model returns markup that would render as a blank page. */
const MAX_ATTEMPTS = 2;

export interface PrototypeVariant {
  name: string;
  /** Style direction, given to the model verbatim. */
  direction: string;
}

/** Two directions different enough that choosing between them means something. */
export const PROTOTYPE_VARIANTS: PrototypeVariant[] = [
  {
    name: "Claro",
    direction:
      "Fondo blanco, superficie #F8FAFC, acento azul #4361EE, texto #0F172A. " +
      "Limpio y corporativo, mucho aire, esquinas redondeadas de 12px.",
  },
  {
    name: "Oscuro",
    direction:
      "Fondo #12151C, superficie #1B2029, acento violeta #A78BFA, texto #F8FAFC. " +
      "Moderno y compacto, contraste alto, esquinas redondeadas de 12px.",
  },
];

const SYSTEM = `Diseñas prototipos de app en HTML para propuestas comerciales: un flujo de
VARIAS pantallas que el cliente puede recorrer, como un prototipo de Figma.

Devuelves UN ÚNICO documento HTML autocontenido. Nada más: sin explicaciones,
sin bloques de markdown, sin comentarios previos.

NAVEGACIÓN ENTRE PANTALLAS — MUY IMPORTANTE (sin JavaScript)
- Haz de 3 a 4 pantallas. Cada una es un contenedor con id:
  <section class="screen" id="pantalla-inicio">…</section>
- Se navega con enlaces de ancla y el pseudo-selector :target de CSS. Ejemplo:
    .screen { display: none; }
    .screen:target { display: block; }
    #pantalla-inicio { display: block; }   /* la primera visible por defecto */
  Y los botones/enlaces cambian de pantalla así:
    <a href="#pantalla-detalle" class="btn">Ver comanda</a>
- Cada pantalla lleva una barra inferior o botones que llevan a las demás, para
  que el cliente pueda recorrer el flujo entero tocando.
- PROHIBIDO JavaScript. La navegación es SOLO con :target y href="#id".
- Los href SOLO pueden apuntar a un id interno con # (href="#pantalla-x").
  Nunca a una URL externa.

REGLAS TÉCNICAS (obligatorias)
- Todo el CSS va en UN solo bloque <style> al principio. Ciérralo SIEMPRE.
- PROHIBIDO: <script>, atributos onclick/onload/on*, iframes.
- PROHIBIDO: recursos externos — nada de src="http...", fuentes de Google,
  CDNs ni @import. Debe funcionar sin conexión.
- Iconos: SVG inline o caracteres tipográficos simples. Nada de emoji.
- Fuentes: la pila del sistema
  (-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif).
- Cierra SIEMPRE las comillas de atributos y la etiqueta </style>.

MARCO DEL TELÉFONO — evita que el contenido se desborde
- El marco tiene ALTURA FIJA (por ejemplo 800px) y el contenido scrollea DENTRO:
    .phone { width: 380px; height: 800px; margin: 24px auto; border-radius: 32px;
             overflow: hidden; position: relative; display: flex; flex-direction: column; }
    .screen { flex: 1; overflow-y: auto; padding-bottom: 80px; }  /* hueco para la barra */
- Si pones una barra de navegación inferior, va DENTRO del marco y fija abajo:
    .tabbar { position: absolute; bottom: 0; left: 0; right: 0; height: 64px; }
  Y el contenido lleva padding-bottom para que NINGÚN botón quede tapado ni fuera.
- Un botón flotante (FAB) va dentro del marco con position:absolute, nunca fuera.
- NADA puede salirse del marco. Si dudas, reduce contenido antes que desbordar.

REGLAS DE DISEÑO
- Móvil primero: marco de teléfono centrado, ancho máximo 420px.
- Elige las 3-4 pantallas CLAVE del producto y el recorrido natural entre ellas.
  Restaurante de comandas: (1) lista de mesas, (2) detalle de una comanda,
  (3) pantalla de cocina, (4) resumen del turno.
- Datos REALISTAS con el vocabulario del cliente ("Mesa 4 · 2 entrantes", no
  "Elemento 1"). Que reconozca su negocio.
- Escribe TODO en el idioma del cliente.`;

/**
 * Asks the model for one prototype, retrying when the result would render blank.
 */
const generateHtml = async (
  brief: string,
  variant: PrototypeVariant,
  workspaceId: string,
  lang: string,
): Promise<string | null> => {
  const model = await getWorkspaceModel(workspaceId, DOC_MODEL);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await generateText({
        model,
        providerOptions: getFallbackProviderOptions(DOC_MODEL),
        system: SYSTEM,
        prompt:
          `Producto que quiere el cliente:\n${brief}\n\n` +
          `Dirección visual:\n${variant.direction}\n\n` +
          // The prompt framing is Spanish, but the UI text inside the prototype
          // must match the prospect, so it is stated explicitly per request.
          `Escribe TODOS los textos de la interfaz en este idioma: ${lang}.\n\n` +
          `Devuelve solo el HTML.` +
          (attempt > 1
            ? "\n\nIMPORTANTE: el intento anterior salió mal formado. Cierra TODAS las " +
              "etiquetas y comillas, en especial </style>."
            : ""),
        temperature: 0.6,
        // Generating a full multi-screen HTML document is heavy; 45s tripped
        // under load. With the two variants now parallel, a longer per-call
        // budget doesn't add to wall-clock — they still overlap.
        abortSignal: AbortSignal.timeout(60_000),
      });

      const result = sanitizePrototypeHtml(response.text);

      if (!result) {
        logger.warn(`[prototype] intento ${attempt} descartado por el saneado`);
        continue;
      }

      // Structural errors are the ones that swallow the page (an unclosed
      // <style> or attribute quote). Retrying is cheap; a blank prototype in
      // front of a prospect is not.
      if (hasStructuralErrors(result.syntaxErrors)) {
        logger.warn(
          `[prototype] intento ${attempt} con errores estructurales: ${result.syntaxErrors.slice(0, 3).join(", ")}`,
        );
        continue;
      }

      if (result.removed.length) {
        logger.info(`[prototype] saneado eliminó: ${result.removed.join(", ")}`);
      }

      const s = berryStrings(resolveLang(lang));
      return finalizePrototypeHtml(result.html, "Prototipo", {
        title: s.fallbackTitle,
        body: s.fallbackBody,
        back: s.fallbackBack,
      });
    } catch (err) {
      logger.warn(`[prototype] intento ${attempt} falló`, err);
    }
  }

  return null;
};

export interface GeneratedPrototype {
  id: string;
  variant: string;
}

/**
 * Generates and stores both variants. Returns whatever succeeded — one
 * prototype is still worth sending, and zero must not break the proposal.
 */
export const generatePrototypes = async (
  brief: string,
  workspaceId: string,
  userId: string,
  title: string,
  transcriptId?: string,
  lang = "es",
): Promise<GeneratedPrototype[]> => {
  // Both variants in PARALLEL. Generating HTML is the slow step (~30-45s each),
  // and running them sequentially doubled the prospect's wait — long enough to
  // trip the timeout under load. Concurrency makes wall-clock ≈ the slower one.
  const results = await Promise.all(
    PROTOTYPE_VARIANTS.map(async (variant) => {
      const html = await generateHtml(brief, variant, workspaceId, lang);
      if (!html) return null;

      return prisma.prototype.create({
        data: {
          workspaceId,
          userId,
          title,
          html,
          variant: variant.name,
          // Published on creation: the whole point is a link the prospect opens.
          // Only prototypes made for a lead reach this code path.
          isPublic: true,
          transcriptId: transcriptId ?? null,
        },
        select: { id: true, variant: true },
      });
    }),
  );

  const stored: GeneratedPrototype[] = results.filter((r): r is GeneratedPrototype => r !== null);

  return stored;
};

/** Read-only lookup for the public route. Returns null when not published. */
export const findPublicPrototype = async (
  id: string,
): Promise<{ id: string; title: string; html: string; variant: string } | null> => {
  const prototype = await prisma.prototype.findUnique({
    where: { id },
    select: { id: true, title: true, html: true, variant: true, isPublic: true },
  });

  if (!prototype?.isPublic) return null;

  return {
    id: prototype.id,
    title: prototype.title,
    html: prototype.html,
    variant: prototype.variant,
  };
};
