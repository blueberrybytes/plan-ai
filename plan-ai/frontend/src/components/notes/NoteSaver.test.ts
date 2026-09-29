import type { Note } from "../../store/apis/notesApi";
import { makeDraftNote } from "./noteUtils";
import {
  classifySaveError,
  conflictServerCopy,
  NoteSaver,
  type NoteSaverApi,
  type SaveStatus,
} from "./NoteSaver";

const note = (overrides: Partial<Note> = {}): Note => ({
  ...makeDraftNote("note_0000000000000001"),
  workspaceId: "w1",
  userId: "u1",
  title: "Title",
  body: "Body",
  version: 3,
  ...overrides,
});

const conflict = (current?: Note) => ({
  status: 409,
  data: { code: "note_version_conflict", message: "changed", ...(current ? { current } : {}) },
});

const setup = (start: Note, exists = true, api: Partial<NoteSaverApi> = {}) => {
  const statuses: SaveStatus[] = [];
  const calls = {
    create: jest.fn(
      api.create ?? (async (req) => note({ ...req, id: req.id ?? "new", version: 1 } as Note)),
    ),
    update: jest.fn(
      api.update ??
        (async (_id, patch) => note({ ...patch, version: (patch.baseVersion ?? 0) + 1 })),
    ),
    fetch: jest.fn(api.fetch ?? (async () => start)),
  };
  const onConflict = jest.fn();
  const onError = jest.fn();
  const onCreated = jest.fn();
  const saver = new NoteSaver({
    note: start,
    exists,
    api: calls,
    newId: () => "copy_000000000000001",
    copyTitle: (title) => `${title} (copy)`,
    debounceMs: 800,
    retryMs: 5000,
    onStatus: (s) => statuses.push(s),
    onConflict,
    onError,
    onCreated,
  });
  return { saver, calls, statuses, onConflict, onError, onCreated };
};

afterEach(() => {
  jest.useRealTimers();
});

describe("classifySaveError", () => {
  it("tells conflicts, network errors and other errors apart", () => {
    expect(classifySaveError(conflict())).toBe("conflict");
    expect(classifySaveError({ status: "FETCH_ERROR" })).toBe("offline");
    expect(classifySaveError({ status: 403, data: { message: "no" } })).toBe("other");
    expect(conflictServerCopy(conflict(note()))?.id).toBe(note().id);
    expect(conflictServerCopy(conflict())).toBeNull();
  });
});

describe("NoteSaver", () => {
  it("waits for a pause, then sends the text with the edited version", () => {
    jest.useFakeTimers();
    const { saver, calls } = setup(note());
    saver.edit({ body: "B" });
    saver.edit({ body: "Bo" });
    jest.advanceTimersByTime(799);
    expect(calls.update).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(calls.update).toHaveBeenCalledTimes(1);
    expect(calls.update).toHaveBeenCalledWith(note().id, {
      title: "Title",
      body: "Bo",
      baseVersion: 3,
    });
  });

  it("uses the new version for the next save", async () => {
    const { saver, calls, statuses } = setup(note());
    saver.edit({ body: "one" });
    await saver.flush();
    saver.edit({ body: "two" });
    await saver.flush();
    expect(calls.update.mock.calls[1][1].baseVersion).toBe(4);
    expect(statuses[statuses.length - 1]).toBe("saved");
  });

  it("creates a draft on its first save with its own id, then updates it", async () => {
    const draft = makeDraftNote("draft_00000000000001", { transcriptId: "t1" });
    const { saver, calls, onCreated } = setup(draft, false);
    await saver.flush();
    expect(calls.create).not.toHaveBeenCalled();
    saver.edit({ body: "first words" });
    await saver.flush();
    expect(calls.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "draft_00000000000001",
        body: "first words",
        transcriptId: "t1",
      }),
    );
    expect(onCreated).toHaveBeenCalled();
    saver.edit({ body: "more" });
    await saver.flush();
    expect(calls.update).toHaveBeenCalledWith(
      "draft_00000000000001",
      expect.objectContaining({ body: "more", baseVersion: 1 }),
    );
  });

  it("keeps the text offline and retries later", async () => {
    jest.useFakeTimers();
    let online = false;
    const { saver, calls, statuses } = setup(note(), true, {
      update: async (_id, patch) => {
        if (!online) throw { status: "FETCH_ERROR" };
        return note({ ...patch, version: 9 });
      },
    });
    saver.edit({ body: "offline text" });
    await saver.flush();
    expect(statuses[statuses.length - 1]).toBe("offline");
    expect(saver.hasUnsavedWork()).toBe(true);
    online = true;
    jest.advanceTimersByTime(5000);
    // Let the retried save finish.
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    await saver.flush();
    expect(calls.update).toHaveBeenLastCalledWith(
      note().id,
      expect.objectContaining({ body: "offline text", baseVersion: 3 }),
    );
    expect(statuses[statuses.length - 1]).toBe("saved");
  });

  it("on a conflict keeps the user's text as a copy and loads the server version", async () => {
    const server = note({ body: "server text", version: 7 });
    const { saver, calls, onConflict } = setup(note(), true, {
      update: async () => {
        throw conflict(server);
      },
    });
    saver.edit({ body: "my text" });
    await saver.flush();
    expect(calls.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "copy_000000000000001",
        title: "Title (copy)",
        body: "my text",
      }),
    );
    expect(onConflict).toHaveBeenCalledWith(
      expect.objectContaining({ server, copy: expect.objectContaining({ body: "my text" }) }),
    );
  });

  it("fetches the server copy when the 409 does not include it", async () => {
    const server = note({ body: "server text", version: 7 });
    const { saver, calls } = setup(note(), true, {
      update: async () => {
        throw conflict();
      },
      fetch: async () => server,
    });
    saver.edit({ body: "mine" });
    await saver.flush();
    expect(calls.fetch).toHaveBeenCalledWith(note().id);
    expect(calls.create).toHaveBeenCalledTimes(1);
  });

  it("makes no copy when only a pin change conflicted, and applies the pin again", async () => {
    const server = note({ version: 7 });
    let first = true;
    const { saver, calls, onConflict } = setup(note(), true, {
      update: async (_id, patch) => {
        if (first) {
          first = false;
          throw conflict(server);
        }
        return note({ ...patch, version: 8 });
      },
    });
    saver.setMeta({ pinned: true });
    await saver.flush();
    expect(calls.create).not.toHaveBeenCalled();
    expect(onConflict).toHaveBeenCalledWith({ server, copy: null });
    await saver.flush();
    expect(calls.update).toHaveBeenLastCalledWith(note().id, { pinned: true, baseVersion: 7 });
  });

  it("reports a refused save and does not retry it", async () => {
    jest.useFakeTimers();
    const { saver, calls, onError, statuses } = setup(note(), true, {
      update: async () => {
        throw { status: 403, data: { message: "Only the author can edit this note." } };
      },
    });
    saver.edit({ body: "x" });
    await saver.flush();
    expect(onError).toHaveBeenCalledWith("Only the author can edit this note.", expect.anything());
    expect(statuses[statuses.length - 1]).toBe("error");
    jest.advanceTimersByTime(60_000);
    expect(calls.update).toHaveBeenCalledTimes(1);
  });

  it("sends unsaved text once when disposed", async () => {
    const { saver, calls } = setup(note());
    saver.edit({ body: "last words" });
    saver.dispose();
    await saver.flush();
    expect(calls.update).toHaveBeenCalledTimes(1);
  });
});
