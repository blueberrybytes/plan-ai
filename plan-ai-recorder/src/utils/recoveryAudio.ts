/**
 * Renderer side of the crash-safe audio copy (the files live in the main
 * process, see "recovery-audio-*" in electron/main.ts).
 *
 * Every MediaRecorder chunk is appended to disk as it is produced. If the app
 * dies before the upload, Home recovers the meeting WITH its audio, so the
 * backend re-transcribes both channels instead of keeping the live text only.
 * Every call is best effort: a failed write never touches the recording.
 */

import { reportError, reportOnce } from "./errorReporting";

export type RecoveryTrack = "mic" | "sys";

// Blob.arrayBuffer() resolves asynchronously, so chunks are chained per track
// to reach the file in the order MediaRecorder produced them.
const chains = new Map<string, Promise<void>>();

export function newRecordingSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function appendRecoveryAudio(
  sessionId: string,
  track: RecoveryTrack,
  chunk: Blob,
): void {
  const api = window.electron?.recoveryAudio;
  if (!api || chunk.size === 0) return;
  const key = `${sessionId}:${track}`;
  const previous = chains.get(key) ?? Promise.resolve();
  const next = previous
    .then(async () => {
      const bytes = new Uint8Array(await chunk.arrayBuffer());
      await api.append(sessionId, track, bytes);
    })
    .catch((err) => {
      console.warn(
        `[recoveryAudio] could not save a ${track} chunk:`,
        err instanceof Error ? err.message : err,
      );
      // Disk errors are reported by the main process. This covers the IPC
      // call and reading the chunk. Once per track, chunks come every second.
      reportOnce(`recovery-audio-append:${key}`, err, "recovery-audio-write", {
        sessionId,
        track,
      });
    });
  chains.set(key, next);
}

export async function recoveryAudioInfo(
  sessionId: string,
): Promise<{ micBytes: number; sysBytes: number }> {
  const api = window.electron?.recoveryAudio;
  if (!api) return { micBytes: 0, sysBytes: 0 };
  try {
    return await api.info(sessionId);
  } catch (err) {
    reportError(err, "recovery-audio-read", { sessionId, step: "info" });
    return { micBytes: 0, sysBytes: 0 };
  }
}

export async function readRecoveryAudio(
  sessionId: string,
): Promise<{ micBlob?: Blob; sysBlob?: Blob }> {
  const api = window.electron?.recoveryAudio;
  if (!api) return {};
  try {
    const { mic, sys } = await api.read(sessionId);
    const toBlob = (bytes: Uint8Array | null) =>
      bytes && bytes.byteLength > 0
        ? new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "audio/webm" })
        : undefined;
    return { micBlob: toBlob(mic), sysBlob: toBlob(sys) };
  } catch (err) {
    reportError(err, "recovery-audio-read", { sessionId, step: "read" });
    return {};
  }
}

export function deleteRecoveryAudio(sessionId: string): void {
  const api = window.electron?.recoveryAudio;
  if (!api) return;
  // Let queued appends land first, or a late one would recreate the folder.
  const pending = [`${sessionId}:mic`, `${sessionId}:sys`].map(
    (key) => chains.get(key) ?? Promise.resolve(),
  );
  void Promise.all(pending)
    .then(() => {
      chains.delete(`${sessionId}:mic`);
      chains.delete(`${sessionId}:sys`);
      return api.remove(sessionId);
    })
    .catch((err) => {
      reportError(err, "recovery-audio-delete", { sessionId });
    });
}

export function pruneRecoveryAudio(keepSessionIds: string[]): void {
  const api = window.electron?.recoveryAudio;
  if (!api) return;
  void api.prune(keepSessionIds).catch((err) => {
    reportError(err, "recovery-audio-delete", { step: "prune" });
  });
}
