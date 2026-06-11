import axios from "axios";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { parseStringPromise } from "xml2js";
import { logger } from "../utils/logger";

interface ScrapedPage {
  url: string;
  title: string;
  content: string;
}

export class WebScraperService {
  /**
   * Fetch and extract pristine text from a single URL using mozilla/readability.
   */
  public async scrapeUrl(url: string): Promise<ScrapedPage | null> {
    try {
      const response = await axios.get(url, {
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
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article) {
        return null;
      }

      return {
        url,
        title: article.title || "Untitled Page",
        content: article.textContent ? article.textContent.replace(/\s+/g, " ").trim() : "",
      };
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
      const response = await axios.get(sitemapUrl, { timeout: 5000 });
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
      const response = await axios.get(baseUrl, { timeout: 10000, responseType: "arraybuffer" });
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
    for (const target of targetUrls) {
      const scraped = await this.scrapeUrl(target);
      if (scraped && scraped.content.length > 100) {
        results.push(scraped);
      }
    }

    return results;
  }
}

export const webScraperService = new WebScraperService();
