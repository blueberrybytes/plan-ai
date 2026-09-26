import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { UIMessage } from "ai";

const mocks = vi.hoisted(() => ({
  signedUrlForPath: vi.fn(async (path: string) => `https://signed.example/${path}?sig=1`),
}));

vi.mock("../../firebase/privateStorage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../firebase/privateStorage")>()),
  signedUrlForPath: mocks.signedUrlForPath,
}));

import {
  ownedAttachmentPath,
  toDisplayAttachments,
  toStoredAttachments,
  withSignedFileParts,
} from "../chatAttachments";

const BUCKET = "plan-ai.appspot.com";
const signedByUpload = (path: string) =>
  `https://storage.googleapis.com/${BUCKET}/${path}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc`;

beforeEach(() => {
  process.env.FIREBASE_STORAGE_BUCKET = BUCKET;
  mocks.signedUrlForPath.mockClear();
});
afterEach(() => {
  delete process.env.FIREBASE_STORAGE_BUCKET;
});

describe("which attachments a user can reference", () => {
  it("accepts only the user's own chat uploads", () => {
    expect(ownedAttachmentPath(signedByUpload("chat-attachments/u1/t1/a.png"), "u1")).toBe(
      "chat-attachments/u1/t1/a.png",
    );
    expect(ownedAttachmentPath(signedByUpload("chat-attachments/u2/t1/a.png"), "u1")).toBeNull();
    expect(ownedAttachmentPath(signedByUpload("transcripts/u1/1-mic.webm"), "u1")).toBeNull();
    // A prefix of another user id must not pass for it.
    expect(ownedAttachmentPath(signedByUpload("chat-attachments/u10/t/a.png"), "u1")).toBeNull();
    expect(ownedAttachmentPath("http://169.254.169.254/latest/meta-data", "u1")).toBeNull();
  });
});

describe("saving and showing attachments", () => {
  it("saves own uploads as gs:// URIs and drops everything else", () => {
    const stored = toStoredAttachments(
      [
        {
          url: signedByUpload("chat-attachments/u1/t1/a.png"),
          type: "image/png",
          name: "a.png",
          size: 3,
        },
        { url: "https://evil.example/x.pdf", type: "application/pdf", name: "x.pdf" },
        { url: signedByUpload("chat-attachments/u2/t1/b.png"), type: "image/png", name: "b.png" },
        { nonsense: true },
      ],
      "u1",
    );
    expect(stored).toEqual([
      {
        url: `gs://${BUCKET}/chat-attachments/u1/t1/a.png`,
        type: "image/png",
        name: "a.png",
        size: 3,
      },
    ]);
    expect(toStoredAttachments(undefined, "u1")).toEqual([]);
  });

  it("gives the browser signed URLs, including for rows saved with the old public URL", async () => {
    const shown = await toDisplayAttachments(
      [
        { url: `gs://${BUCKET}/chat-attachments/u1/t1/a.png`, type: "image/png", name: "a.png" },
        {
          url: `https://storage.googleapis.com/${BUCKET}/chat-attachments/u1/t1/old.pdf`,
          type: "application/pdf",
          name: "old.pdf",
        },
      ],
      "u1",
    );
    expect(shown?.map((a) => a.url)).toEqual([
      "https://signed.example/chat-attachments/u1/t1/a.png?sig=1",
      "https://signed.example/chat-attachments/u1/t1/old.pdf?sig=1",
    ]);
    expect(await toDisplayAttachments(null, "u1")).toBeNull();
  });
});

describe("assistant conversations kept in the browser", () => {
  it("re-signs own file parts, keeps inline data and drops foreign URLs", async () => {
    const messages = [
      {
        id: "m1",
        role: "user",
        parts: [
          { type: "text", text: "look at these" },
          {
            type: "file",
            mediaType: "image/png",
            url: signedByUpload("chat-attachments/u1/workspace/a.png"),
          },
          { type: "file", mediaType: "image/png", url: "data:image/png;base64,AAAA" },
          { type: "file", mediaType: "application/pdf", url: "https://evil.example/x.pdf" },
        ],
      },
    ] as UIMessage[];

    const [out] = await withSignedFileParts(messages, "u1");
    expect(out.parts).toEqual([
      { type: "text", text: "look at these" },
      {
        type: "file",
        mediaType: "image/png",
        url: "https://signed.example/chat-attachments/u1/workspace/a.png?sig=1",
      },
      { type: "file", mediaType: "image/png", url: "data:image/png;base64,AAAA" },
    ]);
  });
});
