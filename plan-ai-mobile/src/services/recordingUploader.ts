import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sentry from "@sentry/react-native";
import { getAuth } from "@react-native-firebase/auth";
import { HttpError, type createPlanAiApi } from "./planAiApi";
import {
  WAV_HEADER_BYTES,
  audioBytes,
  deleteSession,
  isImported,
  readManifest,
  sessionsOf,
  readTranscript,
  sampleRateOf,
  sessionAudioFileOf,
  updateManifest,
  wavHeader,
  type RecordingManifest,
  type UploadRequest,
} from "./recordingSessions";

type Api = ReturnType<typeof createPlanAiApi>;

/**
 * Uploads saved recordings (the outbox in recordingSessions.ts).
 *
 * The audio goes up in 8 MB slices: slice 0 is a WAV header with the real
 * sizes, the rest are the PCM bytes read straight from the file. An imported
 * file (m4a, mp3...) is cut as it is, from byte 0, and the server is told its
 * original name so it keeps the format. A dropped
 * connection costs one slice, not the whole meeting, and there is no single
 * request long enough to hit a timeout. The backend joins the slices when the
 * final recorder-upload call arrives with the same session id; a repeated
 * final call returns the transcript already created instead of a duplicate.
 *
 * Failures that retrying can fix (no network, 5xx, 429) are retried with a
 * growing delay. A 4xx that will not change on its own stops and waits for
 * the user, instead of re-uploading every 10 seconds forever.
 */

const PART_BYTES = 8 * 1024 * 1024;
// On iOS a background upload waits for the network instead of failing, for up
// to 7 days, and would hold the whole outbox. Past this it counts as a network
// failure and is retried (the server overwrites a slice sent twice).
const PART_TIMEOUT_MS = 5 * 60_000;
// A server that keeps reporting missing slices after this many full
// re-uploads needs a person, not another automatic try.
const MAX_MISSING_PART_RETRIES = 3;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 30 * 60_000;

export interface OutboxState {
  sessions: RecordingManifest[];
  /** Session being uploaded now and how far it got (0 to 1). */
  active: { sessionId: string; progress: number } | null;
}

let state: OutboxState = { sessions: [], active: null };
const listeners = new Set<() => void>();
const setState = (patch: Partial<OutboxState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

const currentUid = (): string | null => getAuth().currentUser?.uid ?? null;

export const refreshOutbox = (): void => {
  try {
    setState({ sessions: sessionsOf(currentUid()) });
  } catch (err) {
    console.warn("[outbox] could not list sessions", err);
  }
};

export function useOutbox(): OutboxState {
  const [snap, setSnap] = useState(state);
  useEffect(() => {
    const l = () => setSnap(state);
    listeners.add(l);
    setSnap(state);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return snap;
}

const isRetryable = (err: unknown): boolean => {
  const status = err instanceof HttpError ? err.status : undefined;
  return (
    status === undefined ||
    status >= 500 ||
    status === 401 ||
    status === 408 ||
    status === 409 ||
    status === 429
  );
};

const statusOf = (err: unknown) =>
  err instanceof HttpError ? err.status : undefined;

/** Another user signed in while this session was uploading: stop the pass. */
class OwnerChangedError extends Error {}

const assertOwner = (m: RecordingManifest) => {
  if (m.ownerUid && currentUid() !== m.ownerUid) throw new OwnerChangedError();
};

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new HttpError("Upload timed out")),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });

// Sessions whose final upload call succeeded in this app run.
const uploadedIds = new Set<string>();

/**
 * Slices of a session's audio. A recording sends a rebuilt WAV header, then
 * the PCM after the 44-byte header on disk. An imported file is sent as it is.
 */
const partCountOf = (
  m: RecordingManifest,
  fileSize: number,
  partBytes: number,
) =>
  isImported(m)
    ? Math.ceil(fileSize / partBytes)
    : 1 + Math.ceil((fileSize - WAV_HEADER_BYTES) / partBytes);

/** Writes one slice to a temp file for the native uploader. */
function writePartFile(
  m: RecordingManifest,
  index: number,
  fileSize: number,
  partBytes: number,
) {
  const sessionId = m.sessionId;
  const imported = isImported(m);
  const tmp = new File(Paths.cache, `upload-${sessionId}-${index}.bin`);
  if (tmp.exists) tmp.delete();
  if (index === 0 && !imported) {
    tmp.write(wavHeader(fileSize - WAV_HEADER_BYTES, sampleRateOf(m)));
    return tmp;
  }
  const start = imported
    ? index * partBytes
    : WAV_HEADER_BYTES + (index - 1) * partBytes;
  const length = Math.min(partBytes, fileSize - start);
  const handle = sessionAudioFileOf(sessionId, m).open();
  try {
    handle.offset = start;
    tmp.write(handle.readBytes(length));
  } finally {
    handle.close();
  }
  return tmp;
}

async function uploadOne(api: Api, sessionId: string): Promise<void> {
  let m = readManifest(sessionId);
  if (!m || !m.upload) throw new Error("Nothing to upload for this session");
  const request: UploadRequest = m.upload;
  const imported = isImported(m);
  const fileSize = audioBytes(sessionId, m);
  const hasAudio = imported ? fileSize > 0 : fileSize > WAV_HEADER_BYTES;

  let partCount = 0;
  if (hasAudio) {
    const partBytes = m.partBytes ?? PART_BYTES;
    partCount = partCountOf(m, fileSize, partBytes);
    if (m.partBytes !== partBytes) {
      m = updateManifest(sessionId, { partBytes, uploadedParts: [] }) ?? m;
    }
    const done = new Set(m.uploadedParts ?? []);
    for (let i = 0; i < partCount; i++) {
      if (done.has(i)) continue;
      assertOwner(m);
      const tmp = writePartFile(m, i, fileSize, partBytes);
      try {
        await withTimeout(
          api.uploadRecordingPart({
            uploadId: sessionId,
            index: i,
            fileUri: tmp.uri,
            workspaceId: m.workspaceId,
          }),
          PART_TIMEOUT_MS,
        );
      } finally {
        try {
          tmp.delete();
        } catch {
          // temp file, the OS clears the cache anyway
        }
      }
      done.add(i);
      updateManifest(sessionId, { uploadedParts: [...done] });
      setState({
        active: { sessionId, progress: done.size / (partCount + 1) },
      });
    }
  }

  const transcript = readTranscript(sessionId);
  const calendarEvent = request.calendarEvent ?? m.calendarEvent;
  const send = (
    projectId: string | undefined,
    contextIds: string[] | undefined,
  ) =>
    api.saveRecording({
      content: transcript || undefined,
      title: request.title,
      recordedAt: new Date(m!.startedAt).toISOString(),
      // An imported file has no capture window: startedAt is the import time.
      recordingStartedAt: imported
        ? undefined
        : new Date(m!.startedAt).toISOString(),
      recordingWallClockSeconds:
        !imported && m!.stoppedAt
          ? Math.max(1, Math.round((m!.stoppedAt - m!.startedAt) / 1000))
          : undefined,
      projectId,
      contextIds: contextIds && contextIds.length > 0 ? contextIds : undefined,
      // The batch pass must use the recording's language: the "multi"
      // fallback returns nothing for Catalan.
      language: request.language || m!.language || undefined,
      syncToJira: request.syncToJira,
      syncToLinear: request.syncToLinear,
      syncToTrello: request.syncToTrello,
      syncToNotion: request.syncToNotion,
      syncToAsana: request.syncToAsana,
      syncToTwenty: request.syncToTwenty,
      twentyCompanyId: request.twentyCompanyId,
      exportToGoogleDrive: request.exportToGoogleDrive,
      exportToOneDrive: request.exportToOneDrive,
      createDoc: request.createDoc,
      createSlides: request.createSlides,
      taskStrategy: request.taskStrategy,
      taskCount: request.taskCount,
      skipAi: request.skipAi,
      location: request.location,
      chatHistory: request.chatHistory,
      micUploadId: hasAudio ? sessionId : undefined,
      micPartCount: hasAudio ? partCount : undefined,
      // Imported audio keeps its format on the server (m4a, mp3...). The
      // stored name ("imported.m4a") always has an accepted extension; the
      // original name may have none when the type came from the picker.
      micFileName: hasAudio && imported ? m!.audioFileName : undefined,
      bookmarks: m!.bookmarks?.length ? m!.bookmarks : undefined,
      calendarEvent,
      clientSessionId: sessionId,
      recordingMode: "in_person",
      workspaceId: m!.workspaceId,
      silent: true,
    });

  assertOwner(m);
  try {
    await send(request.projectId, request.contextIds);
  } catch (err) {
    // The project was deleted while the meeting waited: save it without one
    // rather than failing forever.
    if (statusOf(err) === 404 && request.projectId) {
      updateManifest(sessionId, {
        upload: { ...request, projectId: undefined, contextIds: undefined },
      });
      assertOwner(m);
      await send(undefined, undefined);
    } else {
      if (statusOf(err) === 409) {
        // The server is missing slices: send them all again next time.
        updateManifest(sessionId, { uploadedParts: [] });
      }
      throw err;
    }
  }
  uploadedIds.add(sessionId);
  deleteSession(sessionId);
}

let inFlight: Promise<void> | null = null;
// Set when someone asks for a pass while one runs: the running pass does one
// more round at the end instead of every caller queuing a pass of its own.
let rerun = false;
// Sessions the user asked to upload now, even if their retry time has not come.
const queuedNow = new Set<string>();

/**
 * Uploads every saved recording that is due. One pass at a time; a call while
 * a pass runs makes it go round once more, and resolves when it is done.
 */
export function processOutbox(
  api: Api,
  opts: { force?: string } = {},
): Promise<void> {
  if (opts.force) queuedNow.add(opts.force);
  if (inFlight) {
    rerun = true;
    return inFlight;
  }
  inFlight = (async () => {
    try {
      do {
        rerun = false;
        await runPass(api);
      } while (rerun);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function runPass(api: Api): Promise<void> {
  try {
    const now = Date.now();
    const uid = currentUid();
    if (!uid) return;
    const due = sessionsOf(uid).filter(
      (m) =>
        m.status === "pending_upload" &&
        (queuedNow.has(m.sessionId) ||
          (!m.permanentError && (m.nextAttemptAt ?? 0) <= now)),
    );
    for (const m of due) {
      queuedNow.delete(m.sessionId);
      setState({ active: { sessionId: m.sessionId, progress: 0 } });
      try {
        await uploadOne(api, m.sessionId);
      } catch (err) {
        if (err instanceof OwnerChangedError) break;
        const attempts = (m.attempts ?? 0) + 1;
        const retryable =
          isRetryable(err) &&
          !(statusOf(err) === 409 && attempts >= MAX_MISSING_PART_RETRIES);
        const message = err instanceof Error ? err.message : String(err);
        updateManifest(m.sessionId, {
          attempts,
          lastError: message,
          lastStatus: statusOf(err),
          permanentError: !retryable,
          nextAttemptAt: retryable
            ? Date.now() +
              Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempts - 1))
            : undefined,
        });
        if (!retryable) {
          Sentry.captureMessage(`Recording upload stopped: ${message}`, {
            level: "warning",
            tags: { status: String(statusOf(err) ?? "none") },
          });
        }
      }
    }
  } finally {
    setState({ active: null });
    refreshOutbox();
  }
}

/** Saves the user's choices for a stopped recording and uploads it now. */
export async function saveAndUpload(
  api: Api,
  sessionId: string,
  request: UploadRequest,
): Promise<"uploaded" | "queued" | "failed"> {
  updateManifest(sessionId, {
    status: "pending_upload",
    upload: request,
    attempts: 0,
    nextAttemptAt: undefined,
    permanentError: false,
    lastError: undefined,
  });
  refreshOutbox();
  await processOutbox(api, { force: sessionId });
  if (uploadedIds.has(sessionId)) return "uploaded";
  const after = readManifest(sessionId);
  return !after || after.permanentError ? "failed" : "queued";
}

/** Clears a stopped upload's error and tries again now. */
export function retryUpload(api: Api, sessionId: string): void {
  const m = readManifest(sessionId);
  if (!m) return;
  try {
    updateManifest(sessionId, {
      permanentError: false,
      attempts: 0,
      nextAttemptAt: undefined,
      // No access to the original workspace any more: use the active one.
      ...(m.lastStatus === 403 ? { workspaceId: null } : {}),
    });
  } catch (err) {
    console.warn("[outbox] could not reset the upload state", err);
  }
  void processOutbox(api, { force: sessionId });
}

/** Deletes a recording from the phone and any slices already on the server. */
export function discardRecording(api: Api, sessionId: string): void {
  const m = readManifest(sessionId);
  if (m?.uploadedParts?.length) {
    void api.deleteRecordingParts(sessionId, m.workspaceId);
  }
  deleteSession(sessionId);
  refreshOutbox();
}

/**
 * Runs the outbox while the app is open: at start, when the app comes back
 * to the foreground, and every 30 s while something is waiting.
 */
export function useOutboxProcessor(api: Api, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    refreshOutbox();
    void processOutbox(api);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void processOutbox(api);
    });
    const timer = setInterval(() => {
      const waiting = state.sessions.some(
        (m) => m.status === "pending_upload" && !m.permanentError,
      );
      if (waiting) void processOutbox(api);
    }, 30_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [api, enabled]);
}
