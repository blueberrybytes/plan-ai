import type { CreateNoteRequest, Note, UpdateNoteRequest } from "../../store/apis/notesApi";

/**
 * Saves one note while the user types. It waits for a pause, sends one
 * request at a time with the version it edited, keeps the text when the
 * network is down and retries, and on a version conflict keeps the user's
 * text as a new note before loading the server's copy.
 *
 * It has no React in it, so the rules are tested on their own.
 */

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "offline" | "error";

export type SaveErrorKind = "conflict" | "offline" | "other";

export interface NoteSaverApi {
  create(request: CreateNoteRequest): Promise<Note>;
  update(id: string, patch: UpdateNoteRequest): Promise<Note>;
  fetch(id: string): Promise<Note>;
}

export interface ConflictEvent {
  /** The server's version, now loaded in the editor. */
  server: Note;
  /** The new note that holds the user's text, or null when nothing was lost. */
  copy: Note | null;
}

export interface NoteSaverOptions {
  note: Note;
  /** False for a draft that is not on the server yet. */
  exists: boolean;
  api: NoteSaverApi;
  newId: () => string;
  /** Title of the conflicted copy, from the user's title and body. */
  copyTitle: (title: string, body: string) => string;
  debounceMs?: number;
  retryMs?: number;
  onStatus?: (status: SaveStatus) => void;
  onCreated?: (note: Note) => void;
  onConflict?: (event: ConflictEvent) => void;
  onError?: (message: string | null, error: unknown) => void;
}

interface ErrorShape {
  status?: unknown;
  data?: { code?: unknown; message?: unknown; current?: unknown } | null;
}

export const classifySaveError = (error: unknown): SaveErrorKind => {
  const e = (error ?? {}) as ErrorShape;
  if (e.data?.code === "note_version_conflict") return "conflict";
  if (e.status === "FETCH_ERROR" || e.status === "TIMEOUT_ERROR") return "offline";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  return "other";
};

/** The server copy sent with a 409, when the answer has one. */
export const conflictServerCopy = (error: unknown): Note | null => {
  const current = ((error ?? {}) as ErrorShape).data?.current;
  return current && typeof current === "object" && "id" in current ? (current as Note) : null;
};

export const saveErrorMessage = (error: unknown): string | null => {
  const message = ((error ?? {}) as ErrorShape).data?.message;
  return typeof message === "string" && message ? message : null;
};

export class NoteSaver {
  private readonly id: string;
  private readonly links: { projectId: string | null; transcriptId: string | null };
  private readonly options: NoteSaverOptions;
  private readonly debounceMs: number;
  private readonly retryMs: number;

  private version: number;
  private exists: boolean;
  private title: string;
  private body: string;
  private textDirty = false;
  private meta: UpdateNoteRequest = {};
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private disposed = false;
  private status: SaveStatus = "idle";

  constructor(options: NoteSaverOptions) {
    this.options = options;
    this.id = options.note.id;
    this.links = { projectId: options.note.projectId, transcriptId: options.note.transcriptId };
    this.version = options.note.version;
    this.exists = options.exists;
    this.title = options.note.title ?? "";
    this.body = options.note.body;
    this.debounceMs = options.debounceMs ?? 800;
    this.retryMs = options.retryMs ?? 5000;
  }

  get currentStatus(): SaveStatus {
    return this.status;
  }

  get isCreated(): boolean {
    return this.exists;
  }

  /** Records what the user typed and saves after a pause. */
  edit(change: { title?: string; body?: string }): void {
    if (change.title !== undefined) this.title = change.title;
    if (change.body !== undefined) this.body = change.body;
    this.textDirty = true;
    this.setStatus("pending");
    this.schedule(this.debounceMs);
  }

  /** Pin, share or link changes. Sent at once, in the same queue as the text. */
  setMeta(patch: UpdateNoteRequest): void {
    if (!this.exists) return;
    this.meta = { ...this.meta, ...patch };
    this.setStatus("pending");
    this.schedule(0);
  }

  hasUnsavedWork(): boolean {
    return this.textDirty || Object.keys(this.meta).length > 0 || this.running !== null;
  }

  /** Sends what is waiting now. Resolves when the queue is idle. */
  async flush(): Promise<void> {
    this.clearTimer();
    while (this.running) await this.running;
    if (!this.hasWork()) {
      if (this.status === "pending") this.setStatus(this.exists ? "saved" : "idle");
      return;
    }
    this.running = this.saveOnce();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }

  /** Stops the timers. Unsaved text is still sent once. */
  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    if (this.hasWork()) void this.flush();
  }

  private hasWork(): boolean {
    return (this.textDirty && (this.exists || this.hasText())) || Object.keys(this.meta).length > 0;
  }

  private hasText(): boolean {
    return this.title.trim() !== "" || this.body.trim() !== "";
  }

  private async saveOnce(): Promise<void> {
    const sentText = this.textDirty;
    const meta = this.meta;
    this.textDirty = false;
    this.meta = {};
    this.setStatus("saving");

    try {
      let saved: Note;
      if (!this.exists) {
        saved = await this.options.api.create({
          id: this.id,
          title: this.title,
          body: this.body,
          projectId: this.links.projectId,
          transcriptId: this.links.transcriptId,
          source: "WEB",
        });
        this.exists = true;
        this.options.onCreated?.(saved);
      } else {
        saved = await this.options.api.update(this.id, {
          ...(sentText ? { title: this.title, body: this.body } : {}),
          ...meta,
          baseVersion: this.version,
        });
      }
      this.version = saved.version;
      this.afterSave();
    } catch (error) {
      const kind = classifySaveError(error);
      if (kind === "conflict" && this.exists) {
        await this.resolveConflict(error, sentText, meta);
        return;
      }
      this.requeue(sentText, meta, kind, error);
    }
  }

  private async resolveConflict(
    error: unknown,
    sentText: boolean,
    meta: UpdateNoteRequest,
  ): Promise<void> {
    try {
      const server = conflictServerCopy(error) ?? (await this.options.api.fetch(this.id));
      const hasLocalText = sentText || this.textDirty;
      const differs = this.body !== server.body || this.title.trim() !== (server.title ?? "");
      let copy: Note | null = null;
      if (hasLocalText && differs) {
        copy = await this.options.api.create({
          id: this.options.newId(),
          title: this.options.copyTitle(this.title, this.body),
          body: this.body,
          projectId: server.projectId,
          transcriptId: server.transcriptId,
          source: "WEB",
        });
      }
      this.version = server.version;
      this.title = server.title ?? "";
      this.body = server.body;
      this.textDirty = false;
      // The user's pin, share or link choice is applied on top of the new version.
      this.meta = { ...meta, ...this.meta };
      this.options.onConflict?.({ server, copy });
      this.afterSave();
    } catch (nextError) {
      this.requeue(sentText, meta, classifySaveError(nextError), nextError);
    }
  }

  private afterSave(): void {
    const more = this.textDirty || Object.keys(this.meta).length > 0;
    this.setStatus(more ? "pending" : "saved");
    if (more) this.schedule(this.textDirty ? this.debounceMs : 0);
  }

  private requeue(
    sentText: boolean,
    meta: UpdateNoteRequest,
    kind: SaveErrorKind,
    error: unknown,
  ): void {
    if (sentText) this.textDirty = true;
    if (kind === "offline") {
      this.meta = { ...meta, ...this.meta };
      this.setStatus("offline");
      this.schedule(this.retryMs);
      return;
    }
    // A refused change (no access, bad link) is not retried. The text stays
    // and goes with the next edit.
    this.setStatus("error");
    this.options.onError?.(saveErrorMessage(error), error);
  }

  private schedule(ms: number): void {
    // Runs after dispose too, so text typed offline is still sent later.
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private setStatus(status: SaveStatus): void {
    this.status = status;
    if (!this.disposed) this.options.onStatus?.(status);
  }
}
