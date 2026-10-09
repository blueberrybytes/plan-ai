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
import DownloadIcon from "@mui/icons-material/FileDownloadOutlined";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useTranslation } from "react-i18next";
import {
  useCreateTranscriptClipMutation,
  useExportTranscriptMutation,
  useGetTranscriptAudioQuery,
  type TranscriptClip,
  type TranscriptExportFormat,
} from "../../store/apis/transcriptApi";
import { downloadTextFile, fileSafeName } from "../../utils/downloadFile";
import type { RecordingAudioPlayerHandle } from "./RecordingAudioPlayer";
import { defaultClipRange, formatClipClock, readClipRange } from "./clipTimes";

interface Props {
  transcriptId: string;
  title?: string | null;
  durationSeconds?: number | null;
  /** True when the transcript has sentences with times. Subtitles need them. */
  hasTimedText: boolean;
  hasText: boolean;
  playerRef: React.RefObject<RecordingAudioPlayerHandle | null>;
}

const FORMATS: { format: TranscriptExportFormat; labelKey: string; mimeType: string }[] = [
  { format: "srt", labelKey: "transcriptShare.exportSrt", mimeType: "application/x-subrip" },
  { format: "vtt", labelKey: "transcriptShare.exportVtt", mimeType: "text/vtt" },
  { format: "txt", labelKey: "transcriptShare.exportTxt", mimeType: "text/plain" },
];

const serverMessage = (error: unknown): string | null =>
  (error as { data?: { message?: string } })?.data?.message ?? null;

/**
 * Two actions on a saved meeting: download the transcript as subtitles or
 * text, and share a short piece of the audio through a link that expires.
 */
const TranscriptShareBar = ({
  transcriptId,
  title,
  durationSeconds,
  hasTimedText,
  hasText,
  playerRef,
}: Props) => {
  const { t } = useTranslation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [exportFailed, setExportFailed] = useState(false);
  const [exportFile, { isLoading: exporting }] = useExportTranscriptMutation();

  // Same request as the player, so this costs no extra call.
  const { data: audioData } = useGetTranscriptAudioQuery(transcriptId);
  const audio = audioData?.data;
  const hasAudio = !!audio && !audio.audioDeletedAt && !!(audio.micUrl || audio.sysUrl);

  const [clipOpen, setClipOpen] = useState(false);
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
  const [clipError, setClipError] = useState<string | null>(null);
  const [clip, setClip] = useState<TranscriptClip | null>(null);
  const [copied, setCopied] = useState(false);
  const [createClip, { isLoading: cutting }] = useCreateTranscriptClipMutation();

  const handleExport = async (format: TranscriptExportFormat, mimeType: string) => {
    setMenuAnchor(null);
    setExportFailed(false);
    try {
      const content = await exportFile({ id: transcriptId, format }).unwrap();
      downloadTextFile(`${fileSafeName(title ?? "", "meeting")}.${format}`, content, mimeType);
    } catch {
      setExportFailed(true);
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
      setClipError(t(`transcriptShare.errors.${range.error}`));
      return;
    }
    setClipError(null);
    try {
      const response = await createClip({ id: transcriptId, body: range }).unwrap();
      if (!response.data) throw new Error("empty");
      setClip(response.data);
    } catch (error) {
      setClipError(serverMessage(error) ?? t("transcriptShare.errors.failed"));
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

  if (!hasText && !hasAudio) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        {hasText && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadIcon fontSize="small" />}
            disabled={exporting}
            onClick={(event) => setMenuAnchor(event.currentTarget)}
          >
            {t("transcriptShare.export")}
          </Button>
        )}
        <Button
          size="small"
          variant="outlined"
          startIcon={<ContentCutIcon fontSize="small" />}
          disabled={!hasAudio}
          onClick={openClip}
        >
          {t("transcriptShare.clip")}
        </Button>
        {!hasAudio && (
          <Typography variant="caption" color="text.secondary">
            {t("transcriptShare.noAudio")}
          </Typography>
        )}
      </Box>
      {exportFailed && (
        <Alert severity="error" sx={{ mt: 1 }} onClose={() => setExportFailed(false)}>
          {t("transcriptShare.exportFailed")}
        </Alert>
      )}

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        {FORMATS.map(({ format, labelKey, mimeType }) => {
          const needsTimes = format !== "txt" && !hasTimedText;
          return (
            <MenuItem
              key={format}
              disabled={needsTimes}
              onClick={() => void handleExport(format, mimeType)}
            >
              <ListItemText
                primary={t(labelKey)}
                secondary={needsTimes ? t("transcriptShare.needsTimes") : undefined}
              />
            </MenuItem>
          );
        })}
      </Menu>

      <Dialog open={clipOpen} onClose={() => setClipOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t("transcriptShare.clipTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText variant="body2" sx={{ mb: 2 }}>
            {t("transcriptShare.clipIntro")}
          </DialogContentText>
          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField
              label={t("transcriptShare.start")}
              value={startText}
              onChange={(event) => setStartText(event.target.value)}
              size="small"
              disabled={cutting}
              helperText={t("transcriptShare.timeHelp")}
              inputProps={{ inputMode: "numeric" }}
            />
            <TextField
              label={t("transcriptShare.end")}
              value={endText}
              onChange={(event) => setEndText(event.target.value)}
              size="small"
              disabled={cutting}
              helperText={t("transcriptShare.timeHelp")}
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
                label={t("transcriptShare.link")}
                value={clip.url}
                size="small"
                fullWidth
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title={t("transcriptShare.copy")}>
                        <IconButton
                          size="small"
                          edge="end"
                          onClick={() => void handleCopy()}
                          aria-label={t("transcriptShare.copy")}
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
                {copied ? `${t("transcriptShare.copied")}. ` : ""}
                {t("transcriptShare.expires", {
                  date: new Date(clip.expiresAt).toLocaleString(undefined, {
                    dateStyle: "long",
                    timeStyle: "short",
                  }),
                })}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClipOpen(false)}>{t("transcriptShare.close")}</Button>
          <Button variant="contained" onClick={() => void handleCreateClip()} disabled={cutting}>
            {cutting ? t("transcriptShare.creating") : t("transcriptShare.create")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TranscriptShareBar;
