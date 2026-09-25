import { describe, it, expect, vi } from "vitest";

vi.mock("../../utils/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { LiveTranscriptionEvents } from "@deepgram/sdk";
import { WhisperLiveConnection, type WhisperLiveOptions } from "../stt/whisperLiveConnection";
import type { WhisperTranscription } from "../stt/whisperClient";

/**
 * The live Whisper connection stands in for Deepgram's socket in
 * routes/audioStream.ts, so what matters is the event contract that file
 * relies on: Open before audio, SpeechStarted when someone talks, finals in
 * spoken order, UtteranceEnd after the final it closes, a flush on close.
 */

const RATE = 24000;

const silence = (ms: number): Buffer => Buffer.alloc(Math.round((RATE * ms) / 1000) * 2);

const tone = (ms: number, amplitude = 0.3): Buffer => {
  const n = Math.round((RATE * ms) / 1000);
  const b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / RATE) * amplitude * 32767), i * 2);
  }
  return b;
};

/** Whisper stand-in: answers with the next line of `texts`, one word per text token. */
const fakeWhisper = (texts: string[]) => {
  let call = 0;
  return vi.fn(async (wav: Buffer): Promise<WhisperTranscription> => {
    const text = texts[Math.min(call++, texts.length - 1)];
    const seconds = (wav.length - 44) / 2 / RATE;
    const tokens = text.split(" ").filter(Boolean);
    const step = seconds / Math.max(tokens.length, 1);
    return {
      text,
      segments: [
        {
          start: 0,
          end: seconds,
          text,
          words: tokens.map((w, i) => ({ word: ` ${w}`, start: i * step, end: (i + 1) * step })),
        },
      ],
      words: [],
    };
  });
};

type Event = { name: string; data: Record<string, unknown> };

const open = async (overrides: Partial<WhisperLiveOptions>) => {
  const conn = new WhisperLiveConnection({
    whisper: {
      baseUrl: "http://w",
      model: "m",
      liveModel: "m",
      liveInterimMs: 0,
      batchTimeoutMs: 1,
    },
    model: "m",
    language: "es",
    sampleRate: RATE,
    endpointingMs: 500,
    utteranceEndMs: 1000,
    interimMs: 0,
    watchdogMs: 0,
    healthCheck: async () => true,
    ...overrides,
  });
  const events: Event[] = [];
  for (const name of Object.values(LiveTranscriptionEvents)) {
    conn.on(name, (data: Record<string, unknown>) => events.push({ name, data }));
  }
  await new Promise((r) => setImmediate(r));
  return { conn, events };
};

/** Sends audio the way the recorder does: 100 ms packets, in real-time order. */
const stream = async (conn: WhisperLiveConnection, audio: Buffer, yieldEachPacket = false) => {
  const packet = (RATE / 10) * 2;
  for (let o = 0; o < audio.length; o += packet) {
    conn.send(audio.subarray(o, o + packet));
    if (yieldEachPacket) await new Promise((r) => setImmediate(r));
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 100 ms packets, `wallMsPerPacket` apart: a sped-up but still paced stream. */
const streamPaced = async (conn: WhisperLiveConnection, audio: Buffer, wallMsPerPacket: number) => {
  const packet = (RATE / 10) * 2;
  for (let o = 0; o < audio.length; o += packet) {
    conn.send(audio.subarray(o, o + packet));
    await sleep(wallMsPerPacket);
  }
};

const closed = (conn: WhisperLiveConnection) =>
  new Promise<void>((resolve) => {
    conn.on(LiveTranscriptionEvents.Close, () => resolve());
    conn.requestClose();
  });

const results = (events: Event[]) => events.filter((e) => e.name === "Results");

describe("WhisperLiveConnection", () => {
  it("opens on the next tick, like Deepgram's socket, and ignores audio before that", async () => {
    const transcribe = fakeWhisper(["hola"]);
    const conn = new WhisperLiveConnection({
      whisper: {
        baseUrl: "http://w",
        model: "m",
        liveModel: "m",
        liveInterimMs: 0,
        batchTimeoutMs: 1,
      },
      model: "m",
      sampleRate: RATE,
      endpointingMs: 500,
      utteranceEndMs: 1000,
      interimMs: 0,
      watchdogMs: 0,
      healthCheck: async () => true,
      transcribe,
    });
    expect(conn.getReadyState()).toBe(0);
    conn.send(tone(1000));
    await new Promise((r) => setImmediate(r));
    expect(conn.getReadyState()).toBe(1);
    await closed(conn);
    expect(transcribe).not.toHaveBeenCalled();
    expect(conn.getReadyState()).toBe(3);
  });

  it("emits two sentences in spoken order, each followed by its UtteranceEnd", async () => {
    const transcribe = fakeWhisper(["primera frase", "segunda frase"]);
    const { conn, events } = await open({ transcribe });

    await stream(
      conn,
      Buffer.concat([silence(500), tone(1200), silence(1500), tone(800), silence(1500)]),
    );
    await closed(conn);

    expect(events.filter((e) => e.name === "SpeechStarted")).toHaveLength(2);
    const ordered = events
      .filter((e) => e.name === "Results" || e.name === "UtteranceEnd")
      .map((e) =>
        e.name === "Results"
          ? (e.data.channel as { alternatives: { transcript: string }[] }).alternatives[0]
              .transcript
          : "UtteranceEnd",
      );
    expect(ordered).toEqual(["primera frase", "UtteranceEnd", "segunda frase", "UtteranceEnd"]);
    expect(results(events).every((e) => e.data.is_final === true)).toBe(true);
    expect(events[events.length - 1].name).toBe("close");
  });

  it("places words on the stream's clock, which the echo deduper depends on", async () => {
    const { conn, events } = await open({ transcribe: fakeWhisper(["hola equipo"]) });
    await stream(conn, Buffer.concat([silence(2000), tone(1000), silence(800)]));
    await closed(conn);

    const [first] = results(events);
    // 2.0 s of silence minus 300 ms of pre-roll kept before the onset.
    expect(first.data.start as number).toBeCloseTo(1.7, 1);
    const words = (first.data.channel as { alternatives: { words: { start: number }[] }[] })
      .alternatives[0].words;
    expect(words[0].start).toBeCloseTo(1.7, 1);
    expect(words[1].start).toBeGreaterThan(words[0].start);
  });

  it("flushes the sentence in progress when the recording stops", async () => {
    const { conn, events } = await open({ transcribe: fakeWhisper(["última frase"]) });
    await stream(conn, tone(1500)); // no trailing silence: still mid-sentence
    await closed(conn);

    expect(results(events)).toHaveLength(1);
    expect(results(events)[0].data.is_final).toBe(true);
    expect(events[events.length - 1].name).toBe("close");
  });

  it("shows interim captions while speaking, and none after the final", async () => {
    const transcribe = fakeWhisper(["hola", "hola que", "hola que tal", "hola que tal estás"]);
    const { conn, events } = await open({ transcribe, interimMs: 1000 });

    await stream(conn, Buffer.concat([tone(3500), silence(1200)]), true);
    await closed(conn);

    const all = results(events);
    const finalIndex = all.findIndex((e) => e.data.is_final === true);
    expect(finalIndex).toBeGreaterThan(0); // at least one interim first
    expect(all.slice(0, finalIndex).every((e) => e.data.is_final === false)).toBe(true);
    expect(all.slice(finalIndex + 1)).toHaveLength(0);
  });

  it("keeps interim captions flowing when the server is fast (GPU)", async () => {
    const texts = ["a", "a b", "a b c", "a b c d", "a b c d e", "a b c d e f"];
    const fast = fakeWhisper(texts);
    const { conn, events } = await open({
      interimMs: 300,
      transcribe: async (wav, o) => {
        await sleep(5);
        return fast(wav, o);
      },
    });
    await streamPaced(conn, Buffer.concat([tone(3000), silence(1000)]), 10);
    await closed(conn);
    expect(results(events).filter((e) => e.data.is_final === false).length).toBeGreaterThanOrEqual(
      3,
    );
  });

  it("stops asking for interims when the server is slower than they're due (CPU)", async () => {
    const slow = fakeWhisper(["a", "a b", "a b c"]);
    const calls: boolean[] = [];
    const { conn, events } = await open({
      interimMs: 300,
      transcribe: async (wav, o) => {
        calls.push(true);
        await sleep(400);
        return slow(wav, o);
      },
    });
    await streamPaced(conn, Buffer.concat([tone(3000), silence(1000)]), 10);
    await closed(conn);
    // One interim to learn the server is slow, then only the final.
    expect(calls).toHaveLength(2);
    expect(results(events).filter((e) => e.data.is_final === true)).toHaveLength(1);
  });

  it("splits a long monologue so captions keep coming", async () => {
    const transcribe = fakeWhisper(["trozo"]);
    const { conn } = await open({ transcribe, maxSegmentMs: 5000 });
    await stream(conn, Buffer.concat([tone(12_000), silence(800)]));
    await closed(conn);
    expect(transcribe).toHaveBeenCalledTimes(3);
  });

  it("drops Whisper's invented subtitle credits", async () => {
    const { conn, events } = await open({
      transcribe: fakeWhisper(["Subtítulos realizados por la comunidad de Amara.org"]),
    });
    await stream(conn, Buffer.concat([tone(800), silence(1500)]));
    await closed(conn);
    expect(results(events)).toHaveLength(0);
    expect(events.some((e) => e.name === "UtteranceEnd")).toBe(true);
  });

  it("ignores silence and a steady hum instead of sending them as speech", async () => {
    const transcribe = fakeWhisper(["ruido"]);
    const { conn } = await open({ transcribe });
    // A fan at about -37 dBFS: above the absolute floor, so only the
    // adaptive noise floor can tell it's not a voice.
    await stream(conn, Buffer.concat([silence(3000), tone(8000, 0.02)]));
    await closed(conn);
    const sentSeconds = transcribe.mock.calls.reduce(
      (s, [wav]) => s + ((wav as Buffer).length - 44) / 2 / RATE,
      0,
    );
    expect(sentSeconds).toBeLessThan(3);
  });

  it("reports a failing server once, not once per sentence", async () => {
    const transcribe = vi.fn(async () => {
      throw new Error("connection refused");
    });
    const { conn, events } = await open({ transcribe });
    await stream(
      conn,
      Buffer.concat([tone(800), silence(1500), tone(800), silence(1500), tone(800), silence(1500)]),
    );
    await closed(conn);
    expect(transcribe).toHaveBeenCalledTimes(3);
    expect(events.filter((e) => e.name === "error")).toHaveLength(1);
  });

  it("stays quiet when every listener is gone (language change mid health check)", async () => {
    // audioStream detaches all listeners from the connection it replaces. An
    // "error" emitted with none attached would throw out of a void promise
    // and take the process down.
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      let resolveCheck!: (ok: boolean) => void;
      const { conn } = await open({
        transcribe: fakeWhisper(["x"]),
        healthCheck: () => new Promise<boolean>((r) => (resolveCheck = r)),
      });
      conn.removeAllListeners();
      resolveCheck(false);
      await sleep(20);
      expect(unhandled).toEqual([]);
      conn.requestClose();
      await sleep(5);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("warns right away when the server isn't reachable", async () => {
    const { conn, events } = await open({
      transcribe: fakeWhisper(["x"]),
      healthCheck: async () => false,
    });
    await new Promise((r) => setImmediate(r));
    expect(events.some((e) => e.name === "error")).toBe(true);
    await closed(conn);
  });
});
