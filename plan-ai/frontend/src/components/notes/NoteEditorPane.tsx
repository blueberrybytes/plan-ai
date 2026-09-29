import React, { useState } from "react";
import { Alert, Box, Button, Skeleton, Stack } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useGetNoteQuery, type Note } from "../../store/apis/notesApi";
import NoteEditor from "./NoteEditor";
import { useCanModerateNotes } from "./useCanModerateNotes";

interface NoteEditorPaneProps {
  noteId: string;
  /** A new note not saved yet. It is created on the first save. */
  draft?: Note | null;
  hideProject?: boolean;
  onBack?: () => void;
  onRemoved: () => void;
}

const EditorSkeleton: React.FC = () => (
  <Stack spacing={2} sx={{ p: { xs: 2, md: 4 } }} aria-hidden="true">
    <Skeleton variant="text" width="45%" height={44} />
    <Skeleton variant="text" width="90%" />
    <Skeleton variant="text" width="80%" />
    <Skeleton variant="text" width="60%" />
  </Stack>
);

/** Loads one note and shows its editor. Mount it with `key={noteId}`. */
const NoteEditorPane: React.FC<NoteEditorPaneProps> = ({
  noteId,
  draft,
  hideProject,
  onBack,
  onRemoved,
}) => {
  const { t } = useTranslation();
  const canModerate = useCanModerateNotes();
  const [draftCreated, setDraftCreated] = useState(false);
  const isDraft = Boolean(draft) && draft?.id === noteId;
  const { data, isLoading, isError, refetch } = useGetNoteQuery(noteId, {
    skip: isDraft && !draftCreated,
  });
  const note = data ?? (isDraft ? draft : undefined);

  if (!note) {
    if (isLoading) return <EditorSkeleton />;
    if (isError) {
      return (
        <Box sx={{ p: 3 }}>
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetch()}>
                {t("notes.retry")}
              </Button>
            }
          >
            {t("notes.noteLoadFailed")}
          </Alert>
          {onBack && (
            <Button sx={{ mt: 2 }} onClick={onBack}>
              {t("notes.back")}
            </Button>
          )}
        </Box>
      );
    }
    return <EditorSkeleton />;
  }

  return (
    <NoteEditor
      // Restoring from the trash changes the version: open a fresh editor.
      key={`${note.id}:${note.deletedAt ? "trash" : "live"}`}
      note={note}
      exists={!isDraft}
      canModerate={canModerate}
      autoFocus={isDraft ? "body" : undefined}
      hideProject={hideProject}
      onBack={onBack}
      onCreated={() => setDraftCreated(true)}
      onRemoved={onRemoved}
    />
  );
};

export default NoteEditorPane;
