// Port of plan-ai/frontend/src/components/transcript/TranscriptShareBar.tsx.
import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  InputAdornment,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  FileDownloadOutlined as DownloadIcon,
  ContentCut as ContentCutIcon,
  ContentCopy as ContentCopyIcon,
} from "@mui/icons-material";
import { useAuth } from "../../hooks/useAuth";
import type { TranscriptClip, TranscriptExportFormat } from "../../services/planAiApi";
import type { RecordingAudioPlayerHandle } from "../RecordingAudioPlayer";
import { defaultClipRange, formatClipClock, readClipRange } from "../../utils/clipTimes";
import { fileSafeName } from "../../utils/transcriptTranslation";

const FORMATS: { format: TranscriptExportFormat; label: string }[] = [
  { format: "srt", label: "Subtitles (.srt)" },
  { format: "vtt", label: "Subtitles (.vtt)" },
  { format: "txt", label: "Text (.txt)" },
];

const CLIP_ERRORS: Record<string, string> = {
  format: "Write the times as mm:ss.",
  order: "The end must be after the start.",
  tooShort: "A clip must be at least 1 second long.",
  tooLong: "A clip can be 5 minutes long at most.",
  outside: "The clip ends after the recording does.",
};

/** Saves text through the native dialog, or a browser download outside Electron. */
const saveText = async (content: string, fileName: string): Promise<void> => {
  if (window.electron?.saveFile) {
    await window.electron.saveFile(content, fileName);
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/**
 * Two actions on a saved meeting: save the transcript as subtitles or text,
 * and share a short piece of the audio through a link that expires.
 */
const TranscriptShareBar: React.FC<{
  transcriptId: string;
  title?: string | null;
  durationSeconds?: number | null;
  /** True when the transcript has sentences with times. Subtitles need them. */
  hasTimedText: boolean;
  hasText: boolean;
  playerRef: React.RefObject<RecordingAudioPlayerHandle | null>;
}> = ({ transcriptId, title, durationSeconds, hasTimedText, hasText, playerRef }) => {
  const { api } = useAuth();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [clipOpen, setClipOpen] = useState(false);
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
  const [clipError, setClipError] = useState<string | null>(null);
  const [clip, setClip] = useState<TranscriptClip | null>(null);
  const [copied, setCopied] = useState(false);
  const [cutting, setCutting] = useState(false);

  const handleExport = async (format: TranscriptExportFormat) => {
    setMenuAnchor(null);
    setExportError(null);
    setExporting(true);
    try {
      const content = await api.exportTranscript(transcriptId, format);
      await saveText(content, `${fileSafeName(title ?? "", "meeting")}.${format}`);
    } catch (error) {
      setExportError(
        (error as { status?: number })?.status === 409
          ? "This meeting has no transcript with times, so it cannot be saved as subtitles."
          : "The file could not be created. Try again.",
      );
    } finally {
      setExporting(false);
    }
  };

  const openClip = () => {
    const range = defaultClipRange(playerRef.current?.getCurrentTime() ?? null, durationSeconds);
    setStartText(formatClipClock(range.start));
    setEndText(formatClipClock(range.end));
    setClip(null);
    setClipError(null);
    setCopied(false);
    setClipOpen(true);
  };

  const handleCreateClip = async () => {
    const range = readClipRange(startText, endText, durationSeconds);
    if ("error" in range) {
      setClipError(CLIP_ERRORS[range.error]);
      return;
    }
    setClipError(null);
    setCutting(true);
    try {
      setClip(await api.createTranscriptClip(transcriptId, range));
    } catch (error) {
      const e = error as { status?: number; message?: string };
      setClipError(
        e?.status && e.status < 500 && e.message
          ? e.message
          : "The clip could not be created. Try again.",
      );
    } finally {
      setCutting(false);
    }
  };

  const handleCopy = async () => {
    if (!clip) return;
    try {
      await navigator.clipboard.writeText(clip.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  // The player renders nothing without audio, so its clock tells whether there is any.
  const hasAudio = () => playerRef.current?.getCurrentTime() != null;

  if (!hasText) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<DownloadIcon fontSize="small" />}
          disabled={exporting}
          onClick={(event) => setMenuAnchor(event.currentTarget)}
        >
          Export
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<ContentCutIcon fontSize="small" />}
          onClick={() => {
            if (hasAudio()) openClip();
            else setExportError("This meeting has no audio, so there is no clip to share.");
          }}
        >
          Share a clip
        </Button>
      </Box>
      {exportError && (
        <Alert severity="error" sx={{ mt: 1 }} onClose={() => setExportError(null)}>
          {exportError}
        </Alert>
      )}

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        {FORMATS.map(({ format, label }) => {
          const needsTimes = format !== "txt" && !hasTimedText;
          return (
            <MenuItem
              key={format}
              disabled={needsTimes}
              onClick={() => void handleExport(format)}
            >
              <ListItemText
                primary={label}
                secondary={needsTimes ? "Subtitles need a transcript with times." : undefined}
              />
            </MenuItem>
          );
        })}
      </Menu>

      <Dialog open={clipOpen} onClose={() => !cutting && setClipOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Share a clip of the audio</DialogTitle>
        <DialogContent>
          <DialogContentText variant="body2" sx={{ mb: 2 }}>
            Pick the part to share, up to 5 minutes. Anyone with the link can listen to it until
            it expires.
          </DialogContentText>
          <Box sx={{ display: "flex", gap: 2, pt: 1 }}>
            <TextField
              label="Start"
              value={startText}
              onChange={(event) => setStartText(event.target.value)}
              size="small"
              disabled={cutting}
              helperText="mm:ss"
              inputProps={{ inputMode: "numeric" }}
            />
            <TextField
              label="End"
              value={endText}
              onChange={(event) => setEndText(event.target.value)}
              size="small"
              disabled={cutting}
              helperText="mm:ss"
              inputProps={{ inputMode: "numeric" }}
            />
          </Box>
          {clipError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {clipError}
            </Alert>
          )}
          {clip && (
            <Box sx={{ mt: 2 }}>
              <TextField
                label="Link"
                value={clip.url}
                size="small"
                fullWidth
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title="Copy link">
                        <IconButton
                          size="small"
                          edge="end"
                          onClick={() => void handleCopy()}
                          aria-label="Copy link"
                        >
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ),
                }}
                onFocus={(event) => event.target.select()}
              />
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
                {copied ? "Link copied. " : ""}
                The link expires on{" "}
                {new Date(clip.expiresAt).toLocaleString(undefined, {
                  dateStyle: "long",
                  timeStyle: "short",
                })}
                .
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClipOpen(false)} disabled={cutting}>
            Close
          </Button>
          <Button variant="contained" onClick={() => void handleCreateClip()} disabled={cutting}>
            {cutting ? "Cutting the audio..." : "Create link"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TranscriptShareBar;
