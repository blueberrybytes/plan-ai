import { describe, expect, it } from "vitest";
import { extractUrls, normalizeUrl } from "../urlAllowlist";

describe("url allowlist helpers", () => {
  it("finds the links a user typed, without trailing punctuation", () => {
    expect(extractUrls("Read https://example.com/a?b=1, and (https://docs.x.io/p).")).toEqual([
      "https://example.com/a?b=1",
      "https://docs.x.io/p",
    ]);
  });

  it("treats a link with a different query string as a different link", () => {
    // The query string is where an injected prompt would put stolen data.
    expect(normalizeUrl("https://example.com/a?b=1")).not.toBe(
      normalizeUrl("https://example.com/a?b=secret"),
    );
  });

  it("ignores the fragment", () => {
    expect(normalizeUrl("https://example.com/a#top")).toBe(normalizeUrl("https://example.com/a"));
  });
});
