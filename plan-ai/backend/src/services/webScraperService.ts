import { safeAxios } from "../utils/ssrfGuard";

// A page or sitemap larger than this is not read.
const MAX_PAGE_BYTES = 10 * 1024 * 1024;
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { parseStringPromise } from "xml2js";
import { logger } from "../utils/logger";

interface ScrapedPage {
  url: string;
  title: string;
  content: string;
  /**
   * True when the page is drawn by JavaScript and its HTML holds no text:
   * `content` is then only what the page declares about itself (title,
   * description, headings), not what a visitor reads.
   */
  metaOnly?: boolean;
}

/** Below this, what Readability returned is not a page worth keeping. */
const MIN_ARTICLE_CHARS = 100;

/**
 * What a page says about itself in its head, for sites drawn by JavaScript
 * (their body is an empty element until a browser runs the script).
 */
function describeFromHead(document: Document): string {
  const meta = (selector: string) =>
    document.querySelector(selector)?.getAttribute("content")?.trim() ?? "";
  const parts = [
    document.title?.trim() ?? "",
    meta('meta[name="description"]'),
    meta('meta[property="og:title"]'),
    meta('meta[property="og:description"]'),
    meta('meta[name="keywords"]'),
    ...Array.from(document.querySelectorAll("h1, h2, noscript")).map(
      (el) => el.textContent?.replace(/\s+/g, " ").trim() ?? "",
    ),
  ];
  // The same sentence is often in the description and in og:description.
  return Array.from(new Set(parts.filter((p) => p.length > 0))).join("\n\n");
}

export class WebScraperService {
  /**
   * Fetch and extract pristine text from a single URL using mozilla/readability.
   */
  public async scrapeUrl(url: string): Promise<ScrapedPage | null> {
    try {
      // Any URL a user or the model gives: never the server's own network.
      const response = await safeAxios.get(url, {
        maxContentLength: MAX_PAGE_BYTES,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
        timeout: 10000,
        responseType: "arraybuffer",
      });

      const html = response.data;
      // Use an empty virtual console to suppress annoying "Could not parse CSS stylesheet" warnings
      const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
      // Read the head first: Readability changes the document it parses.
      const fromHead = describeFromHead(dom.window.document);
      const pageTitle = dom.window.document.title?.trim();
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      const content = article?.textContent ? article.textContent.replace(/\s+/g, " ").trim() : "";

      if (content.length >= MIN_ARTICLE_CHARS) {
        return { url, title: article?.title || pageTitle || "Untitled Page", content };
      }
      // No readable text in the HTML. Keep what the page declares, if anything.
      if (fromHead) {
        return { url, title: pageTitle || "Untitled Page", content: fromHead, metaOnly: true };
      }
      return null;
    } catch (error) {
      logger.warn(
        `Failed to scrape URL ${url}:`,
        error instanceof Error ? error.message : "Unknown error",
      );
      return null;
    }
  }

  /**
   * Try to fetch /sitemap.xml and extract URLs.
   */
  private async getSitemapUrls(baseUrl: string): Promise<string[]> {
    try {
      const parsedUrl = new URL(baseUrl);
      const sitemapUrl = `${parsedUrl.origin}/sitemap.xml`;
      const response = await safeAxios.get(sitemapUrl, {
        timeout: 5000,
        maxContentLength: MAX_PAGE_BYTES,
      });
      const data = await parseStringPromise(response.data);

      const urls: string[] = [];

      // Handle standard <urlset> -> <url> -> <loc>
      if (data.urlset && data.urlset.url) {
        for (const item of data.urlset.url) {
          if (item.loc && item.loc.length > 0) {
            urls.push(item.loc[0]);
          }
        }
      }

      // We only return the first 100 to prevent memory blowups on giant sitemaps
      return urls.slice(0, 100);
    } catch {
      logger.debug("No valid sitemap.xml found at root.");
      return [];
    }
  }

  /**
   * Extract links from the homepage via standard <a> tags if sitemap fails.
   */
  private async getDeepLinks(baseUrl: string): Promise<string[]> {
    try {
      const response = await safeAxios.get(baseUrl, {
        timeout: 10000,
        responseType: "arraybuffer",
        maxContentLength: MAX_PAGE_BYTES,
      });
      const dom = new JSDOM(response.data, { url: baseUrl });
      const document = dom.window.document;
      const links = document.querySelectorAll("a");

      const parsedBase = new URL(baseUrl);
      const urls = new Set<string>();
      urls.add(baseUrl); // Always include root

      links.forEach((link) => {
        try {
          const href = link.href;
          if (href) {
            const urlObj = new URL(href, baseUrl);
            // Only scrape pages on the exact same domain
            if (urlObj.origin === parsedBase.origin) {
              // Strip hashes
              urlObj.hash = "";
              urls.add(urlObj.toString());
            }
          }
        } catch {
          // invalid href
        }
      });

      return Array.from(urls);
    } catch {
      return [baseUrl]; // Fallback to just the provided URL
    }
  }

  /**
   * Scrapes a website up to a maximum number of pages.
   */
  public async scrapeWebsite(rootUrl: string, maxPages: number): Promise<ScrapedPage[]> {
    logger.info(`Starting deep scrape of ${rootUrl} (Max: ${maxPages})`);

    // 1. Determine URLs to scrape
    let queue: string[] = [];

    // Attempt sitemap first
    const sitemapLinks = await this.getSitemapUrls(rootUrl);

    if (sitemapLinks.length > 0) {
      queue = sitemapLinks;
    } else {
      queue = await this.getDeepLinks(rootUrl);
    }

    // Ensure rootURL is prioritised if somehow missing
    if (!queue.includes(rootUrl)) {
      queue.unshift(rootUrl);
    }

    // Enforce limits
    const targetUrls = queue.slice(0, Math.min(maxPages, queue.length));

    const results: ScrapedPage[] = [];

    // 2. Iterate and scrape sequentially to avoid rate limits
    const seenContent = new Set<string>();
    for (const target of targetUrls) {
      const scraped = await this.scrapeUrl(target);
      if (!scraped) continue;
      if (!scraped.metaOnly && scraped.content.length <= MIN_ARTICLE_CHARS) continue;
      // A JavaScript site answers every path with the same empty shell.
      if (seenContent.has(scraped.content)) continue;
      seenContent.add(scraped.content);
      results.push(scraped);
    }

    return results;
  }
}

export const webScraperService = new WebScraperService();
