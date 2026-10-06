import { useEffect } from "react";
import { FONT_OPTIONS } from "./themePresets";

// Weights Google Fonts serves for each theme font. Asking for a weight a family
// does not have makes the whole request fail. Inter, Montserrat and Nunito are
// not here because public/index.html already loads them.
const FONT_WEIGHTS: Record<string, string> = {
  Roboto: "400;500;600;700;800;900",
  Poppins: "400;500;600;700;800;900",
  "Open Sans": "400;500;600;700;800",
  Lato: "400;700;900",
  Outfit: "400;500;600;700;800;900",
  "DM Sans": "400;500;600;700;800;900",
  "Source Sans 3": "400;500;600;700;800;900",
  "Playfair Display": "400;500;600;700;800;900",
  Merriweather: "400;700;900",
  "Space Grotesk": "400;500;600;700",
  "JetBrains Mono": "400;500;600;700;800",
  Raleway: "400;500;600;700;800;900",
};

/**
 * Google Fonts stylesheet for a theme font. Null for a font that is already
 * loaded and for any name that is not in the list the theme editor offers, so
 * a theme can never make the page load an arbitrary URL.
 */
export const themeFontHref = (family: string | null | undefined): string | null => {
  if (!family || !FONT_OPTIONS.includes(family)) return null;
  const weights = FONT_WEIGHTS[family];
  if (!weights) return null;
  return `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weights}&display=swap`;
};

const requested = new Set<string>();

/** Adds the stylesheet of a theme font to the page, once per font. */
export const loadThemeFont = (family: string | null | undefined): void => {
  const href = themeFontHref(family);
  if (!href || requested.has(href)) return;
  requested.add(href);
  const present = Array.from(document.head.querySelectorAll("link")).some(
    (link) => link.getAttribute("href") === href,
  );
  if (present) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
};

/** Loads the heading and body fonts of the theme of the deck on screen. */
export const useThemeFonts = (headingFont?: string, bodyFont?: string): void => {
  useEffect(() => {
    loadThemeFont(headingFont);
    loadThemeFont(bodyFont);
  }, [headingFont, bodyFont]);
};
