import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  IconButton,
  List,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Add as AddIcon, Close as CloseIcon, OpenInNew as OpenIcon } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useListNotesQuery, type Note } from "../../store/apis/notesApi";
import NoteEditorPane from "./NoteEditorPane";
import NoteListItem from "./NoteListItem";
import { NoteEmptyState, NoteListSkeleton } from "./NoteListStates";
import { makeDraftNote, newNoteId } from "./noteUtils";

interface NotesSectionProps {
  /** Lists the notes linked to this project, and links new ones to it. */
  projectId?: string | null;
  /** Lists the notes linked to this meeting, and links new ones to it. */
  transcriptId?: string | null;
}

/** Compact list of the notes of a project or meeting, with an editor in a dialog. */
const NotesSection: React.FC<NotesSectionProps> = ({ projectId, transcriptId }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Note | null>(null);

  const { data, isLoading, isError, refetch } = useListNotesQuery({
    scope: "all",
    limit: 50,
    ...(transcriptId ? { transcriptId } : projectId ? { projectId } : {}),
  });
  const notes = data?.notes ?? [];

  const handleAdd = () => {
    const id = newNoteId();
    setDraft(makeDraftNote(id, { projectId, transcriptId }));
    setOpenId(id);
  };

  const close = () => {
    setOpenId(null);
    setDraft(null);
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Typography variant="h6" fontWeight={600} sx={{ flex: 1 }}>
            {t("notes.section.title")}
          </Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={handleAdd}>
            {t("notes.section.add")}
          </Button>
        </Stack>

        {isLoading ? (
          <NoteListSkeleton rows={2} />
        ) : isError ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetch()}>
                {t("notes.retry")}
              </Button>
            }
          >
            {t("notes.loadFailed")}
          </Alert>
        ) : notes.length === 0 ? (
          <NoteEmptyState
            title={t("notes.section.emptyTitle")}
            body={transcriptId ? t("notes.section.emptyMeeting") : t("notes.section.emptyProject")}
          />
        ) : (
          <List disablePadding>
            {notes.map((note) => (
              <NoteListItem
                key={note.id}
                note={note}
                selected={false}
                onSelect={(selected) => setOpenId(selected.id)}
              />
            ))}
          </List>
        )}
      </CardContent>

      <Dialog
        open={Boolean(openId)}
        onClose={close}
        fullScreen={fullScreen}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { height: fullScreen ? "100%" : "80vh" } }}
      >
        <Box sx={{ display: "flex", alignItems: "center", px: 1, pt: 1 }}>
          <Box sx={{ flex: 1 }} />
          {openId && draft?.id !== openId && (
            <Tooltip title={t("notes.actions.openInNotes")}>
              <IconButton
                size="small"
                aria-label={t("notes.actions.openInNotes")}
                onClick={() => navigate(`/notes?note=${encodeURIComponent(openId)}`)}
              >
                <OpenIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={t("notes.section.close")}>
            <IconButton size="small" aria-label={t("notes.section.close")} onClick={close}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          {openId && (
            <NoteEditorPane
              key={openId}
              noteId={openId}
              draft={draft?.id === openId ? draft : null}
              hideProject={Boolean(projectId) && !transcriptId}
              onRemoved={close}
            />
          )}
        </Box>
      </Dialog>
    </Card>
  );
};

export default NotesSection;
