import { useCallback, useEffect, useRef, useState } from "react";
import type { createPlanAiApi } from "../services/planAiApi";
import {
  httpStatusOf,
  isExpectedError,
  reportError,
} from "../utils/errorReporting";

type PlanAiApi = ReturnType<typeof createPlanAiApi>;

/**
 * Imports an audio file picked on this computer (a Zoom or Teams recording,
 * a voice memo). The file is sent in 8 MB slices and the backend transcribes
 * and processes it like a recording. Same flow as the mobile app.
 *
 * Nothing is kept on disk. The file stays where it is, so a failed import is
 * retried by picking it again.
 */

// Same limit as the mobile app.
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024 * 1024;
const PART_BYTES = 8 * 1024 * 1024;
// Waits before each new try of a failed request.
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000];

// Formats the backend stores as they are (IMPORTED_AUDIO_TYPES in
// transcriptsController.ts). Anything else would be saved as a WAV it is not.
const IMPORT_EXTENSIONS = [
  "m4a",
  "mp4",
  "aac",
  "mp3",
  "wav",
  "ogg",
  "opus",
  "webm",
  "flac",
  "caf",
];
const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/webm": "webm",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/x-caf": "caf",
};

/** Value for the file input. Lists the extensions too, for files with no type. */
export const IMPORT_ACCEPT = [
  "audio/*",
  ...IMPORT_EXTENSIONS.map((ext) => `.${ext}`),
].join(",");

/** Extension to keep, from the name or else the type. Null when not accepted. */
function importExtension(file: File): string | null {
  const fromName = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  if (fromName && IMPORT_EXTENSIONS.includes(fromName)) return fromName;
  return EXTENSION_BY_MIME[file.type.toLowerCase()] ?? null;
}

/** Meeting title: the file name without its extension. */
const importTitleOf = (fileName: string): string =>
  fileName.replace(/\.[a-z0-9]+$/i, "").trim() || fileName;

/** Matches the server rule for upload ids: /^[a-zA-Z0-9-]{8,64}$/. */
const newUploadId = (): string =>
  `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Worth another try: no answer, a timeout, a server error or a rate limit. */
const isRetryable = (err: unknown): boolean => {
  const status = httpStatusOf(err);
  return (
    status === undefined || status >= 500 || status === 408 || status === 429
  );
};

class CancelledError extends Error {}

/** Cancel flag of the running import, and a way to end a retry wait early. */
interface Control {
  cancelled: boolean;
  wake: (() => void) | null;
}

const wait = (ctl: Control, ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      ctl.wake = null;
      resolve();
    }
    ctl.wake = done;
  });

/** Runs a request, trying again after a short wait when the error allows it. */
async function withRetries<T>(
  ctl: Control,
  run: () => Promise<T>,
  cancellable: boolean,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (cancellable && ctl.cancelled) throw new CancelledError();
    try {
      return await run();
    } catch (err) {
      if (!isRetryable(err) || attempt >= RETRY_DELAYS_MS.length) throw err;
      await wait(ctl, RETRY_DELAYS_MS[attempt]);
    }
  }
}

/** Text for the inline error. A 4xx shows the server's own message. */
function messageOf(err: unknown): string {
  const status = httpStatusOf(err);
  if (status !== undefined && status >= 400 && status < 500 && err instanceof Error) {
    return err.message;
  }
  if (status !== undefined && status >= 500) {
    return "The server could not take the file. Try again in a few minutes.";
  }
  return "Could not reach the server. Check your connection and pick the file again.";
}

export type AudioImportState =
  | { phase: "idle" }
  | { phase: "uploading"; fileName: string; progress: number }
  | { phase: "saving"; fileName: string }
  | { phase: "done"; fileName: string }
  | { phase: "error"; message: string };

interface Options {
  api: PlanAiApi;
  /** ASR language picked on Home ("" means auto-detect). */
  language: string;
  /** Project picked on Home ("" means none). */
  projectId: string;
  /** Called once the meeting exists on the server. */
  onImported?: () => void;
}

export function useAudioImport({ api, language, projectId, onImported }: Options) {
  const [state, setState] = useState<AudioImportState>({ phase: "idle" });
  const busyRef = useRef(false);
  const ctlRef = useRef<Control>({ cancelled: false, wake: null });
  const mountedRef = useRef(true);

  // Home remounts after every meeting. An import keeps going when the user
  // leaves the screen, and the meeting shows in the list on the way back.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const update = useCallback((next: AudioImportState) => {
    if (mountedRef.current) setState(next);
  }, []);

  const importFile = useCallback(
    async (file: File) => {
      if (busyRef.current) return;
      if (file.size > MAX_IMPORT_BYTES) {
        update({
          phase: "error",
          message: `This file is ${(file.size / 1024 / 1024 / 1024).toFixed(1)} GB. Import a file under 2 GB.`,
        });
        return;
      }
      if (file.size <= 0) {
        update({ phase: "error", message: "This file is empty. It has no audio in it." });
        return;
      }
      const extension = importExtension(file);
      if (!extension) {
        update({
          phase: "error",
          message: "Format not supported. Import an m4a, mp4, mp3, wav, aac, ogg, opus, webm, flac or caf file.",
        });
        return;
      }

      busyRef.current = true;
      // A fresh control per import, so a late cancel never reaches the next one.
      const ctl: Control = { cancelled: false, wake: null };
      ctlRef.current = ctl;
      const uploadId = newUploadId();
      const partCount = Math.ceil(file.size / PART_BYTES);
      // The server keeps the format by this name's extension.
      const micFileName = file.name.toLowerCase().endsWith(`.${extension}`)
        ? file.name
        : `imported.${extension}`;
      let partsSent = 0;
      update({ phase: "uploading", fileName: file.name, progress: 0 });

      try {
        for (let i = 0; i < partCount; i++) {
          const start = i * PART_BYTES;
          // A slice of a File is read from disk only when it is sent.
          const part = file.slice(start, Math.min(start + PART_BYTES, file.size));
          await withRetries(ctl, () => api.uploadRecordingPart(uploadId, i, part), true);
          partsSent = i + 1;
          update({
            phase: "uploading",
            fileName: file.name,
            progress: partsSent / (partCount + 1),
          });
        }
        if (ctl.cancelled) throw new CancelledError();

        // From here the meeting is being created and can no longer be cancelled.
        update({ phase: "saving", fileName: file.name });
        const save = (project: string | undefined) =>
          withRetries(
            ctl,
            () =>
              api.saveRecording({
                title: importTitleOf(file.name),
                recordedAt: new Date().toISOString(),
                // No recordingStartedAt: an imported file has no capture window.
                projectId: project,
                // Always sent: the "multi" fallback returns nothing for Catalan.
                language: language || undefined,
                micUploadId: uploadId,
                micPartCount: partCount,
                micFileName,
                // Same id on a retry returns the meeting already created.
                clientSessionId: uploadId,
                // One file with every speaker in it, as on the phone.
                recordingMode: "in_person",
                createDoc: true,
                skipAi: false,
              }),
            false,
          );
        try {
          await save(projectId || undefined);
        } catch (err) {
          // The project was deleted meanwhile: save the meeting without one.
          if (httpStatusOf(err) === 404 && projectId) {
            await save(undefined);
          } else {
            throw err;
          }
        }
        update({ phase: "done", fileName: file.name });
        onImported?.();
      } catch (err) {
        if (err instanceof CancelledError) {
          if (partsSent > 0) await api.deleteRecordingParts(uploadId);
          update({ phase: "idle" });
          return;
        }
        console.error("[AudioImport] import failed", err);
        if (!isExpectedError(err, { statuses: [400, 401, 403, 404, 409, 413, 415, 429], reportTimeouts: true })) {
          // Sizes and counts only, never the file name.
          reportError(err, "audio-import", {
            sizeMb: Math.round(file.size / 1024 / 1024),
            partCount,
            partsSent,
            extension,
            online: navigator.onLine,
          });
        }
        // Slices of a failed import are of no use: a new pick starts over.
        if (partsSent > 0) void api.deleteRecordingParts(uploadId);
        update({ phase: "error", message: messageOf(err) });
      } finally {
        busyRef.current = false;
      }
    },
    [api, language, projectId, onImported, update],
  );

  /** Stops after the slice being sent. The final save cannot be cancelled. */
  const cancel = useCallback(() => {
    ctlRef.current.cancelled = true;
    ctlRef.current.wake?.();
  }, []);

  const dismiss = useCallback(() => {
    if (!busyRef.current) update({ phase: "idle" });
  }, [update]);

  return { state, importFile, cancel, dismiss };
}
