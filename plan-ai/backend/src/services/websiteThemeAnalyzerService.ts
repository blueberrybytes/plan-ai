import axios from "axios";
import * as cheerio from "cheerio";
import { generateObject } from "ai";
import { z } from "zod";
import { getWorkspaceModel } from "../utils/aiModelUtils";

export class WebsiteThemeAnalyzerService {
  /**
   * Scrapes the target URL to extract text, CSS colors, and images,
   * then uses the AI to deduce the brand theme parameters.
   */
  public async analyzeUrl(url: string, workspaceId: string) {
    // 1. Fetch HTML
    let html = "";
    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; PlanAI/1.0; +https://plan-ai.blueberrybytes.com)",
        },
        timeout: 10000,
      });
      html = response.data;
    } catch (error) {
      throw new Error(`Failed to fetch website: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    const $ = cheerio.load(html);
    const baseUrl = new URL(url);

    // 2. Extract Data
    const title = $("title").text();
    const metaDescription = $("meta[name='description']").attr("content") || "";

    const images = new Set<string>();
    $("img").each((_, el) => {
      let src = $(el).attr("src");
      if (src) {
        if (src.startsWith("//")) src = "https:" + src;
        if (src.startsWith("/")) src = baseUrl.origin + src;
        if (src.startsWith("http")) images.add(src);
      }
    });

    const icons = new Set<string>();
    $("link[rel*='icon']").each((_, el) => {
      let href = $(el).attr("href");
      if (href) {
        if (href.startsWith("//")) href = "https:" + href;
        if (href.startsWith("/")) href = baseUrl.origin + href;
        if (href.startsWith("http")) icons.add(href);
      }
    });

    // Also look for og:image
    const ogImage = $("meta[property='og:image']").attr("content");
    if (ogImage) {
      let src = ogImage;
      if (src.startsWith("//")) src = "https:" + src;
      if (src.startsWith("/")) src = baseUrl.origin + src;
      if (src.startsWith("http")) images.add(src);
    }

    const cssTexts: string[] = [];
    $("style").each((_, el) => {
      cssTexts.push($(el).text());
    });
    // We limit CSS text size to not blow up the prompt context
    const combinedCss = cssTexts.join("\n").substring(0, 15000);

    const imageArray = Array.from(images).slice(0, 30); // Max 30 images to analyze
    const iconArray = Array.from(icons).slice(0, 5);

    // 3. Prepare AI Request
    const systemPrompt = `You are an expert brand designer and CSS analyzer. 
Analyze the provided website extraction data to deduce the brand's main theme.
Identify the primary brand color, a complementary secondary color, and a suitable background color (usually white, dark gray, or a very light tint).
Also identify the two most dominant font families (mapped to the closest Google Font).
Return up to 5 URLs that are most likely to be the brand's logo from the provided lists of images and icons.

AVAILABLE GOOGLE FONTS (must pick from this list if possible, or fallback to Inter):
Inter, Roboto, Poppins, Open Sans, Lato, Outfit, DM Sans, Source Sans 3, Playfair Display, Merriweather, Space Grotesk, JetBrains Mono, Montserrat, Nunito, Raleway

Output strictly in JSON matching the schema.`;

    const userPrompt = `
Website URL: ${url}
Title: ${title}
Description: ${metaDescription}

Icons:
${iconArray.join("\n")}

Images on page:
${imageArray.join("\n")}

Extracted inline CSS (truncated):
${combinedCss}
`;

    // 4. Call AI
    const model = await getWorkspaceModel(workspaceId);

    const result = await generateObject({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      schema: z.object({
        primaryColor: z.string().describe("Hex color code for the primary brand color"),
        secondaryColor: z.string().describe("Hex color code for the secondary or accent brand color"),
        backgroundColor: z.string().describe("Hex color code for the main app background"),
        headingFont: z.string().describe("The best matching Google font for headings"),
        bodyFont: z.string().describe("The best matching Google font for body text"),
        candidateLogos: z.array(z.string()).describe("List of image URLs from the prompt that are most likely the logo, prioritized."),
      }),
    });

    return result.object;
  }
}
