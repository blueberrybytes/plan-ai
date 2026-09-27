import { Directory, File, Paths } from "expo-file-system";

/**
 * Every recording lives in its own folder until the backend confirms it:
 *
 *   Documents/recordings/<sessionId>/audio.wav        PCM audio, appended live
 *   Documents/recordings/<sessionId>/transcript.txt   live finals, one per line
 *   Documents/recordings/<sessionId>/session.json     manifest (below)
 *
 * The manifest is written when the recording starts, so a crash, a kill by
 * the OS or a force quit leaves something the dashboard can offer to upload.
 * When the user saves, the upload options go into the manifest BEFORE the
 * upload starts (an outbox), so dying mid-upload loses nothing either.
 *
 * This replaces a single `emergency_backup.wav` that the next recording
 * overwrote, and a `pending_sync` queue that was only written when an upload
 * threw, stored the text under the wrong key and dropped the language.
 */

/** What the user chose on the save screen, sent with the upload. */
export interface UploadRequest {
  title: string;
  projectId?: string;
  contextIds?: string[];
  language?: string;
  skipAi: boolean;
  syncToJira?: boolean;
  syncToLinear?: boolean;
  syncToTrello?: boolean;
  syncToNotion?: boolean;
  syncToAsana?: boolean;
  syncToTwenty?: boolean;
  twentyCompanyId?: string;
  exportToGoogleDrive?: boolean;
  exportToOneDrive?: boolean;
  createDoc?: boolean;
  createSlides?: boolean;
  taskStrategy?: "AUTO" | "SINGLE_TICKET" | "SPECIFIC_COUNT";
  taskCount?: number;
  location?: { latitude: number; longitude: number; accuracy?: number | null };
  chatHistory?: { role: "user" | "assistant"; content: string }[];
}

/**
 * recording: capture was running (if the app is not recording now, it died).
 * stopped: the user stopped but has not saved yet.
 * pending_upload: saved, waiting for or in the middle of the upload.
 */
export type SessionStatus = "recording" | "stopped" | "pending_upload";

export interface RecordingManifest {
  version: 1;
  sessionId: string;
  status: SessionStatus;
  startedAt: number;
  stoppedAt?: number;
  /** Recorded time without pauses, in ms. */
  recordedMs?: number;
  language: string;
  projectId: string | null;
  contextIds: string[];
  /** Workspace active when the recording started; the upload goes there. */
  workspaceId: string | null;
  /**
   * Firebase uid of who recorded it. Only that user uploads or sees it, so a
   * second account signed in on the same phone never gets someone else's
   * meeting. Absent on sessions migrated from older versions.
   */
  ownerUid?: string;
  upload?: UploadRequest;
  /** Slice size used for this upload and the slices the server confirmed. */
  partBytes?: number;
  uploadedParts?: number[];
  attempts?: number;
  nextAttemptAt?: number;
  lastError?: string;
  lastStatus?: number;
  /** A 4xx that retrying will not fix; waits for the user. */
  permanentError?: boolean;
  /**
   * Audio found in the backup file of an older version. That version never
   * deleted the file after a successful upload, so it may already be saved.
   */
  origin?: "legacy_backup";
}

export const WAV_HEADER_BYTES = 44;
// 24 kHz, mono, 16 bit, sizes left at 0xFFFFFFFF while recording. The
// uploader writes a header with the real sizes (see wavHeader).
const WAV_HEADER_24K_STREAMING_BASE64 =
  "UklGRv////9XQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0Yf////8=";

const rootDir = () => new Directory(Paths.document, "recordings");
const sessionDir = (id: string) => new Directory(Paths.document, "recordings", id);
export const sessionAudioFile = (id: string) => new File(sessionDir(id), "audio.wav");
const transcriptFile = (id: string) => new File(sessionDir(id), "transcript.txt");
const manifestFile = (id: string) => new File(sessionDir(id), "session.json");
const manifestTmpFile = (id: string) => new File(sessionDir(id), "session.json.tmp");

export function newSessionId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `m-${Date.now().toString(36)}-${random}`;
}

function parseManifest(text: string): RecordingManifest | null {
  try {
    const m = JSON.parse(text) as RecordingManifest;
    return m && typeof m.sessionId === "string" ? m : null;
  } catch {
    return null;
  }
}

export function readManifest(id: string): RecordingManifest | null {
  for (const f of [manifestFile(id), manifestTmpFile(id)]) {
    try {
      if (f.exists) {
        const m = parseManifest(f.textSync());
        if (m) return m;
      }
    } catch {
      // try the next copy
    }
  }
  return null;
}

/** Writes the manifest through a temp file so a crash never leaves half a JSON. */
export function writeManifest(m: RecordingManifest): void {
  const tmp = manifestTmpFile(m.sessionId);
  tmp.write(JSON.stringify(m));
  const target = manifestFile(m.sessionId);
  if (target.exists) target.delete();
  tmp.move(target);
}

export function updateManifest(
  id: string,
  patch: Partial<RecordingManifest>,
): RecordingManifest | null {
  const m = readManifest(id);
  if (!m) return null;
  const next = { ...m, ...patch };
  writeManifest(next);
  return next;
}

export function createSession(
  init: Omit<RecordingManifest, "version" | "status">,
): RecordingManifest {
  const root = rootDir();
  if (!root.exists) root.create({ intermediates: true, idempotent: true });
  const dir = sessionDir(init.sessionId);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  sessionAudioFile(init.sessionId).write(WAV_HEADER_24K_STREAMING_BASE64, {
    encoding: "base64",
  });
  transcriptFile(init.sessionId).write("");
  const manifest: RecordingManifest = { ...init, version: 1, status: "recording" };
  writeManifest(manifest);
  return manifest;
}

export function appendAudio(id: string, base64Pcm: string): void {
  sessionAudioFile(id).write(base64Pcm, { encoding: "base64", append: true });
}

export function appendTranscriptLine(id: string, line: string): void {
  transcriptFile(id).write(`${line.replace(/\n/g, " ")}\n`, { append: true });
}

export function readTranscript(id: string): string {
  try {
    const f = transcriptFile(id);
    return f.exists ? f.textSync().trim() : "";
  } catch {
    return "";
  }
}

export function audioBytes(id: string): number {
  try {
    const f = sessionAudioFile(id);
    return f.exists ? f.size : 0;
  } catch {
    return 0;
  }
}

export function deleteSession(id: string): void {
  try {
    const dir = sessionDir(id);
    if (dir.exists) dir.delete();
  } catch (err) {
    console.warn(`[recordingSessions] could not delete ${id}`, err);
  }
}

/** Sessions the given user may see: theirs, plus old ones with no owner. */
export function sessionsOf(uid: string | null | undefined): RecordingManifest[] {
  return listSessions().filter((m) => !m.ownerUid || m.ownerUid === uid);
}

/** Every session on disk, newest first. Folders without a manifest get one. */
export function listSessions(): RecordingManifest[] {
  const root = rootDir();
  if (!root.exists) return [];
  const out: RecordingManifest[] = [];
  for (const entry of root.list()) {
    if (!(entry instanceof Directory)) continue;
    const id = entry.name;
    let m = readManifest(id);
    if (!m) {
      const bytes = audioBytes(id);
      if (bytes <= WAV_HEADER_BYTES) {
        deleteSession(id);
        continue;
      }
      // Audio without a manifest: keep it as an interrupted recording.
      const created = sessionAudioFile(id).creationTime ?? Date.now();
      m = {
        version: 1,
        sessionId: id,
        status: "stopped",
        startedAt: created,
        language: "",
        projectId: null,
        contextIds: [],
        workspaceId: null,
      };
      writeManifest(m);
    }
    out.push(m);
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}

/** WAV header for `dataBytes` of 24 kHz mono 16-bit PCM. */
export function wavHeader(dataBytes: number, sampleRate = 24000): Uint8Array {
  const header = new Uint8Array(WAV_HEADER_BYTES);
  const view = new DataView(header.buffer);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) header[offset + i] = s.charCodeAt(i);
  };
  const channels = 1;
  const bits = 16;
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, (sampleRate * channels * bits) / 8, true);
  view.setUint16(32, (channels * bits) / 8, true);
  view.setUint16(34, bits, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  return header;
}

/**
 * Moves what older versions left behind into sessions, so none of it is lost:
 * the `pending_sync` queue (text under the wrong key, no language) and an
 * `emergency_backup.wav` from a recording that never finished. Runs once at
 * startup, before anything records.
 */
export function migrateLegacyRecordings(): void {
  try {
    const legacyDir = new Directory(Paths.document, "pending_sync");
    if (legacyDir.exists) {
      for (const entry of legacyDir.list()) {
        if (!(entry instanceof File) || !entry.name.endsWith(".json")) continue;
        try {
          const item = JSON.parse(entry.textSync()) as Record<string, unknown>;
          const id = newSessionId();
          const startedAt = typeof item.timestamp === "number" ? item.timestamp : Date.now();
          createSession({
            sessionId: id,
            startedAt,
            language: "",
            projectId: (item.projectId as string) ?? null,
            contextIds: (item.contextIds as string[]) ?? [],
            workspaceId: null,
          });
          const audioUri = item.audioUri as string | null | undefined;
          if (audioUri) {
            const legacyAudio = new File(audioUri);
            if (legacyAudio.exists) {
              sessionAudioFile(id).delete();
              legacyAudio.move(sessionAudioFile(id));
            }
          }
          const text = (item.content as string) ?? (item.transcript as string) ?? "";
          if (text) transcriptFile(id).write(`${text}\n`);
          updateManifest(id, {
            status: "pending_upload",
            stoppedAt: startedAt,
            upload: {
              title: (item.title as string) || "Recovered meeting",
              projectId: (item.projectId as string) || undefined,
              contextIds: (item.contextIds as string[]) ?? undefined,
              skipAi: item.skipAi === true,
              syncToJira: item.syncToJira === true,
              syncToLinear: item.syncToLinear === true,
              syncToTrello: item.syncToTrello === true,
              syncToNotion: item.syncToNotion === true,
              syncToAsana: item.syncToAsana === true,
              syncToTwenty: item.syncToTwenty === true,
              twentyCompanyId: (item.twentyCompanyId as string) || undefined,
              exportToGoogleDrive: item.exportToGoogleDrive === true,
              exportToOneDrive: item.exportToOneDrive === true,
              createDoc: item.createDoc !== false,
              createSlides: item.createSlides === true,
              taskStrategy: item.taskStrategy as UploadRequest["taskStrategy"],
              taskCount: item.taskCount as number | undefined,
              location: item.location as UploadRequest["location"],
            },
          });
          entry.delete();
        } catch (err) {
          console.warn(`[recordingSessions] could not migrate ${entry.name}`, err);
        }
      }
    }

    const backup = new File(Paths.document, "emergency_backup.wav");
    if (backup.exists) {
      if (backup.size > WAV_HEADER_BYTES) {
        const id = newSessionId();
        const startedAt = backup.creationTime ?? backup.modificationTime ?? Date.now();
        createSession({
          sessionId: id,
          startedAt,
          language: "",
          projectId: null,
          contextIds: [],
          workspaceId: null,
        });
        sessionAudioFile(id).delete();
        backup.move(sessionAudioFile(id));
        updateManifest(id, {
          status: "stopped",
          stoppedAt: startedAt,
          origin: "legacy_backup",
        });
      } else {
        backup.delete();
      }
    }
  } catch (err) {
    console.warn("[recordingSessions] legacy migration failed", err);
  }
}
