import prisma from "../prisma/prismaClient";
import { withLongRequestDispatcher } from "./stt/longRequest";

/**
 * Names the other people in a meeting by their voice.
 *
 * Speaker separation (Deepgram's, or the voice service's for Whisper) only
 * says "Others 0", "Others 1". Workspace members who recorded a voice profile
 * in the mobile app can be recognised: the voice service compares each
 * anonymous speaker with those profiles and pairs them one to one when the
 * voices are close enough. A matched speaker gets the member's name in every
 * meeting, not a name the LLM guessed from context.
 *
 * Only the system-audio channel is looked at: the mic is the recording user,
 * whom `identifySpeaker` already handles.
 */

export interface VoiceIdentityConfig {
  enabled: boolean;
  voiceAiUrl: string;
  apiKey?: string;
  /** Cosine similarity a speaker and a profile need to be called the same person. */
  minSimilarity: number;
  timeoutMs: number;
}

const readNumber = (name: string, fallback: number): number => {
  const n = Number(process.env[name]);
  return process.env[name]?.trim() && Number.isFinite(n) ? n : fallback;
};

export const getVoiceIdentityConfig = (): VoiceIdentityConfig => {
  const voiceAiUrl = (process.env.VOICE_AI_URL?.trim() || "").replace(/\/+$/, "");
  return {
    enabled: process.env.VOICE_IDENTIFY?.trim().toLowerCase() !== "false" && voiceAiUrl !== "",
    voiceAiUrl,
    apiKey: process.env.VOICE_AI_API_KEY?.trim() || undefined,
    // Measured on synthetic voices: the same voice scores 0.91 to 0.95 and a
    // different one stays below 0.45. Real voices (profile recorded on a
    // phone, meeting heard through a laptop) score lower, so this is the knob
    // to adjust with real recordings.
    minSimilarity: readNumber("VOICE_IDENTIFY_MIN_SIMILARITY", 0.45),
    timeoutMs: readNumber("VOICE_IDENTIFY_TIMEOUT_MS", 5 * 60 * 1000),
  };
};

export interface KnownVoice {
  userId: string;
  name: string;
  voiceProfileUrl: string;
}

/** Members of the workspace who have a name and an uploaded voice profile. */
export const loadWorkspaceVoices = async (
  workspaceId: string,
  excludeUserId: string,
): Promise<KnownVoice[]> => {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, userId: { not: excludeUserId } },
    select: { user: { select: { id: true, name: true, voiceProfileUrl: true } } },
  });
  return members
    .map((m) => m.user)
    .filter(
      (u): u is { id: string; name: string; voiceProfileUrl: string } =>
        !!u.name?.trim() &&
        !!u.voiceProfileUrl &&
        // Old profiles that never left the device can't be downloaded.
        !u.voiceProfileUrl.startsWith("local://"),
    )
    .map((u) => ({ userId: u.id, name: u.name.trim(), voiceProfileUrl: u.voiceProfileUrl }));
};

export interface SpeakerSpan {
  speaker: string;
  start: number;
  end: number;
}

const SYSTEM_SPEAKER = /^Others \d+$/;

/**
 * Maps anonymous system-audio labels to member names, e.g.
 * { "Others 1": "Marta Ruiz" }. Never throws: on any failure the map is empty
 * and `error` says why, for the transcript's diagnostics.
 */
export const identifyOtherSpeakers = async (
  sysAudioUrl: string,
  utterances: SpeakerSpan[],
  voices: KnownVoice[],
  config: VoiceIdentityConfig = getVoiceIdentityConfig(),
): Promise<{ names: Record<string, string>; error?: string }> => {
  const segments = utterances
    .filter((u) => SYSTEM_SPEAKER.test(u.speaker))
    .map((u) => ({ speaker: u.speaker, start: u.start, end: u.end }));
  if (!config.enabled || segments.length === 0 || voices.length === 0) return { names: {} };

  const form = new FormData();
  form.append("audio_url", sysAudioUrl);
  form.append("segments", JSON.stringify(segments));
  form.append(
    "profiles",
    JSON.stringify(voices.map((v) => ({ id: v.userId, url: v.voiceProfileUrl }))),
  );
  form.append("min_similarity", String(config.minSimilarity));

  let matches: unknown;
  try {
    const res = await fetch(
      `${config.voiceAiUrl}/identify`,
      withLongRequestDispatcher({
        method: "POST",
        body: form,
        headers: config.apiKey ? { "x-api-key": config.apiKey } : undefined,
        signal: AbortSignal.timeout(config.timeoutMs),
      }),
    );
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      return { names: {}, error: `voice identification failed: HTTP ${res.status} ${detail}` };
    }
    matches = ((await res.json()) as { matches?: unknown }).matches;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      names: {},
      error: `voice identification failed: voice service unreachable (${reason})`,
    };
  }

  if (!Array.isArray(matches)) {
    return { names: {}, error: "voice identification failed: malformed response" };
  }

  const byId = new Map(voices.map((v) => [v.userId, v.name]));
  const labels = new Set(segments.map((s) => s.speaker));
  const names: Record<string, string> = {};
  for (const m of matches as Array<{ speaker?: unknown; profile_id?: unknown }>) {
    const name = typeof m.profile_id === "string" ? byId.get(m.profile_id) : undefined;
    if (typeof m.speaker === "string" && labels.has(m.speaker) && name) names[m.speaker] = name;
  }
  return { names };
};
