import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { useSendMeetingNotesMutation } from "../../store/apis/transcriptApi";
import { setToastMessage } from "../../store/slices/app/appSlice";
import { selectUser } from "../../store/slices/auth/authSelector";

const MAX_RECIPIENTS = 30;
const EMAIL_RE = /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]{2,}$/;

interface Attendee {
  name?: string;
  email: string;
}

interface NotesEmailRecord {
  sentAt: string;
  count: number;
}

/** Attendees of the calendar invite saved with the meeting, if any. */
const attendeesOf = (metadata: unknown): Attendee[] => {
  const event = (metadata as { calendarEvent?: { attendees?: unknown } } | null)?.calendarEvent;
  if (!Array.isArray(event?.attendees)) return [];
  return event.attendees.filter(
    (a): a is Attendee => !!a && typeof (a as Attendee).email === "string",
  );
};

const sendsOf = (metadata: unknown): NotesEmailRecord[] => {
  const list = (metadata as { notesEmails?: unknown } | null)?.notesEmails;
  return Array.isArray(list)
    ? list.filter((r): r is NotesEmailRecord => typeof (r as NotesEmailRecord)?.sentAt === "string")
    : [];
};

/**
 * Sends the meeting notes (summary, key points, action items) by email to the
 * people the user ticks. The calendar invite fills the list; more addresses
 * can be added by hand. Never sent without this dialog.
 */
const SendNotesDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  transcriptId: string;
  metadata: unknown;
}> = ({ open, onClose, transcriptId, metadata }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const me = useSelector(selectUser)?.email?.toLowerCase() ?? "";
  const [sendNotes, { isLoading }] = useSendMeetingNotesMutation();

  const invited = useMemo(
    () => attendeesOf(metadata).filter((a) => a.email.toLowerCase() !== me),
    [metadata, me],
  );
  const previous = sendsOf(metadata);
  const last = previous[previous.length - 1];

  const [people, setPeople] = useState<Attendee[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState(false);
  const [message, setMessage] = useState("");

  // Everyone in the invite starts ticked each time the dialog opens. Only on
  // opening: the page refreshes the meeting every few seconds while tasks
  // sync, and resetting then would undo the user's choices (or tick again
  // people who already got the email).
  const invitedRef = useRef(invited);
  invitedRef.current = invited;
  useEffect(() => {
    if (!open) return;
    const invitedNow = invitedRef.current;
    setPeople(invitedNow);
    setSelected(new Set(invitedNow.map((a) => a.email.toLowerCase())));
    setDraft("");
    setDraftError(false);
    setMessage("");
  }, [open]);

  const toggle = (email: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const key = email.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const addDraft = () => {
    const email = draft.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email) || email === me) {
      setDraftError(true);
      return;
    }
    if (!people.some((p) => p.email.toLowerCase() === email)) {
      setPeople((prev) => [...prev, { email }]);
    }
    setSelected((prev) => new Set(prev).add(email));
    setDraft("");
    setDraftError(false);
  };

  const recipients = [...selected];
  const tooMany = recipients.length > MAX_RECIPIENTS;

  const handleSend = async () => {
    try {
      const response = await sendNotes({
        id: transcriptId,
        recipients,
        message: message.trim() || undefined,
      }).unwrap();
      const result = response.data;
      const notSent = [...(result?.failed ?? []), ...(result?.invalid ?? [])];
      dispatch(
        setToastMessage({
          severity: notSent.length ? "warning" : "success",
          message: notSent.length
            ? t("sendNotes.partlySent", {
                count: result?.sent.length ?? 0,
                failed: notSent.join(", "),
              })
            : t("sendNotes.sent", { count: result?.sent.length ?? 0 }),
        }),
      );
      onClose();
    } catch (e) {
      const text = (e as { data?: { message?: string } })?.data?.message || t("sendNotes.failed");
      dispatch(setToastMessage({ severity: "error", message: text }));
    }
  };

  return (
    <Dialog open={open} onClose={isLoading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t("sendNotes.title")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t("sendNotes.description")}
        </Typography>

        {last && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {t("sendNotes.alreadySent", {
              count: last.count,
              date: new Date(last.sentAt).toLocaleString(),
            })}
          </Alert>
        )}

        {people.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t("sendNotes.noInvite")}
          </Typography>
        ) : (
          <Box sx={{ mb: 2, maxHeight: 240, overflowY: "auto" }}>
            {people.map((p) => (
              <FormControlLabel
                key={p.email}
                sx={{ display: "flex" }}
                control={
                  <Checkbox
                    checked={selected.has(p.email.toLowerCase())}
                    onChange={() => toggle(p.email)}
                  />
                }
                label={p.name ? `${p.name} (${p.email})` : p.email}
              />
            ))}
          </Box>
        )}

        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <TextField
            size="small"
            fullWidth
            label={t("sendNotes.addLabel")}
            value={draft}
            error={draftError}
            helperText={draftError ? t("sendNotes.invalidEmail") : undefined}
            onChange={(e) => {
              setDraft(e.target.value);
              setDraftError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDraft();
              }
            }}
          />
          <Button onClick={addDraft} disabled={!draft.trim()}>
            {t("sendNotes.add")}
          </Button>
        </Stack>

        <TextField
          fullWidth
          multiline
          minRows={2}
          maxRows={6}
          label={t("sendNotes.messageLabel")}
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
        />

        {tooMany && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {t("sendNotes.tooMany", { max: MAX_RECIPIENTS })}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
          {t("sendNotes.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={handleSend}
          disabled={isLoading || recipients.length === 0 || tooMany}
          startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {t("sendNotes.send", { count: recipients.length })}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SendNotesDialog;
