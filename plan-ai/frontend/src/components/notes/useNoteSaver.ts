import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import type { AppDispatch } from "../../store/store";
import {
  notesApi,
  useCreateNoteMutation,
  useLazyGetNoteQuery,
  useUpdateNoteMutation,
  type Note,
  type UpdateNoteRequest,
} from "../../store/apis/notesApi";
import { setToastMessage } from "../../store/slices/app/appSlice";
import { NoteSaver, type ConflictEvent, type SaveStatus } from "./NoteSaver";
import { conflictedCopyTitle, firstLine, newNoteId } from "./noteUtils";

interface UseNoteSaverOptions {
  note: Note;
  exists: boolean;
  onCreated?: (note: Note) => void;
  onConflict?: (event: ConflictEvent) => void;
}

/** Binds a NoteSaver to RTK Query for one mounted note editor. */
export const useNoteSaver = ({ note, exists, onCreated, onConflict }: UseNoteSaverOptions) => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const [createNote] = useCreateNoteMutation();
  const [updateNote] = useUpdateNoteMutation();
  const [fetchNote] = useLazyGetNoteQuery();
  const [status, setStatus] = useState<SaveStatus>(exists ? "saved" : "idle");
  const saverRef = useRef<NoteSaver | null>(null);

  // Callbacks change on every render; the saver reads the latest ones.
  const handlers = useRef({ onCreated, onConflict, t });
  handlers.current = { onCreated, onConflict, t };
  // Same for the request functions: a new identity must not replace the saver.
  const requests = useRef({ createNote, updateNote, fetchNote });
  requests.current = { createNote, updateNote, fetchNote };

  // One saver per note. The editor is keyed by note id, so `note` here is
  // the note as it was when the editor opened.
  const initial = useRef({ note, exists });
  useEffect(() => {
    const saver = new NoteSaver({
      note: initial.current.note,
      exists: initial.current.exists,
      api: {
        create: (request) => requests.current.createNote(request).unwrap(),
        update: (id, patch) => requests.current.updateNote({ id, patch }).unwrap(),
        // Always asks the server: the cached copy is the one that conflicted.
        fetch: (id) => requests.current.fetchNote(id, false).unwrap(),
      },
      newId: () => newNoteId(),
      copyTitle: (title, body) =>
        conflictedCopyTitle(
          title.trim() || firstLine(body) || handlers.current.t("notes.untitled"),
          handlers.current.t("notes.conflictedCopy"),
        ),
      onStatus: setStatus,
      onCreated: (created) => handlers.current.onCreated?.(created),
      onConflict: (event) => {
        dispatch(notesApi.util.upsertQueryData("getNote", event.server.id, event.server));
        dispatch(
          setToastMessage({
            severity: "warning",
            autoHideDuration: 10000,
            message: event.copy
              ? handlers.current.t("notes.toast.conflict", { title: event.copy.title ?? "" })
              : handlers.current.t("notes.toast.conflictNoCopy"),
          }),
        );
        handlers.current.onConflict?.(event);
      },
      onError: (message) =>
        dispatch(
          setToastMessage({
            severity: "error",
            message: message ?? handlers.current.t("notes.toast.saveFailed"),
          }),
        ),
    });
    saverRef.current = saver;

    const flushWhenOnline = () => void saver.flush();
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!saver.hasUnsavedWork()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("online", flushWhenOnline);
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => {
      window.removeEventListener("online", flushWhenOnline);
      window.removeEventListener("beforeunload", warnBeforeLeaving);
      saver.dispose();
      if (saverRef.current === saver) saverRef.current = null;
    };
  }, [dispatch]);

  const edit = useCallback((change: { title?: string; body?: string }) => {
    saverRef.current?.edit(change);
  }, []);

  const setMeta = useCallback((patch: UpdateNoteRequest) => {
    saverRef.current?.setMeta(patch);
  }, []);

  const flush = useCallback(async () => {
    await saverRef.current?.flush();
  }, []);

  return { status, edit, setMeta, flush };
};
