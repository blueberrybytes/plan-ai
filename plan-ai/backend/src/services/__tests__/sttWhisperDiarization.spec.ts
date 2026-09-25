import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../utils/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { diarizeUtterances } from "../stt/whisperDiarization";
import { transcribeChannelWithWhisper, type ChannelUtterance } from "../stt/whisperPrerecorded";
import { getWhisperDiarizeConfig, type WhisperDiarizeConfig } from "../stt/sttConfig";
import { longRequestDispatcher } from "../stt/longRequest";

const config: WhisperDiarizeConfig = {
  enabled: true,
  voiceAiUrl: "http://voice:8001",
  apiKey: "k",
  maxSpeakers: 8,
  threshold: 0.5,
  timeoutMs: 1000,
};

const utt = (start: number, end: number, text: string): ChannelUtterance => ({
  speaker: 0,
  transcript: text,
  start,
  end,
  words: [
    { word: text.toLowerCase(), punctuated_word: text, start, end, confidence: 1, speaker: 0 },
  ],
});

const three = [utt(0, 2, "Hola"), utt(2.5, 5, "Buenas"), utt(5.5, 8, "Seguimos")];
const file = { filename: "sys.webm", mimeType: "audio/webm" };

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.VOICE_AI_URL;
  delete process.env.WHISPER_DIARIZE;
  delete process.env.WHISPER_DIARIZE_THRESHOLD;
});

describe("speaker separation for Whisper", () => {
  it("sends the audio and utterance times, and applies the labels to utterances and words", async () => {
    let sent: { url: string; body: FormData; headers?: HeadersInit } | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        sent = { url, body: init.body as FormData, headers: init.headers };
        return new Response(JSON.stringify({ num_speakers: 2, labels: [0, 1, 0] }));
      }),
    );

    const out = await diarizeUtterances(Buffer.from([1, 2, 3]), file, three, config);

    expect(sent!.url).toBe("http://voice:8001/diarize");
    expect(sent!.headers).toEqual({ "x-api-key": "k" });
    expect(JSON.parse(sent!.body.get("segments") as string)).toEqual([
      { start: 0, end: 2 },
      { start: 2.5, end: 5 },
      { start: 5.5, end: 8 },
    ]);
    expect(sent!.body.get("threshold")).toBe("0.5");
    expect((sent!.body.get("audio") as File).name).toBe("sys.webm");
    expect(out.error).toBeUndefined();
    expect(out.speakerCount).toBe(2);
    expect(out.utterances.map((u) => u.speaker)).toEqual([0, 1, 0]);
    expect(out.utterances[1].words[0].speaker).toBe(1);
  });

  it("sends both long requests through the client without the 5-minute header limit", async () => {
    // Node's fetch drops a request whose server takes over 5 minutes to answer.
    // A long meeting on CPU does, so both calls must carry the custom dispatcher.
    const inits: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        inits.push(init);
        if (url.endsWith("/diarize")) return new Response(JSON.stringify({ labels: [0, 1] }));
        return new Response(
          JSON.stringify({
            segments: [
              { start: 0, end: 1.5, text: " Hi", words: [{ word: " Hi", start: 0, end: 1.5 }] },
              { start: 2.5, end: 4, text: " Yo", words: [{ word: " Yo", start: 2.5, end: 4 }] },
            ],
          }),
        );
      }),
    );
    await transcribeChannelWithWhisper({ buffer: Buffer.alloc(8) }, "en", {
      config: {
        baseUrl: "http://whisper:8000",
        model: "turbo",
        liveModel: "turbo",
        liveInterimMs: 0,
        batchTimeoutMs: 1000,
      },
      diarize: true,
      diarizeConfig: config,
    });
    expect(inits).toHaveLength(2);
    for (const init of inits) {
      expect((init as RequestInit & { dispatcher?: unknown }).dispatcher).toBe(
        longRequestDispatcher,
      );
    }
  });

  it("keeps the transcript and reports why when the voice service is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const out = await diarizeUtterances(Buffer.alloc(1), file, three, config);
    expect(out.utterances).toBe(three);
    expect(out.speakerCount).toBe(1);
    expect(out.error).toMatch(/unreachable/);
  });

  it("rejects labels that don't line up with the utterances", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ labels: [0, 1] }))),
    );
    const out = await diarizeUtterances(Buffer.alloc(1), file, three, config);
    expect(out.utterances).toBe(three);
    expect(out.error).toMatch(/malformed/);
  });

  it("doesn't call the service for fewer than two utterances or when turned off", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await diarizeUtterances(Buffer.alloc(1), file, [three[0]], config);
    await diarizeUtterances(Buffer.alloc(1), file, three, { ...config, enabled: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is on wherever the voice service is configured, and can be turned off", () => {
    expect(getWhisperDiarizeConfig().enabled).toBe(false);
    process.env.VOICE_AI_URL = "http://voice:8001/";
    expect(getWhisperDiarizeConfig()).toMatchObject({
      enabled: true,
      voiceAiUrl: "http://voice:8001",
    });
    process.env.WHISPER_DIARIZE = "false";
    expect(getWhisperDiarizeConfig().enabled).toBe(false);
  });
});

describe("post-meeting Whisper pass with separation", () => {
  const whisperBody = {
    text: "",
    language: "en",
    segments: [
      { start: 0, end: 1.5, text: " Hi", words: [{ word: " Hi", start: 0, end: 1.5 }] },
      { start: 2.5, end: 4, text: " Hello", words: [{ word: " Hello", start: 2.5, end: 4 }] },
    ],
  };

  const stub = (calls: string[]) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.endsWith("/diarize")) return new Response(JSON.stringify({ labels: [0, 1] }));
        return new Response(JSON.stringify(whisperBody));
      }),
    );

  const whisper = {
    baseUrl: "http://whisper:8000",
    model: "turbo",
    liveModel: "turbo",
    liveInterimMs: 0,
    batchTimeoutMs: 1000,
  };

  it("separates speakers on the channel it's asked to, reusing the same audio", async () => {
    const calls: string[] = [];
    stub(calls);
    const out = await transcribeChannelWithWhisper({ buffer: Buffer.alloc(8) }, "en", {
      config: whisper,
      diarize: true,
      diarizeConfig: config,
    });
    expect(calls).toEqual([
      "http://whisper:8000/v1/audio/transcriptions",
      "http://voice:8001/diarize",
    ]);
    expect(out.utterances.map((u) => u.speaker)).toEqual([0, 1]);
    expect(out.speakerCount).toBe(2);
  });

  it("leaves the mic channel alone", async () => {
    const calls: string[] = [];
    stub(calls);
    const out = await transcribeChannelWithWhisper({ buffer: Buffer.alloc(8) }, "en", {
      config: whisper,
      diarizeConfig: config,
    });
    expect(calls).toEqual(["http://whisper:8000/v1/audio/transcriptions"]);
    expect(out.utterances.map((u) => u.speaker)).toEqual([0, 0]);
  });
});
