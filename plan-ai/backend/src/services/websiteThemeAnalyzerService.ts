import axios from "axios";
import * as cheerio from "cheerio";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getWorkspaceModel, getStructuredProviderOptions } from "../utils/aiModelUtils";

// Regex to extract hex colors (#rgb, #rrggbb, #rrggbbaa)
const HEX_COLOR_RE = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/g;
// Regex to extract rgb/rgba colors
const RGB_COLOR_RE = /rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[\d.]+)?\s*\)/g;
// Regex to extract hsl/hsla colors
const HSL_COLOR_RE = /hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?(?:\s*,\s*[\d.]+)?\s*\)/g;
// Regex to extract CSS custom properties (variables)
const CSS_VAR_RE = /--[\w-]+\s*:\s*([^;]+)/g;
// Regex to extract font-family declarations
const FONT_FAMILY_RE = /font-family\s*:\s*([^;}"]+)/gi;

export class WebsiteThemeAnalyzerService {
  /**
   * Resolves a potentially relative URL to an absolute one.
   */
  private resolveUrl(raw: string, baseUrl: URL): string | null {
    try {
      if (raw.startsWith("//")) return "https:" + raw;
      if (raw.startsWith("/")) return baseUrl.origin + raw;
      if (raw.startsWith("http")) return raw;
      // Relative path
      return new URL(raw, baseUrl.origin).toString();
    } catch {
      return null;
    }
  }

  /**
   * Extracts all color values (hex, rgb, hsl) from a CSS string.
   */
  private extractColorsFromCss(css: string): string[] {
    const colors: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = HEX_COLOR_RE.exec(css)) !== null) colors.push(match[0]);
    while ((match = RGB_COLOR_RE.exec(css)) !== null) colors.push(match[0]);
    while ((match = HSL_COLOR_RE.exec(css)) !== null) colors.push(match[0]);

    return colors;
  }

  /**
   * Extracts CSS custom properties (variables) and their values from CSS.
   */
  private extractCssVariables(css: string): Record<string, string> {
    const vars: Record<string, string> = {};
    let match: RegExpExecArray | null;
    while ((match = CSS_VAR_RE.exec(css)) !== null) {
      const fullMatch = match[0];
      const name = fullMatch.split(":")[0].trim();
      const value = match[1].trim();
      vars[name] = value;
    }
    return vars;
  }

  /**
   * Extracts font-family declarations from CSS.
   */
  private extractFontFamilies(css: string): string[] {
    const fonts = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = FONT_FAMILY_RE.exec(css)) !== null) {
      const raw = match[1]
        .split(",")
        .map((f) => f.trim().replace(/['"]/g, ""))
        .filter(
          (f) =>
            ![
              "sans-serif",
              "serif",
              "monospace",
              "cursive",
              "system-ui",
              "inherit",
              "initial",
              "-apple-system",
              "BlinkMacSystemFont",
              "Segoe UI",
            ].includes(f),
        );
      raw.forEach((f) => fonts.add(f));
    }
    return Array.from(fonts);
  }

  /**
   * Fetches an external CSS stylesheet. Returns the CSS text (truncated).
   */
  private async fetchExternalCss(href: string): Promise<string> {
    try {
      const res = await axios.get(href, {
        timeout: 5000,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PlanAI/1.0; +https://plan-ai.blueberrybytes.com)",
        },
        maxContentLength: 500_000, // 500KB max per stylesheet
      });
      return typeof res.data === "string" ? res.data : "";
    } catch {
      return "";
    }
  }

  /**
   * Scrapes the target URL to extract text, CSS colors, images, and fonts,
   * then uses the AI to deduce the brand theme parameters.
   */
  public async analyzeUrl(url: string, workspaceId: string) {
    // 1. Fetch HTML
    let html = "";
    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeout: 15000,
        maxContentLength: 5_000_000, // 5MB max
      });
      html = response.data;
    } catch (error) {
      throw new Error(
        `Failed to fetch website: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    const $ = cheerio.load(html);
    const baseUrl = new URL(url);

    // ── 2. Extract metadata ──────────────────────────────────────────────
    const title = $("title").text().trim();
    const metaDescription = $("meta[name='description']").attr("content") || "";
    const themeColor = $("meta[name='theme-color']").attr("content") || "";
    const msapplicationColor = $("meta[name='msapplication-TileColor']").attr("content") || "";

    // ── 3. Extract images & icons ────────────────────────────────────────
    const images = new Set<string>();
    $("img").each((_, el) => {
      const src = $(el).attr("src");
      if (src) {
        const resolved = this.resolveUrl(src, baseUrl);
        if (resolved) images.add(resolved);
      }
    });

    // SVG images embedded as <svg> with potential logo class/id
    $("svg").each((_, el) => {
      const parent = $(el).parent();
      const parentClass = (parent.attr("class") || "").toLowerCase();
      const parentId = (parent.attr("id") || "").toLowerCase();
      if (parentClass.includes("logo") || parentId.includes("logo")) {
        // Can't extract SVG as URL, but note it
      }
    });

    const icons = new Set<string>();
    $("link[rel*='icon']").each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        const resolved = this.resolveUrl(href, baseUrl);
        if (resolved) icons.add(resolved);
      }
    });

    // Apple touch icon
    $("link[rel='apple-touch-icon']").each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        const resolved = this.resolveUrl(href, baseUrl);
        if (resolved) icons.add(resolved);
      }
    });

    // og:image
    const ogImage = $("meta[property='og:image']").attr("content");
    if (ogImage) {
      const resolved = this.resolveUrl(ogImage, baseUrl);
      if (resolved) images.add(resolved);
    }

    // ── 4. Extract CSS (inline + external stylesheets) ───────────────────
    const allCssTexts: string[] = [];

    // Inline <style> tags
    $("style").each((_, el) => {
      allCssTexts.push($(el).text());
    });

    // External stylesheets (fetch up to 3 to avoid timeout)
    const externalStylesheetUrls: string[] = [];
    $("link[rel='stylesheet']").each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        const resolved = this.resolveUrl(href, baseUrl);
        if (resolved) externalStylesheetUrls.push(resolved);
      }
    });

    const fetchPromises = externalStylesheetUrls
      .slice(0, 3)
      .map((href) => this.fetchExternalCss(href));
    const externalCssResults = await Promise.allSettled(fetchPromises);
    externalCssResults.forEach((result) => {
      if (result.status === "fulfilled" && result.value) {
        allCssTexts.push(result.value);
      }
    });

    const combinedCss = allCssTexts.join("\n");

    // ── 5. Extract colors from CSS ───────────────────────────────────────
    const allColors = this.extractColorsFromCss(combinedCss);
    // Also extract from inline style attributes on elements
    $("[style]").each((_, el) => {
      const style = $(el).attr("style") || "";
      allColors.push(...this.extractColorsFromCss(style));
    });

    // Deduplicate and count frequency
    const colorFrequency: Record<string, number> = {};
    allColors.forEach((c) => {
      const normalized = c.toLowerCase();
      colorFrequency[normalized] = (colorFrequency[normalized] || 0) + 1;
    });

    // Sort by frequency (most used first), exclude pure black/white/transparent
    const boringColors = new Set([
      "#fff",
      "#ffffff",
      "#000",
      "#000000",
      "#0000",
      "rgb(0, 0, 0)",
      "rgb(255, 255, 255)",
      "rgba(0, 0, 0, 0)",
      "rgba(255, 255, 255, 0)",
    ]);
    const rankedColors = Object.entries(colorFrequency)
      .filter(([c]) => !boringColors.has(c))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([color, count]) => `${color} (${count}x)`);

    // ── 6. Extract CSS variables ─────────────────────────────────────────
    const cssVariables = this.extractCssVariables(combinedCss);
    // Filter to color-related variables
    const colorVars: Record<string, string> = {};
    Object.entries(cssVariables).forEach(([name, value]) => {
      const lowerName = name.toLowerCase();
      if (
        lowerName.includes("color") ||
        lowerName.includes("brand") ||
        lowerName.includes("primary") ||
        lowerName.includes("secondary") ||
        lowerName.includes("accent") ||
        lowerName.includes("bg") ||
        lowerName.includes("background") ||
        lowerName.includes("surface") ||
        lowerName.includes("theme")
      ) {
        colorVars[name] = value;
      }
    });

    // ── 7. Extract font families ─────────────────────────────────────────
    const detectedFonts = this.extractFontFamilies(combinedCss);
    // Also from Google Fonts / Adobe Fonts links
    const googleFontUrls: string[] = [];
    $(
      "link[href*='fonts.googleapis.com'], link[href*='fonts.gstatic.com'], link[href*='use.typekit.net']",
    ).each((_, el) => {
      const href = $(el).attr("href");
      if (href) googleFontUrls.push(href);
    });

    // Extract font names from Google Fonts URL params
    const googleFontNames: string[] = [];
    googleFontUrls.forEach((gfUrl) => {
      try {
        const parsedUrl = new URL(gfUrl);
        const family = parsedUrl.searchParams.get("family") || "";
        family.split("|").forEach((f) => {
          const name = f.split(":")[0].replace(/\+/g, " ").trim();
          if (name) googleFontNames.push(name);
        });
      } catch {
        /* ignore malformed URLs */
      }
    });

    const imageArray = Array.from(images).slice(0, 30);
    const iconArray = Array.from(icons).slice(0, 5);

    // ── 8. Build AI Prompt ────────────────────────────────────────────────
    const systemPrompt = `You are an expert brand designer and CSS color analyzer.
Your job is to identify a website's brand colors, typography, and logo with high accuracy.

IMPORTANT RULES FOR COLORS:
- The PRIMARY COLOR is the main brand color — buttons, links, headers, accents. It is NOT black or white.
- The SECONDARY COLOR is a complementary accent used for highlights, hover states, or secondary CTAs.
- The BACKGROUND COLOR is the page's main background (usually white, off-white, or a very dark shade for dark themes).
- NEVER return pure black (#000000) or pure white (#ffffff) as primary or secondary colors.
- Prefer colors that appear in CSS variables named "primary", "brand", "accent", or "main".
- Use the frequency-ranked color list and CSS variables as your strongest signals.
- The meta theme-color tag, if present, is a very strong indicator of the primary brand color.

IMPORTANT RULES FOR FONTS:
- Map detected fonts to the closest match from this list:
  Inter, Roboto, Poppins, Open Sans, Lato, Outfit, DM Sans, Source Sans 3, Playfair Display, Merriweather, Space Grotesk, JetBrains Mono, Montserrat, Nunito, Raleway
- If the website uses a proprietary font (e.g., "Shopify Sans", "Apple System"), pick the closest visual match.
- If Google Fonts are detected in the links, prefer those exact names.

IMPORTANT RULES FOR LOGO:
- Return up to 5 image/icon URLs most likely to be the logo, ordered by probability.
- Favicons and apple-touch-icons are strong logo candidates.
- Images with "logo" in their URL path or filename are strong candidates.

Output strictly in JSON matching the schema.`;

    let userPrompt = `
Website URL: ${url}
Title: ${title}
Description: ${metaDescription}
`;

    if (themeColor) userPrompt += `Meta theme-color: ${themeColor}\n`;
    if (msapplicationColor) userPrompt += `Meta msapplication-TileColor: ${msapplicationColor}\n`;

    userPrompt += `
Icons (favicons, apple-touch-icons):
${iconArray.length > 0 ? iconArray.join("\n") : "(none found)"}

Images on page (up to 30):
${imageArray.length > 0 ? imageArray.join("\n") : "(none found)"}

───── COLOR ANALYSIS ─────

CSS Variables related to colors/brand:
${
  Object.keys(colorVars).length > 0
    ? Object.entries(colorVars)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")
    : "(none found)"
}

Top 30 most frequent colors found in all CSS (inline + external stylesheets):
${rankedColors.length > 0 ? rankedColors.join("\n") : "(none found)"}

───── TYPOGRAPHY ANALYSIS ─────

Font families declared in CSS:
${detectedFonts.length > 0 ? detectedFonts.join(", ") : "(none found)"}

Google Fonts / Adobe Fonts detected in <link> tags:
${googleFontNames.length > 0 ? googleFontNames.join(", ") : "(none found)"}
`;

    // ── 9. Call AI ────────────────────────────────────────────────────────
    const model = await getWorkspaceModel(workspaceId, undefined);

    const result = await generateText({
      model,
      providerOptions: getStructuredProviderOptions(),
      system: systemPrompt,
      prompt: userPrompt,
      output: Output.object({
        name: "ExtractBrandTheme",
        description:
          "Analyzes the provided CSS and HTML to determine the core brand colors and typography.",
        schema: z.object({
          suggestedName: z
            .string()
            .describe(
              "A short brand/company name suitable as a theme name, derived from the website title or domain (e.g. 'Stripe', 'Notion', 'Acme Corp')",
            ),
          primaryColor: z
            .string()
            .describe("Hex color code for the primary brand color (NOT black or white)"),
          secondaryColor: z
            .string()
            .describe("Hex color code for the secondary/accent brand color"),
          backgroundColor: z.string().describe("Hex color code for the main page background"),
          headingFont: z
            .string()
            .describe("The best matching Google Font for headings from the allowed list"),
          bodyFont: z
            .string()
            .describe("The best matching Google Font for body text from the allowed list"),
          candidateLogos: z
            .array(z.string())
            .describe("Up to 5 image/icon URLs most likely to be the logo, ordered by probability"),
        }),
      }),
    });

    return result.output;
  }
}
