import { describe, expect, it, vi } from "vitest";

vi.mock("../../firebase/privateStorage", () => {
  const bucket = "plan-ai.appspot.com";
  return {
    DISPLAY_URL_TTL_MS: 1000,
    storageUri: (path: string) => `gs://${bucket}/${path}`,
    objectPathOf: (ref: string) => {
      const gs = ref.match(/^gs:\/\/[^/]+\/(.+)$/);
      if (gs) return gs[1];
      const https = ref.match(/^https:\/\/storage\.googleapis\.com\/[^/]+\/([^?]+)/);
      return https ? decodeURIComponent(https[1]) : null;
    },
    signedUrlForPath: async (path: string) =>
      `https://storage.googleapis.com/${bucket}/${path}?X-Goog-Signature=abc`,
  };
});

import { signSlideImages, unsignSlideImages } from "../slideImages";

const deck = {
  slides: [
    { parameters: { imageUrl: "gs://plan-ai.appspot.com/presentations/u1/p1/a.png", title: "Hi" } },
    { parameters: { imageUrl: "https://example.com/logo.png" } },
    { parameters: { imageUrl: "gs://plan-ai.appspot.com/transcripts/u1/mic.wav" } },
  ],
};

describe("slide images", () => {
  it("signs private slide images and leaves everything else", async () => {
    const signed = await signSlideImages(deck);

    expect(signed.slides[0].parameters.imageUrl).toContain("X-Goog-Signature");
    expect(signed.slides[0].parameters.title).toBe("Hi");
    expect(signed.slides[1].parameters.imageUrl).toBe("https://example.com/logo.png");
    // Only slide images: a recording reference is never turned into a link here.
    expect(signed.slides[2].parameters.imageUrl).toBe(deck.slides[2].parameters.imageUrl);
  });

  it("stores the reference again when a client sends the signed link back", async () => {
    const roundTrip = await unsignSlideImages(await signSlideImages(deck));
    expect(roundTrip).toEqual(deck);
  });
});
