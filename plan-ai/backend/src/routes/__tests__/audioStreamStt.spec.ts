import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import http from "http";
import type { AddressInfo } from "net";
import WebSocket from "ws";

/**
 * The recorder's WebSocket, end to end, with the speech-to-text provider
 * switched. Firebase, Prisma and billing are stubbed; the route itself is real.
 */

const mocks = vi.hoisted(() => ({
  logUsage: vi.fn(async () => undefined),
  workspace: { id: "ws_1", deepgramKey: null as string | null, isCourtesy: false },
  whisperConn: null as unknown,
  createDeepgram: vi.fn(),
}));

vi.mock("../../firebase/firebaseAdmin", () => ({
  firebaseAdmin: { auth: () => ({ verifyIdToken: async () => ({ email: "ana@example.com" }) }) },
}));
vi.mock("../../prisma/prismaClient", () => ({
  default: {
    user: { findUnique: async () => ({ id: "user_1" }) },
    workspace: { findUnique: async () => mocks.workspace },
    workspaceMember: { findFirst: async () => null },
    context: { findMany: async () => [] },
  },
}));
vi.mock("../../services/subscriptionGuard", () => ({
  checkSubscription: async () => ({ active: true }),
}));
vi.mock("../../services/usageLimitGuard", () => ({
  checkUsageLimit: async () => undefined,
  UsageLimitExceededError: class extends Error {},
}));
vi.mock("../../services/aiUsageService", () => ({
  aiUsageService: { logUsage: mocks.logUsage },
}));
vi.mock("../../utils/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/** A live connection that records what it's sent and opens like Deepgram's. */
class FakeConnection extends EventEmitter {
  sent: Buffer[] = [];
  state = 0;
  constructor() {
    super();
    setImmediate(() => {
      this.state = 1;
      this.emit("open", {});
    });
  }
  send(d: Buffer) {
    this.sent.push(Buffer.from(d));
  }
  requestClose() {
    this.state = 3;
  }
  keepAlive() {}
  getReadyState() {
    return this.state;
  }
}

vi.mock("../../services/stt/liveTranscriber", () => ({
  createDeepgramLiveTranscriber: mocks.createDeepgram,
  createWhisperLiveTranscriber: () => ({
    provider: "whisper",
    usage: { provider: "WHISPER", model: "turbo" },
    live: () => {
      const c = new FakeConnection();
      // The route opens mic first, then sys; the test drives the mic one.
      if (!mocks.whisperConn) mocks.whisperConn = c;
      return c;
    },
  }),
}));

import { setupAudioStream } from "../audioStream";

let server: http.Server;
let url: string;

const connect = (query: string) => {
  const ws = new WebSocket(`${url}/api/audio/stream?${query}`);
  const messages: Array<Record<string, unknown>> = [];
  ws.on("message", (m) => messages.push(JSON.parse(m.toString())));
  const waitFor = (pred: (m: Record<string, unknown>) => boolean, ms = 2000) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        const hit = messages.find(pred);
        if (hit) return resolve(hit);
        if (Date.now() - started > ms)
          return reject(new Error(`timeout; got ${JSON.stringify(messages)}`));
        setTimeout(tick, 10);
      };
      tick();
    });
  return { ws, messages, waitFor };
};

beforeEach(async () => {
  mocks.whisperConn = null;
  mocks.logUsage.mockClear();
  mocks.createDeepgram.mockReset();
  mocks.workspace = { id: "ws_1", deepgramKey: null, isCourtesy: false };
  server = http.createServer();
  setupAudioStream(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  delete process.env.STT_PROVIDER;
  await new Promise((r) => server.close(r));
});

describe("recorder audio stream with STT_PROVIDER=whisper", () => {
  it("records without a Deepgram key and relays captions to the recorder", async () => {
    process.env.STT_PROVIDER = "whisper";
    const { ws, waitFor } = connect("token=t&workspaceId=ws_1&language=es");

    await waitFor((m) => m.type === "ready" && m.source === "mic");
    expect(mocks.createDeepgram).not.toHaveBeenCalled();

    const audio = Buffer.alloc(4800, 1);
    ws.send(
      JSON.stringify({ type: "input_audio", source: "mic", audio: audio.toString("base64") }),
    );
    const conn = mocks.whisperConn as FakeConnection;
    await vi.waitFor(() => expect(conn.sent.length).toBe(1));
    expect(conn.sent[0].equals(audio)).toBe(true);

    conn.emit("Results", {
      type: "Results",
      is_final: true,
      start: 0,
      channel: { alternatives: [{ transcript: "Hola equipo", words: [] }] },
    });
    const caption = await waitFor((m) => m.type === "transcript");
    expect(caption).toEqual({
      type: "transcript",
      source: "mic",
      isFinal: true,
      text: "Hola equipo",
    });

    ws.send(JSON.stringify({ type: "end_stream" }));
    await vi.waitFor(() => expect(mocks.logUsage).toHaveBeenCalled());
    expect(mocks.logUsage).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "WHISPER", model: "turbo", feature: "RECORDER" }),
    );
    ws.close();
  });
});

describe("recorder audio stream with Deepgram (default)", () => {
  it("still refuses to start without a Deepgram key, exactly as before", async () => {
    const { ws, waitFor } = connect("token=t&workspaceId=ws_1&language=es");
    const err = await waitFor((m) => m.type === "error");
    expect(err).toMatchObject({ code: "MISSING_API_KEY", provider: "DEEPGRAM" });
    expect(mocks.whisperConn).toBeNull();
    ws.close();
  });

  it("uses the workspace's own key", async () => {
    mocks.workspace = { id: "ws_1", deepgramKey: "a".repeat(40), isCourtesy: false };
    mocks.createDeepgram.mockReturnValue({
      provider: "deepgram",
      usage: { provider: "DEEPGRAM", model: "nova-3-live" },
      live: () => new FakeConnection(),
    });
    const { ws, waitFor } = connect("token=t&workspaceId=ws_1&language=es");
    await waitFor((m) => m.type === "ready");
    expect(mocks.createDeepgram).toHaveBeenCalledWith("a".repeat(40));
    ws.close();
  });
});
