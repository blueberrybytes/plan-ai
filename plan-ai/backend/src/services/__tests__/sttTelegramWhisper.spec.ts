import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.mock is hoisted above plain declarations, so the mock has to be too.
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    workspace = { findUnique };
  },
}));
vi.mock("../../utils/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../telegramService", () => ({
  getFileUrl: vi.fn(async () => "https://api.telegram.org/file/botSECRET/voice/file_1.oga"),
}));

import { transcribeVoiceNote } from "../telegramTranscriptionService";

describe("Telegram voice notes with STT_PROVIDER=whisper", () => {
  const sentTo: string[] = [];

  beforeEach(() => {
    process.env.STT_PROVIDER = "whisper";
    process.env.WHISPER_BASE_URL = "http://whisper:8000";
    sentTo.length = 0;
    findUnique.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        sentTo.push(url);
        if (url.startsWith("https://api.telegram.org")) {
          return new Response(new Uint8Array([79, 103, 103, 83]));
        }
        return new Response(
          JSON.stringify({ text: "Hola, quiero una demo.", segments: [], words: [] }),
        );
      }),
    );
  });

  afterEach(() => {
    delete process.env.STT_PROVIDER;
    delete process.env.WHISPER_BASE_URL;
    vi.unstubAllGlobals();
  });

  it("transcribes on the self-hosted server without looking for a Deepgram key", async () => {
    await expect(transcribeVoiceNote("file_1", "ws_1")).resolves.toBe("Hola, quiero una demo.");
    expect(findUnique).not.toHaveBeenCalled();
    expect(sentTo[1]).toBe("http://whisper:8000/v1/audio/transcriptions");
  });

  it("never sends the Telegram download URL (it holds the bot token) to the STT server", async () => {
    await transcribeVoiceNote("file_1", "ws_1");
    const whisperCall = vi.mocked(fetch).mock.calls[1];
    const form = (whisperCall[1] as RequestInit).body as FormData;
    for (const [, value] of form.entries()) {
      expect(String(value)).not.toContain("botSECRET");
    }
  });

  it("returns null, not a crash, when the Whisper server is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("https://api.telegram.org")) return new Response(new Uint8Array([1]));
        throw new TypeError("fetch failed");
      }),
    );
    await expect(transcribeVoiceNote("file_1", "ws_1")).resolves.toBeNull();
  });
});
