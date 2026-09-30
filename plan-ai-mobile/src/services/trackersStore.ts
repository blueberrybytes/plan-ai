import { useSyncExternalStore } from "react";
import { getAuth } from "@react-native-firebase/auth";
import type { PersonalStatus, WorkspaceKind, createPlanAiApi } from "./planAiApi";
import { getLocalNote, localDateKey, subscribeLocalNotes } from "./notesStore";
import { reportUnexpected } from "../utils/reportError";

type Api = ReturnType<typeof createPlanAiApi>;

/**
 * Personal mode state shared by the drawer, the trackers screen and the
 * note editor. Kept in memory only: it is one small request at start.
 *
 * - status: GET /api/personal for the signed-in account. Null until the
 *   first answer. When `available` is false nothing of trackers shows.
 * - pendingCount: proposals waiting to be accepted, for the drawer badge.
 * - note queue: notes changed in the personal workspace. Each is read by
 *   the AI once the notes sync has put that version on the server.
 */

interface State {
  uid: string | null;
  status: PersonalStatus | null;
  /** The last status request failed (offline, 5xx). */
  failed: boolean;
  pendingCount: number;
}

let state: State = { uid: null, status: null, failed: false, pendingCount: 0 };
const listeners = new Set<() => void>();

const setState = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const currentUid = (): string | null => getAuth().currentUser?.uid ?? null;

/** Another account signed in: forget what belonged to the last one. */
function ensureAccount(uid: string | null): void {
  if (state.uid === uid) return;
  noteQueue.clear();
  setState({ uid, status: null, failed: false, pendingCount: 0 });
}

let statusRequest: Promise<PersonalStatus | null> | null = null;

/**
 * Loads GET /api/personal once per account. `force` asks again (pull to
 * refresh). On failure the last known status stays.
 */
export function loadPersonalStatus(
  api: Api,
  opts: { force?: boolean } = {},
): Promise<PersonalStatus | null> {
  const uid = currentUid();
  ensureAccount(uid);
  if (!uid) return Promise.resolve(null);
  if (!opts.force && state.status) return Promise.resolve(state.status);
  if (statusRequest) return statusRequest;
  statusRequest = api
    .getPersonalStatus()
    .then((status) => {
      if (currentUid() !== uid) return null;
      setState({ status, failed: false });
      return status;
    })
    .catch((err) => {
      console.warn("[trackers] could not load the personal mode status", err);
      reportUnexpected(err, "trackers", { op: "status" });
      if (currentUid() === uid) setState({ failed: true });
      return state.status;
    })
    .finally(() => {
      statusRequest = null;
    });
  return statusRequest;
}

/** Personal mode is on and the consent is current: trackers can be used. */
export const personalReady = (
  s: PersonalStatus | null | undefined,
): s is PersonalStatus & { workspaceId: string } =>
  !!s && s.available && s.enabled && !s.consentOutdated && !!s.workspaceId;

export function usePersonalStatus(): { status: PersonalStatus | null; failed: boolean } {
  const status = useSyncExternalStore(subscribe, () => state.status);
  const failed = useSyncExternalStore(subscribe, () => state.failed);
  return { status, failed };
}

// ── Pending proposals (drawer badge) ─────────────────────────────────────────

export function setPendingProposalCount(count: number): void {
  if (state.pendingCount !== count) setState({ pendingCount: count });
}

/** Asks the server how many proposals wait. Errors keep the last count. */
export async function refreshPendingProposalCount(api: Api): Promise<void> {
  const status = await loadPersonalStatus(api);
  if (!personalReady(status)) {
    setPendingProposalCount(0);
    return;
  }
  const uid = currentUid();
  try {
    const entries = await api.listTrackerEntries({ status: "PROPOSED" }, status.workspaceId);
    if (currentUid() === uid) setPendingProposalCount(entries.length);
  } catch (err) {
    console.warn("[trackers] could not count the proposals", err);
    reportUnexpected(err, "trackers", { op: "count_proposals" });
  }
}

export function usePendingProposalCount(): number {
  return useSyncExternalStore(subscribe, () => state.pendingCount);
}

// ── Notes read by the AI after the user leaves them ─────────────────────────

// Note id to the api that queued it. In memory: a note left while the app
// is killed before its upload is not read, which is fine for a hint.
const noteQueue = new Map<string, Api>();
let unsubscribeNotes: (() => void) | null = null;

/**
 * Called when the user leaves a note they changed. If the note is in the
 * personal workspace and auto read is on, it is sent to the AI once the
 * notes sync has uploaded that version. Never on each keystroke or autosave.
 */
export function queueNoteExtraction(
  api: Api,
  noteId: string,
  workspaceKind: WorkspaceKind | undefined,
): void {
  if (workspaceKind !== "PERSONAL") return;
  const s = state.status;
  // Unknown status (offline at start): queue it and check once it is known.
  if (s && !(personalReady(s) && s.autoExtract)) return;
  noteQueue.set(noteId, api);
  if (!unsubscribeNotes) unsubscribeNotes = subscribeLocalNotes(checkNoteQueue);
  checkNoteQueue();
}

function checkNoteQueue(): void {
  const uid = currentUid();
  for (const [id, api] of [...noteQueue]) {
    const n = getLocalNote(id);
    if (!n || n.pendingTrash || n.accountUid !== uid || n.permanentError || n.status === "draft") {
      noteQueue.delete(id);
      continue;
    }
    // Still waiting for the upload (pending or conflicted copy).
    if (n.status !== "synced" || n.baseVersion === null) continue;
    noteQueue.delete(id);
    void extractNote(api, id, n.workspaceId);
  }
  if (noteQueue.size === 0 && unsubscribeNotes) {
    unsubscribeNotes();
    unsubscribeNotes = null;
  }
}

async function extractNote(api: Api, noteId: string, workspaceId: string | null): Promise<void> {
  try {
    const status = await loadPersonalStatus(api);
    if (!personalReady(status) || !status.autoExtract) return;
    if (workspaceId && workspaceId !== status.workspaceId) return;
    const res = await api.extractTrackerEntries(
      { noteId, today: localDateKey() },
      status.workspaceId,
    );
    if (res.entries.length > 0) await refreshPendingProposalCount(api);
  } catch (err) {
    // A hint only: no alert. Status and code, never the note text.
    const e = err as { status?: number; code?: string };
    console.warn("[trackers] could not read the note", e?.status ?? "offline", e?.code ?? "");
    reportUnexpected(err, "trackers", { op: "extract_note", noteId });
  }
}
