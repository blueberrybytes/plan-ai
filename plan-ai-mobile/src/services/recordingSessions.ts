import { Directory, File, Paths } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import type { components } from "../types/api";

/** A moment marked during the recording, on the saved audio timeline. */
export type RecordingBookmark = components["schemas"]["RecordingBookmark"];
/** The calendar event a recording belongs to, as the phone saw it. */
export type MeetingCalendarEvent =
  components["schemas"]["MeetingCalendarEvent"];

/**
 * Every recording lives in its own folder until the backend confirms it:
 *
 *   Documents/recordings/<sessionId>/audio.wav        PCM audio, appended live
 *   Documents/recordings/<sessionId>/transcript.txt   live finals, one per line
 *   Documents/recordings/<sessionId>/session.json     manifest (below)
 *
 * An imported file keeps its own format and extension (imported.m4a, imported.mp3)
 * and has no transcript.txt; see createImportedSession.
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
  /** Calendar event chosen on the save screen. Wins over the manifest's one. */
  calendarEvent?: MeetingCalendarEvent;
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
  /**
   * Sample rate of audio.wav. New sessions save 16 kHz (see resample.ts);
   * absent means 24 kHz, what older versions saved.
   */
  sampleRate?: number;
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
  /** Moments marked while recording. Written as they happen, so a crash keeps them. */
  bookmarks?: RecordingBookmark[];
  /** Calendar event the recording belongs to, when one was picked at the start. */
  calendarEvent?: MeetingCalendarEvent;
  /**
   * Name of the audio file in the session folder. Absent means "audio.wav"
   * (a recording). Imported files keep their extension, e.g. "imported.m4a".
   */
  audioFileName?: string;
  /**
   * Original name of an imported file ("voice memo.m4a"). Set only on
   * imported sessions: their audio is uploaded as it is, not as a WAV.
   */
  importedFileName?: string;
}

export const WAV_HEADER_BYTES = 44;
/** Sample rate of the audio saved by this version. */
export const SAVED_SAMPLE_RATE = 16000;
/** Rate of a session's audio file (older sessions saved 24 kHz). */
export const sampleRateOf = (m: RecordingManifest | null | undefined): number =>
  m?.sampleRate ?? 24000;

const rootDir = () => new Directory(Paths.document, "recordings");
const sessionDir = (id: string) =>
  new Directory(Paths.document, "recordings", id);
/** The WAV a recording appends to. Imported sessions use sessionAudioFileOf. */
export const sessionAudioFile = (id: string) =>
  new File(sessionDir(id), "audio.wav");
const transcriptFile = (id: string) =>
  new File(sessionDir(id), "transcript.txt");
const manifestFile = (id: string) => new File(sessionDir(id), "session.json");
const manifestTmpFile = (id: string) =>
  new File(sessionDir(id), "session.json.tmp");

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
  // Sizes are left at 0xFFFFFFFF while recording; the uploader sends a
  // header with the real sizes (see wavHeader).
  const header = wavHeader(0, init.sampleRate ?? 24000);
  const view = new DataView(header.buffer);
  view.setUint32(4, 0xffffffff, true);
  view.setUint32(40, 0xffffffff, true);
  sessionAudioFile(init.sessionId).write(header);
  transcriptFile(init.sessionId).write("");
  const manifest: RecordingManifest = {
    ...init,
    version: 1,
    status: "recording",
  };
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

/**
 * The audio file of a session, recorded (audio.wav) or imported (imported.m4a,
 * imported.mp3...). Reads the manifest when it is not given.
 */
export function sessionAudioFileOf(
  id: string,
  m?: RecordingManifest | null,
): File {
  const manifest = m === undefined ? readManifest(id) : m;
  return new File(sessionDir(id), manifest?.audioFileName ?? "audio.wav");
}

/** An imported file, as opposed to a recording made in the app. */
export const isImported = (m: RecordingManifest | null | undefined): boolean =>
  !!m?.importedFileName;

/** Size of the session's audio file in bytes (0 when there is none). */
export function audioBytes(id: string, m?: RecordingManifest | null): number {
  try {
    const f = sessionAudioFileOf(id, m);
    return f.exists ? f.size : 0;
  } catch {
    return 0;
  }
}

// Extensions the backend stores as they are (IMPORTED_AUDIO_TYPES in
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

const MIME_BY_EXTENSION: Record<string, string> = {
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  webm: "audio/webm",
  flac: "audio/flac",
  caf: "audio/x-caf",
};

/** Meeting title for an imported file: its name without the extension. */
export const importTitleOf = (fileName: string): string =>
  fileName.replace(/\.[a-z0-9]+$/i, "").trim() || fileName;

/** Content type of a session's audio file, for sharing it. */
export function audioMimeTypeOf(
  m: RecordingManifest | null | undefined,
): string {
  const ext = /\.([a-z0-9]+)$/i
    .exec(m?.audioFileName ?? "audio.wav")?.[1]
    ?.toLowerCase();
  return (ext && MIME_BY_EXTENSION[ext]) || "audio/wav";
}

/**
 * Extension to keep for an imported file, from its name or else its type.
 * Null when the backend does not accept the format.
 */
export function importExtension(
  fileName: string,
  mimeType?: string | null,
): string | null {
  const fromName = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  if (fromName && IMPORT_EXTENSIONS.includes(fromName)) return fromName;
  const fromMime = mimeType
    ? EXTENSION_BY_MIME[mimeType.toLowerCase()]
    : undefined;
  return fromMime ?? null;
}

/**
 * Makes a session from an audio file picked on the phone. The file is moved
 * in (the picker already copied it to the cache, so this is a rename), then
 * the manifest is written. Both happen with no await in between, so the
 * outbox never sees the folder without its manifest and deletes it.
 */
export async function createImportedSession(init: {
  sessionId: string;
  sourceUri: string;
  fileName: string;
  extension: string;
  startedAt: number;
  language: string;
  workspaceId: string | null;
  ownerUid?: string;
}): Promise<RecordingManifest> {
  // Not "audio.<ext>": an imported WAV would take the name of a recording, and
  // a folder that lost its manifest would then be uploaded as one.
  const audioFileName = `imported.${init.extension}`;
  const target = () => {
    const root = rootDir();
    if (!root.exists) root.create({ intermediates: true, idempotent: true });
    const dir = sessionDir(init.sessionId);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    return new File(dir, audioFileName);
  };
  const manifest: RecordingManifest = {
    version: 1,
    sessionId: init.sessionId,
    status: "stopped",
    startedAt: init.startedAt,
    stoppedAt: init.startedAt,
    language: init.language,
    projectId: null,
    contextIds: [],
    workspaceId: init.workspaceId,
    ownerUid: init.ownerUid,
    audioFileName,
    importedFileName: init.fileName,
  };
  let staged: File | null = null;
  try {
    let moved = false;
    try {
      new File(init.sourceUri).move(target());
      moved = true;
    } catch (moveErr) {
      console.warn(
        "[recordingSessions] import move failed, copying instead",
        moveErr,
      );
    }
    if (!moved) {
      // Another volume, or a file the app does not own. Copy it to the cache
      // first (off the JS thread), then move that copy in.
      staged = new File(
        Paths.cache,
        `import-${init.sessionId}.${init.extension}`,
      );
      if (staged.exists) staged.delete();
      await LegacyFileSystem.copyAsync({
        from: init.sourceUri,
        to: staged.uri,
      });
      staged.move(target());
    }
    writeManifest(manifest);
    return manifest;
  } catch (err) {
    deleteSession(init.sessionId);
    try {
      if (staged?.exists) staged.delete();
    } catch {
      // cache file, the OS clears it anyway
    }
    throw err;
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
export function sessionsOf(
  uid: string | null | undefined,
): RecordingManifest[] {
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
      m = rebuildManifest(id, entry);
      if (!m) {
        deleteSession(id);
        continue;
      }
      writeManifest(m);
    }
    out.push(m);
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * A manifest for a folder that lost its own, or null when there is no audio
 * worth keeping. A recording's rate is read from its WAV header, since old
 * sessions saved 24 kHz and new ones 16 kHz; a wrong rate plays the audio at
 * the wrong speed. An imported file is kept under its own name.
 */
function rebuildManifest(id: string, dir: Directory): RecordingManifest | null {
  const base: RecordingManifest = {
    version: 1,
    sessionId: id,
    status: "stopped",
    startedAt: Date.now(),
    language: "",
    projectId: null,
    contextIds: [],
    workspaceId: null,
  };
  const wav = sessionAudioFile(id);
  if (wav.exists && wav.size > WAV_HEADER_BYTES) {
    return {
      ...base,
      startedAt: wav.creationTime ?? Date.now(),
      sampleRate: wavSampleRate(wav) ?? undefined,
    };
  }
  const files = dir.list().filter((f): f is File => f instanceof File);
  // "imported.<ext>" today; "audio.<ext>" (not wav) from the first builds.
  const imported =
    files.find((f) => /^imported\.[a-z0-9]+$/i.test(f.name)) ??
    files.find((f) => /^audio\.[a-z0-9]+$/i.test(f.name) && f.name !== "audio.wav");
  if (!imported || imported.size === 0) return null;
  return {
    ...base,
    startedAt: imported.creationTime ?? Date.now(),
    audioFileName: imported.name,
    importedFileName: imported.name,
  };
}

/** Sample rate written in a WAV header (bytes 24 to 27), or null if unreadable. */
function wavSampleRate(file: File): number | null {
  try {
    const handle = file.open();
    try {
      const header = handle.readBytes(WAV_HEADER_BYTES);
      if (header.length < 28) return null;
      const rate = new DataView(
        header.buffer,
        header.byteOffset,
        header.length,
      ).getUint32(24, true);
      return rate >= 8000 && rate <= 48000 ? rate : null;
    } finally {
      handle.close();
    }
  } catch {
    return null;
  }
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
          const startedAt =
            typeof item.timestamp === "number" ? item.timestamp : Date.now();
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
          const text =
            (item.content as string) ?? (item.transcript as string) ?? "";
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
          console.warn(
            `[recordingSessions] could not migrate ${entry.name}`,
            err,
          );
        }
      }
    }

    const backup = new File(Paths.document, "emergency_backup.wav");
    if (backup.exists) {
      if (backup.size > WAV_HEADER_BYTES) {
        const id = newSessionId();
        const startedAt =
          backup.creationTime ?? backup.modificationTime ?? Date.now();
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
