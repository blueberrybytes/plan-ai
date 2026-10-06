import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), open: vi.fn() }));
vi.mock("../../utils/ssrfGuard", () => ({ safeAxios: { get: mocks.get } }));
vi.mock("../webRenderService", () => ({ openWebRenderer: mocks.open }));

import { webScraperService } from "../webScraperService";

const SHELL = `<!doctype html><html><head><title>Acme | Sales systems</title>
<meta name="description" content="We build sales systems for busy owners."></head>
<body><div id="root"></div><script src="/app.js"></script></body></html>`;

const ARTICLE = `<!doctype html><html><head><title>Docs</title></head><body><article><h1>Docs</h1>
<p>${"This page has plenty of ordinary text that a reader can see without any script. ".repeat(4)}</p>
</article></body></html>`;

const long = (word: string) => `${word} `.repeat(60).trim();

/** A site whose every path answers with the same HTML, and no sitemap. */
const serve = (html: string) =>
  mocks.get.mockImplementation(async (url: string) => {
    if (url.endsWith("/sitemap.xml")) throw new Error("404");
    return { data: Buffer.from(html) };
  });

beforeEach(() => {
  mocks.get.mockReset();
  mocks.open.mockReset();
});

describe("website import of a site drawn by JavaScript", () => {
  it("reads the pages through the browser and follows their links", async () => {
    serve(SHELL);
    const close = vi.fn();
    const render = vi.fn(async (url: string) =>
      url === "https://acme.test/"
        ? {
            url,
            title: "Acme",
            html: "",
            text: long("home"),
            links: ["https://acme.test/pricing", "https://acme.test/"],
          }
        : { url, title: "Pricing", html: "", text: long("pricing"), links: [] },
    );
    mocks.open.mockResolvedValue({ render, close });

    const pages = await webScraperService.scrapeWebsite("https://acme.test/", 5);

    expect(pages.map((p) => [p.url, p.title, p.metaOnly])).toEqual([
      ["https://acme.test/", "Acme", undefined],
      ["https://acme.test/pricing", "Pricing", undefined],
    ]);
    // The root is not rendered twice, and the browser is always closed.
    expect(render).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("stops at the page limit", async () => {
    serve(SHELL);
    let n = 0;
    const render = vi.fn(async (url: string) => ({
      url,
      title: "P",
      html: "",
      text: long(`page${n++}`),
      links: [`https://acme.test/p${n}`, `https://acme.test/q${n}`],
    }));
    mocks.open.mockResolvedValue({ render, close: vi.fn() });
    const pages = await webScraperService.scrapeWebsite("https://acme.test/", 3);
    expect(pages).toHaveLength(3);
    expect(render).toHaveBeenCalledTimes(3);
  });

  it("keeps the title and description when there is no browser", async () => {
    serve(SHELL);
    mocks.open.mockResolvedValue(null);
    const pages = await webScraperService.scrapeWebsite("https://acme.test/", 5);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ metaOnly: true, title: "Acme | Sales systems" });
    expect(pages[0].content).toContain("We build sales systems for busy owners.");
  });

  it("keeps the title and description when the rendered pages have no text either", async () => {
    serve(SHELL);
    const close = vi.fn();
    mocks.open.mockResolvedValue({
      render: async (url: string) => ({ url, title: "", html: "", text: "", links: [] }),
      close,
    });
    const pages = await webScraperService.scrapeWebsite("https://acme.test/", 5);
    expect(pages[0]).toMatchObject({ metaOnly: true });
    expect(close).toHaveBeenCalled();
  });

  it("does not start a browser for a site with text in its HTML", async () => {
    serve(ARTICLE);
    const pages = await webScraperService.scrapeWebsite("https://docs.test/", 5);
    expect(pages[0].metaOnly).toBeUndefined();
    expect(pages[0].content).toContain("plenty of ordinary text");
    expect(mocks.open).not.toHaveBeenCalled();
  });
});
