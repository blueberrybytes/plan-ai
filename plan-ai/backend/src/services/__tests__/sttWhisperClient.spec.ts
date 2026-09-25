import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../utils/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getSttProvider, getWhisperConfig, DEFAULT_WHISPER_MODEL } from "../stt/sttConfig";
import {
  buildPrompt,
  isLikelyHallucination,
  pcm16ToWav,
  toDeepgramWord,
  toWhisperLanguage,
  transcribeWithWhisper,
  WhisperRequestError,
} from "../stt/whisperClient";
import { toChannelUtterances, transcribeChannelWithWhisper } from "../stt/whisperPrerecorded";
import { whisperLiveOptionsFrom } from "../stt/liveTranscriber";

const ENV_KEYS = [
  "STT_PROVIDER",
  "WHISPER_BASE_URL",
  "WHISPER_MODEL",
  "WHISPER_LIVE_MODEL",
  "WHISPER_LIVE_INTERIM_MS",
  "WHISPER_API_KEY",
];

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  vi.unstubAllGlobals();
});

describe("STT provider selection", () => {
  it("defaults to Deepgram, so existing deployments keep working untouched", () => {
    expect(getSttProvider()).toBe("deepgram");
  });

  it("switches to Whisper, case-insensitively", () => {
    process.env.STT_PROVIDER = " Whisper ";
    expect(getSttProvider()).toBe("whisper");
  });

  it("falls back to Deepgram on a typo instead of breaking transcription", () => {
    process.env.STT_PROVIDER = "wisper";
    expect(getSttProvider()).toBe("deepgram");
  });

  it("uses the batch model for live captions unless one is set for live", () => {
    process.env.WHISPER_MODEL = "Systran/faster-whisper-large-v3";
    expect(getWhisperConfig().liveModel).toBe("Systran/faster-whisper-large-v3");
    process.env.WHISPER_LIVE_MODEL = "Systran/faster-whisper-small";
    expect(getWhisperConfig().liveModel).toBe("Systran/faster-whisper-small");
  });

  it("has usable defaults and ignores a nonsense interim value", () => {
    process.env.WHISPER_BASE_URL = "http://whisper:8000/";
    process.env.WHISPER_LIVE_INTERIM_MS = "soon";
    const c = getWhisperConfig();
    expect(c.baseUrl).toBe("http://whisper:8000");
    expect(c.model).toBe(DEFAULT_WHISPER_MODEL);
    expect(c.liveInterimMs).toBe(1500);
  });
});

describe("Deepgram language codes for Whisper", () => {
  it("maps multi and empty to auto-detection", () => {
    expect(toWhisperLanguage("multi")).toBeUndefined();
    expect(toWhisperLanguage("")).toBeUndefined();
    expect(toWhisperLanguage(null)).toBeUndefined();
  });

  it("drops the region Deepgram codes can carry", () => {
    expect(toWhisperLanguage("en-US")).toBe("en");
    expect(toWhisperLanguage("es-419")).toBe("es");
    expect(toWhisperLanguage("pt-BR")).toBe("pt");
  });

  it("keeps Catalan as Catalan (Deepgram's multi mode would lose it)", () => {
    expect(toWhisperLanguage("ca")).toBe("ca");
  });
});

describe("vocabulary prompt", () => {
  it("joins project keywords as plain text", () => {
    expect(buildPrompt(["Jira", " Plan AI ", ""])).toBe("Jira, Plan AI.");
  });

  it("stops before the prompt window, dropping whole terms", () => {
    const many = Array.from({ length: 200 }, (_, i) => `keyword${i}`);
    const out = buildPrompt(many)!;
    expect(out.length).toBeLessThanOrEqual(600);
    expect(many).toContain(out.slice(0, -1).split(", ").pop());
  });

  it("sends nothing when there are no keywords", () => {
    expect(buildPrompt([])).toBeUndefined();
    expect(buildPrompt(undefined)).toBeUndefined();
  });

  it("treats Whisper repeating the prompt back as noise", () => {
    expect(isLikelyHallucination("Jira, Plan AI.", "Jira, Plan AI.")).toBe(true);
    expect(isLikelyHallucination("Revisamos Jira", "Jira, Plan AI.")).toBe(false);
  });
});

describe("hallucination filter", () => {
  it("drops the subtitle credits Whisper invents over silence", () => {
    expect(isLikelyHallucination("Subtítulos realizados por la comunidad de Amara.org")).toBe(true);
    expect(isLikelyHallucination(" Thanks for watching! ")).toBe(true);
    expect(isLikelyHallucination("...")).toBe(true);
  });

  it("keeps short real replies that happen to be polite", () => {
    expect(isLikelyHallucination("Gracias")).toBe(false);
    expect(isLikelyHallucination("Thank you")).toBe(false);
    expect(isLikelyHallucination("Gracias por ver el vídeo de ayer, Marta")).toBe(false);
  });
});

describe("word mapping to Deepgram's shape", () => {
  it("splits the display form from the bare lowercase word and shifts the timing", () => {
    expect(toDeepgramWord({ word: " Railway,", start: 1, end: 1.4, probability: 0.9 }, 10)).toEqual(
      {
        word: "railway",
        punctuated_word: "Railway,",
        start: 11,
        end: 11.4,
        confidence: 0.9,
      },
    );
  });

  it("keeps inner apostrophes (Catalan l'informe)", () => {
    expect(toDeepgramWord({ word: " l'informe.", start: 0, end: 1 }).word).toBe("l'informe");
  });
});

describe("pcm16ToWav", () => {
  it("writes a valid mono 16-bit header around the samples", () => {
    const pcm = Buffer.alloc(480);
    const wav = pcm16ToWav(pcm, 24000);
    expect(wav.length).toBe(44 + 480);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(480);
  });
});

const whisperResponse = {
  task: "transcribe",
  language: "es",
  duration: 6,
  text: "Buenos días. Revisamos Jira.",
  segments: [
    {
      start: 0,
      end: 5,
      text: " Buenos días. Revisamos Jira.",
      words: [
        { word: " Buenos", start: 0.0, end: 0.4, probability: 0.9 },
        { word: " días.", start: 0.4, end: 0.9, probability: 0.9 },
        // 1.1 s pause: Deepgram would start a new utterance here.
        { word: " Revisamos", start: 2.0, end: 2.6, probability: 0.8 },
        { word: " Jira.", start: 2.6, end: 3.0, probability: 0.7 },
      ],
    },
    {
      start: 5,
      end: 6,
      text: " Subtítulos realizados por la comunidad de Amara.org",
      words: [{ word: " Subtítulos", start: 5, end: 6 }],
    },
  ],
  words: [],
};

describe("post-meeting pass with Whisper", () => {
  it("splits segments on 0.5 s pauses, like Deepgram's utt_split", () => {
    const utterances = toChannelUtterances({
      text: whisperResponse.text,
      segments: whisperResponse.segments,
      words: [],
    });
    expect(utterances.map((u) => u.transcript)).toEqual(["Buenos días.", "Revisamos Jira."]);
    expect(utterances[1]).toMatchObject({ speaker: 0, start: 2.0, end: 3.0 });
    expect(utterances[1].words[1]).toMatchObject({ word: "jira", punctuated_word: "Jira." });
  });

  it("keeps a word Whisper split in two as one word (Catalan l'informe)", () => {
    const [u] = toChannelUtterances({
      text: "",
      segments: [
        {
          start: 0,
          end: 2,
          text: " La Laura enviarà l'informe.",
          words: [
            { word: " La", start: 0, end: 0.2 },
            { word: " Laura", start: 0.2, end: 0.6 },
            { word: " enviarà", start: 0.6, end: 1.1 },
            { word: " l", start: 1.1, end: 1.2 },
            { word: "'informe.", start: 1.2, end: 1.8 },
          ],
        },
      ],
      words: [],
    });
    expect(u.transcript).toBe("La Laura enviarà l'informe.");
  });

  it("keeps a segment without word timings whole instead of losing it", () => {
    const utterances = toChannelUtterances({
      text: "Hola",
      segments: [{ start: 1, end: 2, text: "Hola", words: [] }],
      words: [],
    });
    expect(utterances).toEqual([{ speaker: 0, transcript: "Hola", start: 1, end: 2, words: [] }]);
  });

  it("downloads a stored recording and sends it with the right options", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.startsWith("https://storage.example.com")) {
          return new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "audio/webm;codecs=opus" },
          });
        }
        return new Response(JSON.stringify(whisperResponse), { status: 200 });
      }),
    );

    const result = await transcribeChannelWithWhisper(
      { url: "https://storage.example.com/recordings/mic-123?sig=abc" },
      "ca",
      {
        config: {
          baseUrl: "http://whisper:8000",
          model: "turbo",
          liveModel: "small",
          liveInterimMs: 0,
          batchTimeoutMs: 1000,
        },
      },
    );

    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe("http://whisper:8000/v1/audio/transcriptions");
    const form = calls[1].init!.body as FormData;
    expect(form.get("model")).toBe("turbo");
    expect(form.get("language")).toBe("ca");
    expect(form.get("vad_filter")).toBe("true");
    expect(form.getAll("timestamp_granularities[]")).toEqual(["segment", "word"]);
    expect((form.get("file") as File).name).toBe("audio.webm");
    expect(result.utterances).toHaveLength(2);
    expect(result.detectedLanguage).toBe("es");
  });

  it("lets Whisper detect the language when the recorder asked for multi", async () => {
    let sent: FormData | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        sent = init?.body as FormData;
        return new Response(JSON.stringify(whisperResponse));
      }),
    );
    await transcribeWithWhisper(
      Buffer.alloc(10),
      { model: "turbo", language: "multi" },
      {
        baseUrl: "http://w",
        model: "turbo",
        liveModel: "turbo",
        liveInterimMs: 0,
        batchTimeoutMs: 1000,
      },
    );
    expect(sent!.has("language")).toBe(false);
  });

  it("fails loudly with the status when the server rejects the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("model not installed", { status: 404 })),
    );
    await expect(
      transcribeWithWhisper(
        Buffer.alloc(10),
        { model: "missing" },
        {
          baseUrl: "http://w",
          model: "missing",
          liveModel: "missing",
          liveInterimMs: 0,
          batchTimeoutMs: 1000,
        },
      ),
    ).rejects.toMatchObject({ name: "WhisperRequestError", status: 404 });
    expect(WhisperRequestError).toBeDefined();
  });
});

describe("live config mapping", () => {
  const whisper = {
    baseUrl: "http://w",
    model: "turbo",
    liveModel: "small",
    liveInterimMs: 1500,
    batchTimeoutMs: 1000,
  };

  it("reads the recorder's Deepgram config", () => {
    const o = whisperLiveOptionsFrom(
      {
        model: "nova-3",
        language: "es",
        sample_rate: 24000,
        endpointing: 500,
        utterance_end_ms: 1000,
        interim_results: true,
        keyterm: ["Jira", "Twenty"],
      },
      whisper,
    );
    expect(o).toMatchObject({
      model: "small",
      language: "es",
      sampleRate: 24000,
      endpointingMs: 500,
      utteranceEndMs: 1000,
      interimMs: 1500,
      keyterms: ["Jira", "Twenty"],
    });
  });

  it("honours interim_results=false and fills defaults", () => {
    const o = whisperLiveOptionsFrom({ interim_results: false, endpointing: false }, whisper);
    expect(o).toMatchObject({ interimMs: 0, endpointingMs: 500, sampleRate: 24000 });
  });
});
