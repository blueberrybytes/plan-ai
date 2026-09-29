import { isAllowedImageUrl, isHttpUrl } from "./safeImageUrl";
import { sanitizeMermaidSvg } from "./sanitizeSvg";

describe("isAllowedImageUrl", () => {
  const originalBucket = process.env.REACT_APP_FIREBASE_STORAGE_BUCKET;

  beforeEach(() => {
    process.env.REACT_APP_FIREBASE_STORAGE_BUCKET = "our-bucket.firebasestorage.app";
  });

  afterAll(() => {
    process.env.REACT_APP_FIREBASE_STORAGE_BUCKET = originalBucket;
  });

  it("blocks images on unknown hosts (prompt injection exfiltration)", () => {
    expect(isAllowedImageUrl("https://attacker.example/?d=secret")).toBe(false);
    expect(isAllowedImageUrl("http://attacker.example/pixel.png")).toBe(false);
    expect(isAllowedImageUrl("//attacker.example/pixel.png")).toBe(false);
  });

  it("allows data, blob and same-origin images", () => {
    expect(isAllowedImageUrl("data:image/png;base64,AAAA")).toBe(true);
    expect(isAllowedImageUrl("blob:http://localhost/1234")).toBe(true);
    expect(isAllowedImageUrl("/logos/favicon.ico")).toBe(true);
    expect(isAllowedImageUrl(`${window.location.origin}/logos/a.png`)).toBe(true);
  });

  it("allows our storage bucket only", () => {
    expect(
      isAllowedImageUrl("https://storage.googleapis.com/our-bucket.firebasestorage.app/img/a.png"),
    ).toBe(true);
    expect(
      isAllowedImageUrl(
        "https://firebasestorage.googleapis.com/v0/b/our-bucket.firebasestorage.app/o/a.png?alt=media",
      ),
    ).toBe(true);
    expect(isAllowedImageUrl("https://storage.googleapis.com/attacker-bucket/a.png?d=x")).toBe(
      false,
    );
    expect(
      isAllowedImageUrl("https://firebasestorage.googleapis.com/v0/b/attacker/o/a.png?d=x"),
    ).toBe(false);
    expect(
      isAllowedImageUrl("http://storage.googleapis.com/our-bucket.firebasestorage.app/a.png"),
    ).toBe(false);
  });

  it("rejects empty and non-image data URLs", () => {
    expect(isAllowedImageUrl(undefined)).toBe(false);
    expect(isAllowedImageUrl("")).toBe(false);
    expect(isAllowedImageUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });
});

describe("isHttpUrl", () => {
  it("accepts only http and https", () => {
    expect(isHttpUrl("https://example.com/a.png")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("/relative.png")).toBe(false);
  });
});

describe("sanitizeMermaidSvg", () => {
  it("removes scripts, event handlers and javascript: links but keeps labels", () => {
    const dirty =
      '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:red}</style>' +
      '<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">' +
      '<span class="nodeLabel">Create task</span><img src="x" onerror="alert(1)"></div></foreignObject>' +
      '<script>alert(2)</script><a href="javascript:alert(3)"><text onclick="alert(4)">t</text></a></svg>';

    const clean = sanitizeMermaidSvg(dirty);

    expect(clean).toContain("Create task");
    expect(clean).toContain("<style>");
    expect(clean).toContain("foreignObject");
    expect(clean).not.toMatch(/onerror|onclick|<script|javascript:/i);
  });
});
