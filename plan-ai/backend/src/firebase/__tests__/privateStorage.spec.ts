import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn(async () => undefined),
  getSignedUrl: vi.fn(async (opts: { expires: number }) => [`signed?expires=${opts.expires}`]),
  bucket: vi.fn(),
}));

vi.mock("../firebaseAdmin", () => ({
  firebaseAdmin: {
    storage: () => ({
      bucket: (name: string) => {
        mocks.bucket(name);
        return {
          name,
          file: (path: string) => ({
            save: (data: Buffer, opts: unknown) => mocks.save(path, data, opts),
            getSignedUrl: (opts: { expires: number }) => mocks.getSignedUrl(opts),
          }),
        };
      },
    }),
  },
}));

import {
  objectPathOf,
  readableUrl,
  storageUri,
  uploadPrivateFile,
  SHORT_URL_TTL_MS,
} from "../privateStorage";

beforeEach(() => {
  process.env.FIREBASE_STORAGE_BUCKET = "plan-ai.appspot.com";
  vi.clearAllMocks();
});
afterEach(() => {
  delete process.env.FIREBASE_STORAGE_BUCKET;
});

describe("stored references", () => {
  it("reads the object path from a gs:// URI, an old public URL and a signed URL", () => {
    expect(objectPathOf("gs://plan-ai.appspot.com/transcripts/u1/1-mic.webm")).toBe(
      "transcripts/u1/1-mic.webm",
    );
    // What rows written before the change hold.
    expect(
      objectPathOf("https://storage.googleapis.com/plan-ai.appspot.com/transcripts/u1/1-mic.webm"),
    ).toBe("transcripts/u1/1-mic.webm");
    // What the browser sends back after an upload.
    expect(
      objectPathOf(
        "https://storage.googleapis.com/plan-ai.appspot.com/chat-attachments/u1/t/a%20b.png?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc",
      ),
    ).toBe("chat-attachments/u1/t/a b.png");
  });

  it("doesn't claim references to another bucket, host or scheme", () => {
    expect(objectPathOf("gs://other-bucket/transcripts/u1/1-mic.webm")).toBeNull();
    expect(objectPathOf("https://storage.googleapis.com/other-bucket/x.png")).toBeNull();
    expect(objectPathOf("https://evil.example/plan-ai.appspot.com/x.png")).toBeNull();
    expect(objectPathOf("http://storage.googleapis.com/plan-ai.appspot.com/x.png")).toBeNull();
    expect(objectPathOf("local://voice-profile.m4a")).toBeNull();
    expect(objectPathOf("gs://plan-ai.appspot.com/")).toBeNull();
    expect(objectPathOf("not a url")).toBeNull();
  });

  it("claims nothing when no bucket is configured", () => {
    delete process.env.FIREBASE_STORAGE_BUCKET;
    expect(objectPathOf("gs://plan-ai.appspot.com/a.png")).toBeNull();
  });

  it("builds gs:// URIs for the configured bucket", () => {
    expect(storageUri("voice-profiles/u1/profile.m4a")).toBe(
      "gs://plan-ai.appspot.com/voice-profiles/u1/profile.m4a",
    );
  });
});

describe("private uploads and signed URLs", () => {
  it("saves without making the file public and returns its gs:// URI", async () => {
    const uri = await uploadPrivateFile(
      "transcripts/u1/1-mic.webm",
      Buffer.from("x"),
      "audio/webm",
    );
    expect(uri).toBe("gs://plan-ai.appspot.com/transcripts/u1/1-mic.webm");
    expect(mocks.save).toHaveBeenCalledWith("transcripts/u1/1-mic.webm", Buffer.from("x"), {
      contentType: "audio/webm",
    });
  });

  it("signs our objects for an hour by default and leaves other references alone", async () => {
    const before = Date.now();
    const url = await readableUrl("gs://plan-ai.appspot.com/transcripts/u1/1-mic.webm");
    const expires = Number(url.split("expires=")[1]);
    expect(expires).toBeGreaterThanOrEqual(before + SHORT_URL_TTL_MS);
    expect(expires).toBeLessThanOrEqual(Date.now() + SHORT_URL_TTL_MS);
    expect(mocks.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ version: "v4", action: "read" }),
    );

    expect(await readableUrl("local://voice-profile.m4a")).toBe("local://voice-profile.m4a");
    expect(mocks.getSignedUrl).toHaveBeenCalledTimes(1);
  });
});
