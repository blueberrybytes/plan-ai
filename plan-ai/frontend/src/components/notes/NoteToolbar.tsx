import React, { useState } from "react";
import { Box, Button, IconButton, Tooltip } from "@mui/material";
import {
  DeleteForever as DeleteForeverIcon,
  DeleteOutline as TrashIcon,
  Lock as PrivateIcon,
  PushPin as PinnedIcon,
  PushPinOutlined as PinIcon,
  Groups as SharedIcon,
  RestoreFromTrash as RestoreIcon,
} from "@mui/icons-material";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import {
  usePurgeNoteMutation,
  useRestoreNoteMutation,
  useTrashNoteMutation,
  type Note,
  type UpdateNoteRequest,
} from "../../store/apis/notesApi";
import { setToastMessage } from "../../store/slices/app/appSlice";
import { reportUnexpectedError } from "../../utils/reportError";
import ConfirmDeletionDialog from "../dialogs/ConfirmDeletionDialog";
import NoteProjectSelect from "./NoteProjectSelect";
import NoteShareDialog from "./NoteShareDialog";
import { saveErrorMessage } from "./NoteSaver";

interface NoteToolbarProps {
  note: Note;
  /** False while the note is a draft that is not on the server yet. */
  exists: boolean;
  /** Owner or admin of the workspace: may delete a shared note of someone else. */
  canModerate: boolean;
  hideProject?: boolean;
  onSetMeta: (patch: UpdateNoteRequest) => void;
  /** Runs before the note goes to the trash, to send unsaved text first. */
  onBeforeTrash: () => Promise<void>;
  /** The note left this view (trashed or deleted for good). */
  onRemoved: () => void;
}

const NoteToolbar: React.FC<NoteToolbarProps> = ({
  note,
  exists,
  canModerate,
  hideProject = false,
  onSetMeta,
  onBeforeTrash,
  onRemoved,
}) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [shareOpen, setShareOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [trashNote, { isLoading: trashing }] = useTrashNoteMutation();
  const [restoreNote, { isLoading: restoring }] = useRestoreNoteMutation();
  const [purgeNote, { isLoading: purging }] = usePurgeNoteMutation();

  const toast = (severity: "success" | "error", message: string) =>
    dispatch(setToastMessage({ severity, message }));

  const run = async (action: () => Promise<unknown>, doneKey: string, after?: () => void) => {
    try {
      await action();
      toast("success", t(doneKey));
      after?.();
    } catch (error) {
      reportUnexpectedError("notes.action", error, { noteId: note.id, action: doneKey });
      // A 403 carries the reason, e.g. only the author or an admin can delete.
      toast("error", saveErrorMessage(error) ?? t("notes.toast.actionFailed"));
    }
  };

  const handleTrash = () =>
    run(
      async () => {
        await onBeforeTrash();
        await trashNote(note.id).unwrap();
      },
      "notes.toast.trashed",
      onRemoved,
    );

  if (note.deletedAt) {
    if (!note.isMine) return null;
    return (
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<RestoreIcon />}
          disabled={restoring}
          onClick={() => run(() => restoreNote(note.id).unwrap(), "notes.toast.restored")}
        >
          {t("notes.actions.restore")}
        </Button>
        <Button
          size="small"
          color="error"
          startIcon={<DeleteForeverIcon />}
          onClick={() => setPurgeOpen(true)}
        >
          {t("notes.actions.deleteForever")}
        </Button>
        <ConfirmDeletionDialog
          open={purgeOpen}
          title={t("notes.purgeDialog.title")}
          description={t("notes.purgeDialog.description")}
          entityName={note.title ?? undefined}
          confirmLabel={t("notes.actions.deleteForever")}
          isProcessing={purging}
          onCancel={() => setPurgeOpen(false)}
          onConfirm={() =>
            run(
              () => purgeNote(note.id).unwrap(),
              "notes.toast.purged",
              () => {
                setPurgeOpen(false);
                onRemoved();
              },
            )
          }
        />
      </Box>
    );
  }

  const trashButton = (
    <Tooltip title={t("notes.actions.delete")}>
      <span>
        <IconButton
          size="small"
          aria-label={t("notes.actions.delete")}
          disabled={!exists || trashing}
          onClick={handleTrash}
        >
          <TrashIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );

  if (!note.isMine) {
    return canModerate && note.visibility === "WORKSPACE" ? trashButton : null;
  }

  const shared = note.visibility === "WORKSPACE";
  const shareLabel = shared ? t("notes.actions.makePrivate") : t("notes.actions.share");

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
      <Tooltip title={note.pinned ? t("notes.actions.unpin") : t("notes.actions.pin")}>
        <span>
          <IconButton
            size="small"
            aria-label={note.pinned ? t("notes.actions.unpin") : t("notes.actions.pin")}
            aria-pressed={note.pinned}
            disabled={!exists}
            color={note.pinned ? "primary" : "default"}
            onClick={() => onSetMeta({ pinned: !note.pinned })}
          >
            {note.pinned ? <PinnedIcon fontSize="small" /> : <PinIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={shareLabel}>
        <span>
          <IconButton
            size="small"
            aria-label={shareLabel}
            disabled={!exists}
            color={shared ? "primary" : "default"}
            onClick={() => (shared ? onSetMeta({ visibility: "PRIVATE" }) : setShareOpen(true))}
          >
            {shared ? <SharedIcon fontSize="small" /> : <PrivateIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
      {trashButton}
      {!hideProject && (
        <NoteProjectSelect
          projectId={note.projectId}
          disabled={!exists}
          onChange={(projectId) => onSetMeta({ projectId })}
        />
      )}
      <NoteShareDialog
        open={shareOpen}
        onCancel={() => setShareOpen(false)}
        onConfirm={() => {
          setShareOpen(false);
          onSetMeta({ visibility: "WORKSPACE" });
        }}
      />
    </Box>
  );
};

export default NoteToolbar;
