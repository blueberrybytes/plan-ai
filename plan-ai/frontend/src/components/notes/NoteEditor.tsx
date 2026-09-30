import React, { useCallback, useRef, useState } from "react";
import { Alert, Box, IconButton, InputBase, Tooltip } from "@mui/material";
import { ArrowBack as BackIcon } from "@mui/icons-material";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import type { Note } from "../../store/apis/notesApi";
import { usePersonalMode } from "../personal/usePersonalMode";
import LogToTrackersButton from "../trackers/LogToTrackersButton";
import NoteTrackersPanel from "../trackers/NoteTrackersPanel";
import { extractInBackground } from "../trackers/extractInBackground";
import { useLogNoteToTrackers } from "../trackers/useLogNoteToTrackers";
import NoteBodyEditor, { type NoteBodyEditorHandle } from "./NoteBodyEditor";
import NoteSaveStatus from "./NoteSaveStatus";
import NoteToolbar from "./NoteToolbar";
import { useNoteSaver } from "./useNoteSaver";
import { usePeriodLabel } from "./usePeriodLabel";

interface NoteEditorProps {
  note: Note;
  /** False for a new note that is not on the server yet (created on the first save). */
  exists: boolean;
  canModerate: boolean;
  /** Where the cursor starts. "body" for a new note, so the user types at once. */
  autoFocus?: "title" | "body";
  hideProject?: boolean;
  onBack?: () => void;
  onCreated?: (note: Note) => void;
  onRemoved: () => void;
}

/**
 * Title and body of one note, saved as the user types. Mount it with
 * `key={note.id}`: the local text is read from `note` once, on mount.
 */
const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  exists,
  canModerate,
  autoFocus,
  hideProject,
  onBack,
  onCreated,
  onRemoved,
}) => {
  const { t } = useTranslation();
  const dispatch = useDispatch<ThunkDispatch<unknown, unknown, UnknownAction>>();
  const periodLabel = usePeriodLabel();
  const personal = usePersonalMode();
  const [title, setTitle] = useState(note.title ?? "");
  const [body, setBody] = useState({ markdown: note.body, revision: 0 });
  const [created, setCreated] = useState(exists);
  const bodyRef = useRef<NoteBodyEditorHandle>(null);
  const createdRef = useRef(exists);
  // The user typed in this visit: leaving the note may read it for trackers.
  const editedRef = useRef(false);

  const inTrash = Boolean(note.deletedAt);
  const editable = note.isMine && !inTrash;
  const trackersOn = personal.trackersReady && editable;

  const { status, edit, setMeta, flush, hasUnsavedWork } = useNoteSaver({
    note,
    exists,
    onCreated: (saved) => {
      createdRef.current = true;
      setCreated(true);
      onCreated?.(saved);
    },
    onConflict: ({ server }) => {
      setTitle(server.title ?? "");
      setBody((previous) => ({ markdown: server.body, revision: previous.revision + 1 }));
    },
    onLeave: (onServer) => {
      if (onServer && editedRef.current && trackersOn && personal.autoExtract) {
        extractInBackground(dispatch, note.id);
      }
    },
  });

  const isCreated = useCallback(() => createdRef.current, []);
  const trackerLog = useLogNoteToTrackers({
    noteId: note.id,
    flush,
    isCreated,
    hasUnsavedWork,
  });
  const titlePlaceholder = periodLabel(note) ?? t("notes.titlePlaceholder");

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
          px: { xs: 1.5, md: 3 },
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        {onBack && (
          <Tooltip title={t("notes.back")}>
            <IconButton size="small" aria-label={t("notes.back")} onClick={onBack}>
              <BackIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {editable && <NoteSaveStatus status={status} />}
        <Box sx={{ flex: 1 }} />
        {trackersOn && (
          <LogToTrackersButton loading={trackerLog.logging} onClick={() => void trackerLog.log()} />
        )}
        <NoteToolbar
          note={note}
          exists={created}
          canModerate={canModerate}
          hideProject={hideProject}
          onSetMeta={setMeta}
          onBeforeTrash={flush}
          onRemoved={onRemoved}
        />
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          px: { xs: 2, md: 4 },
          py: 2,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {inTrash && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {t("notes.inTrash")}
          </Alert>
        )}
        {!note.isMine && !inTrash && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {t("notes.readOnly")}
          </Alert>
        )}
        <InputBase
          value={title}
          placeholder={titlePlaceholder}
          readOnly={!editable}
          autoFocus={autoFocus === "title"}
          inputProps={{ "aria-label": t("notes.titlePlaceholder"), maxLength: 200 }}
          onChange={(event) => {
            editedRef.current = true;
            setTitle(event.target.value);
            edit({ title: event.target.value });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              bodyRef.current?.focus();
            }
          }}
          sx={{ fontSize: { xs: "1.4rem", md: "1.75rem" }, fontWeight: 700, mb: 1 }}
        />
        <NoteBodyEditor
          ref={bodyRef}
          markdown={body.markdown}
          revision={body.revision}
          editable={editable}
          autoFocus={autoFocus === "body"}
          placeholder={t("notes.bodyPlaceholder")}
          onChange={(markdown) => {
            editedRef.current = true;
            edit({ body: markdown });
          }}
        />
        {trackersOn && created && (
          <NoteTrackersPanel
            noteId={note.id}
            hideCalories={personal.hideCalories}
            missingKey={trackerLog.missingKey}
          />
        )}
      </Box>
    </Box>
  );
};

export default NoteEditor;
