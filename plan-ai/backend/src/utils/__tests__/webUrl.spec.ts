import { describe, expect, it } from "vitest";
import { normalizeWebUrl } from "../webUrl";

describe("normalizeWebUrl", () => {
  it("adds https to an address typed without it", () => {
    expect(normalizeWebUrl("decoolo.com")).toBe("https://decoolo.com/");
    expect(normalizeWebUrl("  www.decoolo.com/servicios?x=1  ")).toBe(
      "https://www.decoolo.com/servicios?x=1",
    );
  });

  it("keeps the scheme that was given", () => {
    expect(normalizeWebUrl("http://example.com/a")).toBe("http://example.com/a");
    expect(normalizeWebUrl("HTTPS://Example.com")).toBe("https://example.com/");
  });

  it("accepts a host with a port", () => {
    expect(normalizeWebUrl("localhost:3000/docs")).toBe("https://localhost:3000/docs");
    expect(normalizeWebUrl("example.com:8443")).toBe("https://example.com:8443/");
  });

  it("refuses what is not a web address", () => {
    for (const bad of [
      "",
      "   ",
      "hola",
      "dos palabras.com",
      "ftp://example.com",
      "mailto:a@b.com",
      "javascript:alert(1)",
      null,
      42,
    ]) {
      expect(normalizeWebUrl(bad)).toBeNull();
    }
  });
});
