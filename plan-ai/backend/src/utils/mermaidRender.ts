import sharp from "sharp";
import { logger } from "../utils/logger";

/**
 * Server-side Mermaid → PNG rendering for channels that can't run a renderer
 * (Telegram, email). Uses the same `mermaid.ink` service the mobile app already
 * relies on (`plan-ai-mobile/src/components/MermaidViewer.tsx`) rather than
 * pulling a headless browser into the backend.
 */

const MERMAID_INK = "https://mermaid.ink";
const RENDER_TIMEOUT_MS = 15_000;

/** Refuse anything larger than this from the third-party renderer. */
const MAX_RENDER_BYTES = 8 * 1024 * 1024;

/** PNG magic bytes — `\x89PNG`. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/**
 * Pulls fenced ```mermaid blocks out of generated markdown.
 *
 * Doc generation already embeds diagrams inline, so extracting them is cheaper
 * and more consistent than a second LLM call to `diagramGenerationService`.
 */
export const extractMermaidBlocks = (markdown: string): string[] => {
  const blocks: string[] = [];
  for (const match of markdown.matchAll(/```mermaid\s*\n([\s\S]*?)```/g)) {
    const code = match[1]?.trim();
    if (code) blocks.push(code);
  }
  return blocks;
};

/** Strips the fenced diagrams so the same content isn't shown twice. */
export const stripMermaidBlocks = (markdown: string): string =>
  markdown.replace(/```mermaid\s*\n[\s\S]*?```/g, "").replace(/\n{3,}/g, "\n\n");

export interface MermaidTheme {
  primary: string;
  secondary: string;
  text: string;
  background: string;
}

/**
 * Prepends a mermaid `init` directive that recolours the diagram to the brand.
 *
 * Server-side (mermaid.ink) there is no post-render CSS pass like the frontend's
 * `injectMermaidThemeStyles`, so the ONLY way to theme the PNG is this directive.
 * Without it every diagram ships in mermaid's default palette — lavender boxes
 * on pale-yellow subgraphs — which looks generic next to a branded deck.
 *
 * `theme:'base'` is the only built-in theme that honours `themeVariables`.
 */
const applyMermaidTheme = (code: string, theme?: MermaidTheme | null): string => {
  if (!theme) return code;
  // A diagram may already open with its own %%{init}%% — don't stack a second.
  if (/^\s*%%\{\s*init/.test(code)) return code;

  const vars = {
    primaryColor: theme.primary,
    primaryTextColor: theme.text,
    primaryBorderColor: theme.secondary,
    lineColor: theme.secondary,
    secondaryColor: theme.background,
    tertiaryColor: theme.background,
    background: theme.background,
    mainBkg: theme.primary,
    textColor: theme.text,
  };
  return `%%{init: {'theme':'base', 'themeVariables': ${JSON.stringify(vars)}}}%%\n${code}`;
};

/**
 * Renders one diagram to a PNG buffer.
 *
 * Returns null instead of throwing: a broken diagram must never block delivery
 * of the document it came with — losing the picture is recoverable, losing the
 * proposal in front of a prospect is not.
 */
export const renderMermaidToPng = async (
  code: string,
  theme?: MermaidTheme | null,
): Promise<Buffer | null> => {
  try {
    const themed = applyMermaidTheme(code, theme);
    // base64url, NOT base64: the payload sits in a URL *path segment*, and
    // standard base64 emits `+` and `/` — which accented Spanish diagram labels
    // reliably produce. `/` would split the path and silently 404.
    const encoded = Buffer.from(themed, "utf-8").toString("base64url");

    // Ask mermaid.ink for PNG directly rather than fetching SVG and rasterizing
    // it locally. mermaid renders node labels inside <foreignObject>, which
    // librsvg (sharp's SVG backend) does not implement — the old /svg/ path
    // produced boxes and arrows with EVERY LABEL MISSING. Verified: same
    // diagram, 1,006 dark pixels via /svg/+sharp vs 41,173 via /img/?type=png.
    const response = await fetch(`${MERMAID_INK}/img/${encoded}?type=png&width=1600`, {
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
    });

    if (!response.ok) {
      // mermaid.ink answers 400 with the parser error in the body — log it, as
      // it's the same class of syntax failure the prompt rules guard against.
      const detail = await response.text().catch(() => "");
      logger.warn(`[mermaid] render failed (${response.status}): ${detail.slice(0, 200)}`);
      return null;
    }

    const png = Buffer.from(await response.arrayBuffer());

    if (png.length > MAX_RENDER_BYTES) {
      logger.warn(`[mermaid] render exceeded size cap (${png.length}B)`);
      return null;
    }

    // Content-type alone is not enough: an error page served as SVG would sail
    // through and reach Telegram as a broken attachment. Check the actual bytes.
    if (!png.subarray(0, 4).equals(PNG_MAGIC)) {
      logger.warn(
        `[mermaid] renderer returned non-PNG (content-type: ${response.headers.get("content-type")})`,
      );
      return null;
    }

    // mermaid.ink returns a TRANSPARENT background (its `bgColor` param does not
    // change that), and Telegram re-encodes photos as JPEG — which composites
    // transparency onto black, turning dark diagram text invisible. Flatten onto
    // white here. This is sharp operating on a PNG only: no SVG, no text
    // shaping, so it never touches pango (see the U+FE0F abort in salesMockup).
    return await sharp(png).flatten({ background: "#ffffff" }).png().toBuffer();
  } catch (err) {
    logger.warn("[mermaid] render threw", err);
    return null;
  }
};
