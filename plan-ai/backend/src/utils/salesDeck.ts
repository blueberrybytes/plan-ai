import PptxGenJS from "pptxgenjs";
import { logger } from "../utils/logger";

/**
 * Minimal branded deck for the "Berry" Telegram intake.
 *
 * NOT a port of `frontend/src/services/pptxExportService.ts`. That file (1469
 * lines) serves the slide editor: 14 slide types, dynamic font fitting, image
 * proxying, per-template layouts. Copying it here would create a second copy to
 * keep in sync — the exact drift this codebase already paid for once with the
 * Mermaid rules (see `prompts/mermaidRules.ts`).
 *
 * The sales flow needs four slides and the workspace's colours. That is a
 * different, smaller artifact, so it gets its own small generator. If the bot
 * ever needs the editor's full range, extract that file into a shared workspace
 * package rather than duplicating it — note that CRA blocks imports from
 * outside `frontend/src`, so a plain shared folder will not work.
 */

export interface DeckTheme {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
}

export const DEFAULT_DECK_THEME: DeckTheme = {
  primaryColor: "#4361EE",
  secondaryColor: "#a78bfa",
  backgroundColor: "#ffffff",
  textColor: "#0f172a",
  headingFont: "Inter",
  bodyFont: "Inter",
};

/** Section titles, localized by the caller so the deck matches the prospect. */
export interface DeckLabels {
  subtitle: string;
  challenge: string;
  scope: string;
  architecture: string;
}

const DEFAULT_LABELS: DeckLabels = {
  subtitle: "Preliminary proposal · BlueberryBytes",
  challenge: "The challenge",
  scope: "Proposed scope",
  architecture: "Architecture",
};

export interface SalesDeckInput {
  title: string;
  /** Short framing of the client's problem, 1–3 sentences. */
  summary: string;
  /** Scope bullets — trimmed to `MAX_BULLETS` so the slide stays readable. */
  scope: string[];
  /** Rendered architecture diagram, if one survived generation. */
  diagramPng?: Buffer | null;
  theme?: DeckTheme;
  labels?: DeckLabels;
}

const MAX_BULLETS = 6;
const MAX_BULLET_CHARS = 140;

/** pptxgenjs wants bare hex, no leading `#`. */
const hex = (color: string, fallback: string): string => {
  const clean = (color || "").replace("#", "").trim();
  return /^[0-9a-fA-F]{6}$/.test(clean) ? clean.toUpperCase() : fallback;
};

/**
 * Fonts must exist on the CLIENT machine, not ours. A theme naming a webfont
 * would silently render as Times New Roman in PowerPoint, so anything we don't
 * recognise falls back to a face that ships with Office on both platforms.
 */
const SAFE_FONTS = new Set([
  "Arial",
  "Calibri",
  "Georgia",
  "Helvetica",
  "Times New Roman",
  "Verdana",
]);
const safeFont = (font: string): string => (SAFE_FONTS.has(font) ? font : "Calibri");

export const buildSalesDeck = async (input: SalesDeckInput): Promise<Buffer> => {
  const theme = input.theme ?? DEFAULT_DECK_THEME;

  const primary = hex(theme.primaryColor, "4361EE");
  const background = hex(theme.backgroundColor, "FFFFFF");
  const text = hex(theme.textColor, "0F172A");
  const heading = safeFont(theme.headingFont);
  const body = safeFont(theme.bodyFont);
  const labels = input.labels ?? DEFAULT_LABELS;

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "BlueberryBytes";
  pptx.company = "BlueberryBytes";

  // ─── 1. Title ───────────────────────────────────────────────────────────────
  const cover = pptx.addSlide();
  cover.background = { color: primary };
  cover.addText(input.title, {
    x: 0.8,
    y: 2.0,
    w: 8.4,
    h: 1.4,
    fontSize: 40,
    bold: true,
    color: "FFFFFF",
    fontFace: heading,
  });
  cover.addText(labels.subtitle, {
    x: 0.8,
    y: 3.4,
    w: 8.4,
    h: 0.5,
    fontSize: 16,
    color: "FFFFFF",
    fontFace: body,
  });

  // ─── 2. Summary ─────────────────────────────────────────────────────────────
  const summary = pptx.addSlide();
  summary.background = { color: background };
  summary.addText(labels.challenge, {
    x: 0.8,
    y: 0.6,
    w: 8.4,
    h: 0.6,
    fontSize: 28,
    bold: true,
    color: primary,
    fontFace: heading,
  });
  summary.addText(input.summary, {
    x: 0.8,
    y: 1.5,
    w: 8.4,
    h: 3.0,
    fontSize: 16,
    color: text,
    fontFace: body,
    valign: "top",
  });

  // ─── 3. Scope ───────────────────────────────────────────────────────────────
  if (input.scope.length) {
    const scope = pptx.addSlide();
    scope.background = { color: background };
    scope.addText(labels.scope, {
      x: 0.8,
      y: 0.6,
      w: 8.4,
      h: 0.6,
      fontSize: 28,
      bold: true,
      color: primary,
      fontFace: heading,
    });
    scope.addText(
      input.scope.slice(0, MAX_BULLETS).map((item) => ({
        text: item.slice(0, MAX_BULLET_CHARS),
        options: { bullet: true, fontSize: 15, color: text, fontFace: body, breakLine: true },
      })),
      { x: 0.9, y: 1.5, w: 8.2, h: 3.4, valign: "top" },
    );
  }

  // ─── 4. Architecture ────────────────────────────────────────────────────────
  if (input.diagramPng?.length) {
    const arch = pptx.addSlide();
    arch.background = { color: background };
    arch.addText(labels.architecture, {
      x: 0.8,
      y: 0.4,
      w: 8.4,
      h: 0.5,
      fontSize: 24,
      bold: true,
      color: primary,
      fontFace: heading,
    });
    // `contain` keeps a tall diagram from being stretched into illegibility.
    arch.addImage({
      data: `image/png;base64,${input.diagramPng.toString("base64")}`,
      x: 0.6,
      y: 1.1,
      w: 8.8,
      h: 3.9,
      sizing: { type: "contain", w: 8.8, h: 3.9 },
    });
  }

  const output = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  logger.info(`[salesDeck] built deck "${input.title}" (${output.length}B)`);
  return output;
};
