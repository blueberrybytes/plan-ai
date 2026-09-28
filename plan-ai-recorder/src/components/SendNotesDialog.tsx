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
import { useAuth } from "../hooks/useAuth";

const MAX_RECIPIENTS = 30;
const EMAIL_RE =
  /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]{2,}$/;

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
  const event = (
    metadata as { calendarEvent?: { attendees?: unknown } } | null
  )?.calendarEvent;
  if (!Array.isArray(event?.attendees)) return [];
  return event.attendees.filter(
    (a): a is Attendee => !!a && typeof (a as Attendee).email === "string",
  );
};

const sendsOf = (metadata: unknown): NotesEmailRecord[] => {
  const list = (metadata as { notesEmails?: unknown } | null)?.notesEmails;
  return Array.isArray(list)
    ? list.filter(
        (r): r is NotesEmailRecord =>
          typeof (r as NotesEmailRecord)?.sentAt === "string",
      )
    : [];
};

/**
 * Sends the meeting notes (summary, key points, action items) by email to
 * the people the user ticks. The calendar invite fills the list; more
 * addresses can be added by hand. Never sent without this dialog.
 */
const SendNotesDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  transcriptId: string;
  metadata: unknown;
}> = ({ open, onClose, onSent, transcriptId, metadata }) => {
  const { api, user } = useAuth();
  const me = user?.email?.toLowerCase() ?? "";

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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

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
    setError(null);
    setResult(null);
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
    setSending(true);
    setError(null);
    try {
      const res = await api.sendMeetingNotes(transcriptId, {
        recipients,
        message: message.trim() || undefined,
      });
      const notSent = [...res.failed, ...res.invalid];
      onSent();
      if (notSent.length) {
        setResult(
          `Sent to ${res.sent.length}. Not sent to: ${notSent.join(", ")}.`,
        );
      } else {
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The notes could not be sent.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={sending ? undefined : onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Send the notes by email</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Each person gets the summary, the key points and the action items in
          their own email. Replies go to you.
        </Typography>

        {last && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Last sent on {new Date(last.sentAt).toLocaleString()}. Recipients:{" "}
            {last.count}.
          </Alert>
        )}

        {people.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This meeting has no calendar invite. Add the addresses below.
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
            label="Add an email address"
            value={draft}
            error={draftError}
            helperText={
              draftError ? "That is not a valid email address." : undefined
            }
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
            Add
          </Button>
        </Stack>

        <TextField
          fullWidth
          multiline
          minRows={2}
          maxRows={6}
          label="Message above the notes (optional)"
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
        />

        {tooMany && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            At most {MAX_RECIPIENTS} people per send.
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        {result && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {result}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={sending}>
          {result ? "Close" : "Cancel"}
        </Button>
        {!result && (
          <Button
            variant="contained"
            onClick={handleSend}
            disabled={sending || recipients.length === 0 || tooMany}
            startIcon={
              sending ? <CircularProgress size={16} color="inherit" /> : undefined
            }
          >
            Send ({recipients.length})
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default SendNotesDialog;
