import { useEffect } from "react";
import { AppState } from "react-native";
import { getAuth } from "@react-native-firebase/auth";
import * as Sentry from "@sentry/react-native";
import {
  HttpError,
  NoteConflictError,
  type Note,
  type createPlanAiApi,
} from "./planAiApi";
import {
  getLocalNote,
  notesToUpload,
  patchLocalNote,
  removeLocalNote,
  replaceWithCopy,
  sameAsServer,
  sameText,
  saveConflictedCopy,
  type LocalNote,
} from "./notesStore";
import { reportUnexpected } from "../utils/reportError";

type Api = ReturnType<typeof createPlanAiApi>;

/**
 * Uploads the notes outbox (notesStore.ts), one note at a time.
 *
 * - A note the server never had is created with its phone-made id. The
 *   create is idempotent, so a lost answer and a retry give one note.
 * - An edit is a PATCH with the server version it started from. A 409 means
 *   another device saved first: the server copy wins and the local text is
 *   kept as a "(conflicted copy)" note, unless the text is the same.
 * - No network, 5xx, 401, 408 and 429 are retried with a growing delay.
 *   Other 4xx stop and wait for the user (a new edit or Retry).
 *
 * It runs at start, when the app comes to the foreground, every 30 s while
 * something waits, and shortly after the editor saves.
 */

const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 5 * 60_000;
// Rounds per note in one pass: create, then a PATCH if the create returned an
// older copy, then one more if the user typed during the upload.
const MAX_ROUNDS = 3;

const currentUid = (): string | null => getAuth().currentUser?.uid ?? null;

// Workspace for notes written before the workspace was known.
let fallbackWorkspaceId: string | null = null;

const statusOf = (err: unknown) => (err instanceof HttpError ? err.status : undefined);

// Refusals that are part of normal use. The note waits for the user and
// nothing is reported. Any other stop is reported with its status.
const EXPECTED_STOP_STATUSES = new Set([400, 401, 403, 404, 409, 422, 429]);

const isRetryable = (err: unknown): boolean => {
  if (!(err instanceof HttpError)) return true;
  const s = err.status;
  return s === undefined || s >= 500 || s === 401 || s === 408 || s === 429;
};

const payloadOf = (n: LocalNote) => ({
  title: n.title.trim() || null,
  body: n.body,
  pinned: n.pinned,
  visibility: n.visibility,
  projectId: n.projectId,
});

/**
 * Saves what the server answered. If the user typed while the request was in
 * flight, the new text stays pending on top of the new version.
 */
function applyServer(id: string, note: Note, sentRev: number): void {
  const now = getLocalNote(id);
  if (!now) return;
  const typedMeanwhile = now.localRev !== sentRev;
  const done = !typedMeanwhile && sameAsServer(now, note);
  patchLocalNote(id, {
    workspaceId: note.workspaceId,
    baseVersion: note.version,
    server: note,
    status: done ? "synced" : "pending",
    updatedAt: done ? Date.parse(note.updatedAt) || now.updatedAt : now.updatedAt,
    attempts: 0,
    nextAttemptAt: undefined,
    lastError: undefined,
    permanentError: false,
  });
}

/** The server has a newer version than the one this edit started from. */
async function resolveConflict(
  api: Api,
  id: string,
  current: Note | null,
  workspaceId: string,
): Promise<void> {
  let server = current;
  if (!server) {
    try {
      server = await api.getNote(id, workspaceId);
    } catch (err) {
      if (statusOf(err) === 404) {
        replaceWithCopy(id);
        return;
      }
      throw err;
    }
  }
  const local = getLocalNote(id);
  if (!local) return;
  const base = local.server;
  const editedText = !base || !sameText(local, base);
  const copied = editedText && !sameText(local, server);
  if (copied) saveConflictedCopy(local);
  // Keep a pin, share or project change made here, unless a copy took the text.
  const editedMeta =
    !copied &&
    !!base &&
    (local.pinned !== base.pinned ||
      local.visibility !== base.visibility ||
      local.projectId !== base.projectId);
  const next: Partial<LocalNote> = {
    workspaceId: server.workspaceId,
    title: server.title ?? "",
    body: server.body,
    pinned: editedMeta ? local.pinned : server.pinned,
    visibility: editedMeta ? local.visibility : server.visibility,
    projectId: editedMeta ? local.projectId : server.projectId,
    baseVersion: server.version,
    server,
    status: editedMeta ? "pending" : "synced",
    updatedAt: Date.parse(server.updatedAt) || Date.now(),
    remoteRev: local.remoteRev + (sameText(local, server) ? 0 : 1),
    attempts: 0,
    nextAttemptAt: undefined,
    lastError: undefined,
    permanentError: false,
  };
  patchLocalNote(id, next);
}

async function syncOne(api: Api, id: string): Promise<void> {
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const n = getLocalNote(id);
    if (!n) return;
    if (!n.pendingTrash && n.status !== "pending" && n.status !== "conflict") return;

    const workspaceId = n.workspaceId ?? fallbackWorkspaceId;
    if (!workspaceId) throw new HttpError("No workspace yet");
    if (!n.workspaceId) patchLocalNote(id, { workspaceId });

    if (n.pendingTrash) {
      if (n.baseVersion !== null) {
        try {
          await api.trashNote(id, workspaceId);
        } catch (err) {
          // Already gone on the server: nothing left to do.
          if (statusOf(err) !== 404) throw err;
        }
      }
      // Undo may have cancelled the trash while the request was in flight.
      if (getLocalNote(id)?.pendingTrash) removeLocalNote(id);
      return;
    }

    const sentRev = n.localRev;
    if (n.baseVersion === null) {
      const created = await api.createNote(
        { id, ...payloadOf(n), source: "MOBILE" },
        workspaceId,
      );
      applyServer(id, created, sentRev);
      continue;
    }

    try {
      const updated = await api.updateNote(
        id,
        { ...payloadOf(n), baseVersion: n.baseVersion },
        workspaceId,
      );
      applyServer(id, updated, sentRev);
    } catch (err) {
      if (err instanceof NoteConflictError) {
        await resolveConflict(api, id, err.current, workspaceId);
      } else if (statusOf(err) === 404 || statusOf(err) === 409) {
        // Deleted, or in the trash, on the server. Keep the text as a new note.
        replaceWithCopy(id);
        return;
      } else if (
        statusOf(err) === 400 &&
        n.projectId &&
        /project/i.test(err instanceof Error ? err.message : "")
      ) {
        // The project was deleted: keep the note, drop the link.
        patchLocalNote(id, { projectId: null });
      } else {
        throw err;
      }
    }
  }
}

let inFlight: Promise<void> | null = null;
let rerun = false;
let soonTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Uploads every note that is due. One pass at a time; a call while a pass
 * runs makes it go round once more.
 */
export function syncNotes(api: Api, opts: { force?: boolean } = {}): Promise<void> {
  if (inFlight) {
    rerun = true;
    return inFlight;
  }
  inFlight = (async () => {
    try {
      let force = !!opts.force;
      do {
        rerun = false;
        await runPass(api, force);
        force = false;
      } while (rerun);
    } catch (err) {
      // runPass handles each note. Reaching here is a bug in the outbox.
      // Callers ignore the result, so report it instead of rethrowing.
      reportUnexpected(err, "notes", { op: "sync_pass" });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Syncs a moment after the last call, so typing does not send a request per pause. */
export function requestNotesSync(api: Api, delayMs = 1500): void {
  if (soonTimer) clearTimeout(soonTimer);
  soonTimer = setTimeout(() => {
    soonTimer = null;
    void syncNotes(api);
  }, delayMs);
}

async function runPass(api: Api, force: boolean): Promise<void> {
  const uid = currentUid();
  if (!uid) return;
  const now = Date.now();
  const due = notesToUpload(uid).filter(
    (n) => force || (!n.permanentError && (n.nextAttemptAt ?? 0) <= now),
  );
  const tried = new Set<string>();
  for (const n of due) {
    if (currentUid() !== uid) return;
    tried.add(n.id);
    try {
      await syncOne(api, n.id);
    } catch (err) {
      const latest = getLocalNote(n.id);
      if (!latest) continue;
      const attempts = (latest.attempts ?? 0) + 1;
      const retryable = isRetryable(err);
      const message = err instanceof Error ? err.message : String(err);
      patchLocalNote(n.id, {
        attempts,
        lastError: message,
        permanentError: !retryable,
        nextAttemptAt: retryable
          ? Date.now() + Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempts - 1))
          : undefined,
      });
      const status = statusOf(err);
      if (!retryable && (status === undefined || !EXPECTED_STOP_STATUSES.has(status))) {
        // Status only: the message and the note text stay on the phone.
        Sentry.captureMessage("Note upload stopped", {
          level: "warning",
          tags: { status: String(status ?? "none"), feature: "notes" },
          extra: { noteId: n.id, attempts },
        });
      } else if (retryable && attempts === 1) {
        // An exception in our code, a bad answer or a file error. Once per
        // streak of failures: the retries would repeat it every few minutes.
        // Offline, 5xx (reported where the answer is read) and 401 are skipped.
        reportUnexpected(err, "notes", { op: "upload", noteId: n.id, attempts });
      }
      // No connection: the rest would fail the same way.
      if (statusOf(err) === undefined && err instanceof HttpError) return;
    }
  }
  // A conflict in this pass made a new copy: send it now too.
  const later = Date.now();
  if (
    notesToUpload(uid).some(
      (n) => !tried.has(n.id) && !n.permanentError && (n.nextAttemptAt ?? 0) <= later,
    )
  ) {
    rerun = true;
  }
}

/**
 * Runs the notes outbox while the app is open and signed in: at start, on
 * return to the foreground, and every 30 s while a note waits.
 */
export function useNotesSync(api: Api, enabled: boolean, activeWorkspaceId: string | null): void {
  useEffect(() => {
    fallbackWorkspaceId = activeWorkspaceId || null;
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!enabled) return;
    void syncNotes(api);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void syncNotes(api);
    });
    const timer = setInterval(() => {
      const uid = currentUid();
      const now = Date.now();
      const waiting =
        !!uid &&
        notesToUpload(uid).some((n) => !n.permanentError && (n.nextAttemptAt ?? 0) <= now);
      if (waiting) void syncNotes(api);
    }, 30_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [api, enabled]);
}
