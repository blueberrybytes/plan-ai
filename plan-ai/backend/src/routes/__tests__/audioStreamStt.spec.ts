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
  translate: vi.fn(),
}));

vi.mock("../../firebase/firebaseAdmin", () => ({
  firebaseAdmin: {
    auth: () => ({
      verifyIdToken: async () => ({
        uid: "fuid_1",
        email: "ana@example.com",
        auth_time: Math.floor(Date.now() / 1000),
        firebase: { sign_in_provider: "google.com" },
      }),
      getUser: async () => ({ disabled: false, tokensValidAfterTime: undefined }),
    }),
  },
}));
vi.mock("../../prisma/prismaClient", () => ({
  default: {
    user: { findUnique: async () => ({ id: "user_1", email: "ana@example.com", role: "CLIENT" }) },
    workspace: { findUnique: async () => mocks.workspace },
    workspaceMember: {
      findFirst: async () => null,
      // user_1 belongs to ws_1 only.
      findUnique: async ({
        where,
      }: {
        where: { workspaceId_userId: { workspaceId: string; userId: string } };
      }) =>
        where.workspaceId_userId.workspaceId === "ws_1" &&
        where.workspaceId_userId.userId === "user_1"
          ? {
              id: "m1",
              role: "MEMBER",
              workspace: {
                allowedEmailDomains: [],
                requireMfa: false,
                requiredSignInProvider: null,
              },
            }
          : null,
    },
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

// The translator itself is real. Only the model call behind it is replaced.
vi.mock("../../services/liveTranslationService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/liveTranslationService")>()),
  workspaceTranslateFn: () => mocks.translate,
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
  mocks.translate.mockReset();
  mocks.translate.mockImplementation(async (req: { text: string; targetLanguage: string }) => ({
    text: `[${req.targetLanguage}] ${req.text}`,
    inputTokens: 10,
    outputTokens: 5,
  }));
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
      id: expect.stringMatching(/^[0-9a-f]{8}-mic-1$/),
    });
    // Nobody asked for a translation, so the model is never called.
    expect(mocks.translate).not.toHaveBeenCalled();

    ws.send(JSON.stringify({ type: "end_stream" }));
    await vi.waitFor(() => expect(mocks.logUsage).toHaveBeenCalled());
    expect(mocks.logUsage).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "WHISPER", model: "turbo", feature: "RECORDER" }),
    );
    ws.close();
  });
});

describe("live translation on the recorder audio stream", () => {
  const final = (text: string) => ({
    type: "Results",
    is_final: true,
    start: 0,
    channel: { alternatives: [{ transcript: text, words: [] }] },
  });

  it("sends the translation of each finished phrase with the phrase id", async () => {
    process.env.STT_PROVIDER = "whisper";
    const { ws, messages, waitFor } = connect(
      "token=t&workspaceId=ws_1&language=es&translateTo=en",
    );
    await waitFor((m) => m.type === "ready" && m.source === "mic");
    const conn = mocks.whisperConn as FakeConnection;

    // Interim text is shown but not translated.
    conn.emit("Results", { ...final("Hola"), is_final: false });
    conn.emit("Results", final("Hola equipo"));
    const caption = await waitFor((m) => m.type === "transcript" && m.isFinal === true);
    const translation = await waitFor((m) => m.type === "translation");
    expect(translation).toEqual({
      type: "translation",
      id: caption.id,
      source: "mic",
      text: "[en] Hola equipo",
      language: "en",
    });
    expect(mocks.translate).toHaveBeenCalledTimes(1);

    // Change the target in the middle of the meeting.
    ws.send(JSON.stringify({ type: "set_translation", language: "fr" }));
    await new Promise((r) => setTimeout(r, 30));
    conn.emit("Results", final("Empezamos"));
    const second = await waitFor((m) => m.type === "translation" && m.language === "fr");
    expect(second.text).toBe("[fr] Empezamos");
    expect(mocks.translate.mock.calls[1][0]).toMatchObject({ context: ["Hola equipo"] });

    // Turn it off: phrases keep coming, translations stop.
    ws.send(JSON.stringify({ type: "set_translation", language: null }));
    await new Promise((r) => setTimeout(r, 30));
    conn.emit("Results", final("Hasta luego"));
    await waitFor((m) => m.type === "transcript" && m.text === "Hasta luego");
    await new Promise((r) => setTimeout(r, 50));
    expect(messages.filter((m) => m.type === "translation")).toHaveLength(2);
    expect(mocks.translate).toHaveBeenCalledTimes(2);

    ws.send(JSON.stringify({ type: "end_stream" }));
    await vi.waitFor(() =>
      expect(mocks.logUsage).toHaveBeenCalledWith(
        expect.objectContaining({ feature: "LIVE_TRANSLATION", inputTokens: 20, outputTokens: 10 }),
      ),
    );
    ws.close();
  });

  it("can be turned on after the stream started", async () => {
    process.env.STT_PROVIDER = "whisper";
    const { ws, waitFor } = connect("token=t&workspaceId=ws_1&language=es");
    await waitFor((m) => m.type === "ready" && m.source === "mic");
    ws.send(JSON.stringify({ type: "set_translation", language: "en" }));
    await new Promise((r) => setTimeout(r, 30));
    (mocks.whisperConn as FakeConnection).emit("Results", final("Buenos días"));
    const translation = await waitFor((m) => m.type === "translation");
    expect(translation.text).toBe("[en] Buenos días");
    ws.close();
  });

  it("ignores a language that is not on offer", async () => {
    process.env.STT_PROVIDER = "whisper";
    const { ws, messages, waitFor } = connect(
      "token=t&workspaceId=ws_1&language=es&translateTo=klingon",
    );
    await waitFor((m) => m.type === "ready" && m.source === "mic");
    (mocks.whisperConn as FakeConnection).emit("Results", final("Hola equipo"));
    await waitFor((m) => m.type === "transcript");
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.translate).not.toHaveBeenCalled();
    expect(messages.some((m) => m.type === "translation")).toBe(false);
    ws.close();
  });

  it("tells the client when the workspace has no AI key and keeps recording", async () => {
    process.env.STT_PROVIDER = "whisper";
    const { MissingApiKeyError } = await import("../../utils/aiModelUtils");
    mocks.translate.mockRejectedValue(new MissingApiKeyError());
    const { ws, waitFor } = connect("token=t&workspaceId=ws_1&language=es&translateTo=en");
    await waitFor((m) => m.type === "ready" && m.source === "mic");
    const conn = mocks.whisperConn as FakeConnection;
    conn.emit("Results", final("Hola equipo"));
    expect(await waitFor((m) => m.type === "translation_error")).toEqual({
      type: "translation_error",
      code: "MISSING_API_KEY",
    });
    conn.emit("Results", final("Seguimos"));
    await waitFor((m) => m.type === "transcript" && m.text === "Seguimos");
    expect(ws.readyState).toBe(WebSocket.OPEN);
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

  it("refuses a workspace the user does not belong to, before touching its key", async () => {
    mocks.workspace = { id: "ws_other", deepgramKey: "a".repeat(40), isCourtesy: false };
    const { ws, waitFor } = connect("token=t&workspaceId=ws_other&language=es");
    const err = await waitFor((m) => m.type === "error");
    expect(String(err.message)).toContain("Not a member of this workspace");
    expect(mocks.createDeepgram).not.toHaveBeenCalled();
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
