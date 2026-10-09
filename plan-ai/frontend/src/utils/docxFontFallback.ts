import JSZip from "jszip";

/**
 * Brand fonts (Outfit, DM Sans, Inter and the rest) come from Google Fonts.
 * Google Docs has them. Word and Pages only have them when the reader
 * installed them, and without a hint they fall back to their default font,
 * which is a serif: a sans-serif brand document opens looking like a letter
 * from a notary.
 *
 * A .docx can say, for each font, what kind it is and which common font to
 * use in its place. The docx library writes an empty font table, so the table
 * is rewritten here after the file is built.
 */

interface Fallback {
  /** OOXML font family: swiss is sans-serif, roman is serif, modern is monospace. */
  family: "swiss" | "roman" | "modern";
  /** A font every Mac and Windows machine has. */
  altName: string;
  pitch: "variable" | "fixed";
}

const SANS: Fallback = { family: "swiss", altName: "Arial", pitch: "variable" };
const SERIF: Fallback = { family: "roman", altName: "Georgia", pitch: "variable" };
const MONO: Fallback = { family: "modern", altName: "Courier New", pitch: "fixed" };

// The fonts a theme can pick that are not sans-serif. Anything else, known or
// not, is treated as sans-serif: that is what brand fonts almost always are.
const NOT_SANS: Record<string, Fallback> = {
  "playfair display": SERIF,
  merriweather: SERIF,
  "jetbrains mono": MONO,
};

export const fallbackFor = (font: string): Fallback => NOT_SANS[font.trim().toLowerCase()] ?? SANS;

const xmlEscape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The font table part of a .docx, with a substitute declared for each font. */
export const buildFontTableXml = (fonts: string[]): string => {
  const names = Array.from(new Set(fonts.map((f) => f.trim()).filter(Boolean)));
  const entries = names
    .map((name) => {
      const fb = fallbackFor(name);
      // The order of these elements is fixed by the schema.
      return (
        `<w:font w:name="${xmlEscape(name)}">` +
        `<w:altName w:val="${fb.altName}"/>` +
        `<w:charset w:val="00"/>` +
        `<w:family w:val="${fb.family}"/>` +
        `<w:pitch w:val="${fb.pitch}"/>` +
        `</w:font>`
      );
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${entries}</w:fonts>`
  );
};

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * The same .docx with a substitute declared for each of `fonts`. If anything
 * goes wrong the file comes back untouched: the fallback is a nicety, the
 * document is not.
 */
export async function withFontFallbacks<T extends Blob | ArrayBuffer>(
  docx: T,
  fonts: string[],
): Promise<T> {
  try {
    const zip = await JSZip.loadAsync(docx);
    if (!zip.file("word/fontTable.xml")) return docx;
    zip.file("word/fontTable.xml", buildFontTableXml(fonts));
    const isBlob = typeof Blob !== "undefined" && docx instanceof Blob;
    const out = isBlob
      ? await zip.generateAsync({ type: "blob", mimeType: DOCX_MIME, compression: "DEFLATE" })
      : await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
    return out as T;
  } catch {
    return docx;
  }
}
