/**
 * Colour helpers for slides: WCAG contrast between two colours and a safe
 * choice of text colour for a background.
 */

type Rgb = { r: number; g: number; b: number };

/** Colours the renderer uses when a deck has no theme. */
export const DEFAULT_SLIDE_COLORS = {
  primary: "#6366f1",
  secondary: "#a78bfa",
  background: "#0f172a",
} as const;

export const DEFAULT_SLIDE_FONT = "Inter";

/** Reads #rgb, #rrggbb and #rrggbbaa (alpha ignored). Null for anything else. */
export const parseHexColor = (color: unknown): Rgb | null => {
  if (typeof color !== "string") return null;
  const hex = color.trim().replace(/^#/, "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null;
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
};

const luminance = ({ r, g, b }: Rgb): number => {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** WCAG contrast ratio, from 1 to 21. Null when a colour cannot be read. */
export const contrastRatio = (a: unknown, b: unknown): number | null => {
  const first = parseHexColor(a);
  const second = parseHexColor(b);
  if (!first || !second) return null;
  const l1 = luminance(first);
  const l2 = luminance(second);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/**
 * `preferred` when it can be read on `background`, else `fallback`. WCAG asks
 * for 3:1 on large text (titles) and 4.5:1 on body text. A colour that cannot
 * be read as hex gives the fallback.
 */
export const readableOn = (
  background: unknown,
  preferred: string,
  fallback: string,
  size: "title" | "body" = "body",
): string => {
  const ratio = contrastRatio(background, preferred);
  if (ratio === null) return fallback;
  return ratio >= (size === "title" ? 3 : 4.5) ? preferred : fallback;
};

/** Colour of `overlay` at `alpha` painted on `base`, as #rrggbb. Null if unreadable. */
export const blendOver = (base: unknown, overlay: unknown, alpha: number): string | null => {
  const under = parseHexColor(base);
  const over = parseHexColor(overlay);
  if (!under || !over) return null;
  const mix = (u: number, o: number) =>
    Math.round(o * alpha + u * (1 - alpha))
      .toString(16)
      .padStart(2, "0");
  return `#${mix(under.r, over.r)}${mix(under.g, over.g)}${mix(under.b, over.b)}`;
};

/**
 * Colour for a slide title drawn on the slide background: the theme primary
 * when it can be read there, else the slide text colour ("inherit").
 */
export const slideTitleColor = (brandColors?: { primary?: string; background?: string }): string =>
  readableOn(
    brandColors?.background || DEFAULT_SLIDE_COLORS.background,
    brandColors?.primary || DEFAULT_SLIDE_COLORS.primary,
    "inherit",
    "title",
  );
