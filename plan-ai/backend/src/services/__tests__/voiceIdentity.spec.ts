import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("../../prisma/prismaClient", () => ({
  default: { workspaceMember: { findMany: mocks.findMany } },
}));

import {
  identifyOtherSpeakers,
  loadWorkspaceVoices,
  getVoiceIdentityConfig,
  type VoiceIdentityConfig,
} from "../voiceIdentityService";
import { longRequestDispatcher } from "../stt/longRequest";

const config: VoiceIdentityConfig = {
  enabled: true,
  voiceAiUrl: "http://voice:8001",
  apiKey: "k",
  minSimilarity: 0.45,
  timeoutMs: 1000,
};

const voices = [
  { userId: "u_marta", name: "Marta Ruiz", voiceProfileUrl: "https://storage/marta.m4a" },
  { userId: "u_luis", name: "Luis", voiceProfileUrl: "https://storage/luis.m4a" },
];

const utterances = [
  { speaker: "Xavier", start: 0, end: 3 }, // the mic user, already named
  { speaker: "Others 0", start: 1, end: 4 },
  { speaker: "Others 1", start: 5, end: 9 },
  { speaker: "Others 0", start: 10, end: 12 },
];

beforeEach(() => mocks.findMany.mockReset());
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.VOICE_AI_URL;
  delete process.env.VOICE_IDENTIFY;
  delete process.env.VOICE_IDENTIFY_MIN_SIMILARITY;
});

describe("naming other participants by voice", () => {
  it("sends only the system-audio speakers and maps matches to member names", async () => {
    let body: FormData | undefined;
    let init: (RequestInit & { dispatcher?: unknown }) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, i: RequestInit) => {
        init = i;
        body = i.body as FormData;
        return new Response(
          JSON.stringify({
            matches: [{ speaker: "Others 1", profile_id: "u_marta", score: 0.71 }],
          }),
        );
      }),
    );

    const out = await identifyOtherSpeakers("https://storage/sys.m4a", utterances, voices, config);

    expect(out).toEqual({ names: { "Others 1": "Marta Ruiz" } });
    expect(body!.get("audio_url")).toBe("https://storage/sys.m4a");
    const segs = JSON.parse(body!.get("segments") as string) as Array<{ speaker: string }>;
    expect(segs.map((s) => s.speaker)).toEqual(["Others 0", "Others 1", "Others 0"]);
    expect(JSON.parse(body!.get("profiles") as string)).toEqual([
      { id: "u_marta", url: "https://storage/marta.m4a" },
      { id: "u_luis", url: "https://storage/luis.m4a" },
    ]);
    expect(body!.get("min_similarity")).toBe("0.45");
    expect(init!.dispatcher).toBe(longRequestDispatcher);
  });

  it("ignores matches for labels or people it didn't send", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              matches: [
                { speaker: "Xavier", profile_id: "u_luis" },
                { speaker: "Others 0", profile_id: "u_stranger" },
              ],
            }),
          ),
      ),
    );
    expect((await identifyOtherSpeakers("u", utterances, voices, config)).names).toEqual({});
  });

  it("keeps everyone anonymous and reports why when the service is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const out = await identifyOtherSpeakers("u", utterances, voices, config);
    expect(out.names).toEqual({});
    expect(out.error).toMatch(/unreachable/);
  });

  it("doesn't call the service without system speakers, profiles, or when turned off", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await identifyOtherSpeakers("u", [{ speaker: "Xavier", start: 0, end: 3 }], voices, config);
    await identifyOtherSpeakers("u", utterances, [], config);
    await identifyOtherSpeakers("u", utterances, voices, { ...config, enabled: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is on wherever the voice service is configured, and can be turned off", () => {
    expect(getVoiceIdentityConfig().enabled).toBe(false);
    process.env.VOICE_AI_URL = "http://voice:8001/";
    process.env.VOICE_IDENTIFY_MIN_SIMILARITY = "0.6";
    expect(getVoiceIdentityConfig()).toMatchObject({
      enabled: true,
      voiceAiUrl: "http://voice:8001",
      minSimilarity: 0.6,
    });
    process.env.VOICE_IDENTIFY = "false";
    expect(getVoiceIdentityConfig().enabled).toBe(false);
  });
});

describe("which members can be recognised", () => {
  it("takes members with a name and an uploaded profile, never the recording user", async () => {
    mocks.findMany.mockResolvedValue([
      {
        user: { id: "u_marta", name: " Marta Ruiz ", voiceProfileUrl: "https://storage/marta.m4a" },
      },
      { user: { id: "u_noname", name: null, voiceProfileUrl: "https://storage/x.m4a" } },
      { user: { id: "u_noprofile", name: "Ana", voiceProfileUrl: null } },
      { user: { id: "u_old", name: "Old", voiceProfileUrl: "local://profile.m4a" } },
    ]);
    const got = await loadWorkspaceVoices("ws_1", "u_me");
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws_1", userId: { not: "u_me" } } }),
    );
    expect(got).toEqual([
      { userId: "u_marta", name: "Marta Ruiz", voiceProfileUrl: "https://storage/marta.m4a" },
    ]);
  });
});
