import React, { useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { UploadFile as UploadFileIcon, Article as ArticleIcon } from "@mui/icons-material";
import { useDispatch } from "react-redux";
import type { components } from "../../types/api";
import {
  useCreateSessionTranscriptMutation,
  useUploadSessionTranscriptMutation,
  type CreateTranscriptRequest,
} from "../../store/apis/sessionApi";
import { setToastMessage } from "../../store/slices/app/appSlice";
import { useListContextsQuery } from "../../store/apis/contextApi";

type InputJsonValue = components["schemas"]["InputJsonValue"];
type ContextResponse = components["schemas"]["ContextResponse"];

const isJsonObject = (value: InputJsonValue): value is Record<string, InputJsonValue> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const formatDateForDateTimeInput = (date: Date) => {
  const pad = (value: number) => value.toString().padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const getDefaultRecordedAt = () => formatDateForDateTimeInput(new Date());

const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

interface SessionTranscriptDialogProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
}

type TranscriptInputMode = "upload" | "manual";

const DEFAULT_MODE: TranscriptInputMode = "upload";

const SessionTranscriptDialog: React.FC<SessionTranscriptDialogProps> = ({
  open,
  onClose,
  sessionId,
}) => {
  const dispatch = useDispatch();
  const [mode, setMode] = useState<TranscriptInputMode>(DEFAULT_MODE);
  const [title, setTitle] = useState<string>("");
  const [recordedAt, setRecordedAt] = useState<string>(() => getDefaultRecordedAt());
  const [language, setLanguage] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [metadataJson, setMetadataJson] = useState<string>("");
  const [manualContent, setManualContent] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [createTranscript, { isLoading: isCreating }] = useCreateSessionTranscriptMutation();
  const [uploadTranscript, { isLoading: isUploading }] = useUploadSessionTranscriptMutation();
  const { data: contextsData, isLoading: isContextsLoading } = useListContextsQuery();

  const contextOptions = useMemo<ContextResponse[]>(
    () => contextsData?.data?.contexts ?? [],
    [contextsData],
  );

  const selectedContextOptions = useMemo<ContextResponse[]>(
    () =>
      selectedContextIds
        .map((id) => contextOptions.find((context) => context.id === id))
        .filter((context): context is ContextResponse => Boolean(context)),
    [contextOptions, selectedContextIds],
  );

  const isSubmitting = useMemo(() => isCreating || isUploading, [isCreating, isUploading]);

  const resetState = () => {
    setMode(DEFAULT_MODE);
    setTitle("");
    setRecordedAt(getDefaultRecordedAt());
    setLanguage("");
    setSummary("");
    setMetadataJson("");
    setManualContent("");
    setSelectedFiles([]);
    setSelectedContextIds([]);
    setErrorMessage("");
  };

  const handleClose = () => {
    if (isSubmitting) {
      return;
    }
    resetState();
    onClose();
  };

  const handleModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextMode = event.target.value as TranscriptInputMode;
    setMode(nextMode);
    setErrorMessage("");
  };

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setSelectedFiles(files);
    setErrorMessage("");
    // Allow re-selecting the same file
    if (event.target.value) {
      event.target.value = "";
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const trimmedSummary = summary.trim();
    const trimmedLanguage = language.trim();

    let parsedMetadata: InputJsonValue | undefined;
    if (metadataJson.trim()) {
      try {
        parsedMetadata = JSON.parse(metadataJson) as InputJsonValue;
      } catch (parseError) {
        console.error(parseError);
        setErrorMessage("Metadata must be valid JSON.");
        return;
      }
    }

    const extraMetadata: Record<string, InputJsonValue> = {};
    if (trimmedSummary) {
      extraMetadata.summary = trimmedSummary;
    }
    if (trimmedLanguage) {
      extraMetadata.language = trimmedLanguage;
    }

    let metadataPayload: InputJsonValue | undefined = parsedMetadata;
    if (Object.keys(extraMetadata).length > 0) {
      if (metadataPayload === undefined) {
        metadataPayload = extraMetadata;
      } else if (isJsonObject(metadataPayload)) {
        metadataPayload = { ...metadataPayload, ...extraMetadata };
      }
    }

    try {
      if (mode === "upload") {
        if (selectedFiles.length === 0) {
          setErrorMessage("Please select at least one PDF or DOCX file to upload.");
          return;
        }

        const unsupported = selectedFiles.filter(
          (file) => !ACCEPTED_MIME_TYPES.includes(file.type),
        );
        if (unsupported.length > 0) {
          setErrorMessage("Only PDF and DOCX files are supported.");
          return;
        }

        await uploadTranscript({
          sessionId,
          files: selectedFiles,
          title: title.trim() || undefined,
          recordedAt: recordedAt || undefined,
          metadataJson: metadataJson.trim() || undefined,
          language: language.trim() || undefined,
          summary: summary.trim() || undefined,
        }).unwrap();
      } else {
        const content = manualContent.trim();
        if (!content) {
          setErrorMessage("Please provide transcript content.");
          return;
        }

        const requestBody: CreateTranscriptRequest & {
          contextIds?: string[];
        } = {
          content,
          title: title.trim() || undefined,
          recordedAt: recordedAt ? new Date(recordedAt).toISOString() : undefined,
          metadata: metadataPayload,
          source: "MANUAL",
          contextIds: selectedContextIds.length > 0 ? selectedContextIds : undefined,
        };

        await createTranscript({
          sessionId,
          body: requestBody,
        }).unwrap();
      }

      dispatch(
        setToastMessage({
          message: "Transcript created successfully.",
          severity: "success",
        }),
      );
      handleClose();
    } catch (error) {
      const fallbackMessage =
        mode === "upload"
          ? "Failed to upload transcript. Please try again."
          : "Failed to create transcript. Please try again.";
      const derivedMessage =
        (error as { data?: { message?: string }; message?: string })?.data?.message ??
        (error as { message?: string }).message ??
        fallbackMessage;
      setErrorMessage(derivedMessage);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      aria-labelledby="session-transcript-dialog-title"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle id="session-transcript-dialog-title">Add transcript</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Select input method
              </Typography>
              <RadioGroup row value={mode} onChange={handleModeChange}>
                <FormControlLabel
                  value="upload"
                  control={<Radio />}
                  label={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <UploadFileIcon fontSize="small" />
                      <Typography>Upload files (PDF / DOCX)</Typography>
                    </Stack>
                  }
                />
                <FormControlLabel
                  value="manual"
                  control={<Radio />}
                  label={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <ArticleIcon fontSize="small" />
                      <Typography>Paste transcript text</Typography>
                    </Stack>
                  }
                />
              </RadioGroup>
            </Box>

            <Stack spacing={2}>
              <TextField
                label="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                fullWidth
              />
              <TextField
                label="Recorded at"
                type="datetime-local"
                value={recordedAt}
                onChange={(event) => setRecordedAt(event.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Language"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Summary"
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  fullWidth
                />
              </Stack>
              <TextField
                label="Metadata (JSON)"
                value={metadataJson}
                onChange={(event) => setMetadataJson(event.target.value)}
                placeholder='{"key":"value"}'
                minRows={3}
                multiline
              />
              <Autocomplete
                multiple
                options={contextOptions}
                value={selectedContextOptions}
                loading={isContextsLoading}
                onChange={(_, value) => {
                  setSelectedContextIds(value.map((context) => context.id));
                }}
                getOptionLabel={(option) => option.name}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip {...getTagProps({ index })} key={option.id} label={option.name} />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Related contexts"
                    placeholder={
                      contextOptions.length > 0
                        ? "Select contexts to enrich analysis"
                        : "No contexts available"
                    }
                  />
                )}
                filterSelectedOptions
                disableCloseOnSelect
                fullWidth
              />
            </Stack>

            <Divider />

            {mode === "upload" ? (
              <Stack spacing={2}>
                <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                  Select files
                  <input
                    hidden
                    type="file"
                    multiple
                    accept={ACCEPTED_MIME_TYPES.join(",")}
                    onChange={handleFilesSelected}
                  />
                </Button>
                <Stack spacing={0.5}>
                  {selectedFiles.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No files selected yet.
                    </Typography>
                  ) : (
                    selectedFiles.map((file) => (
                      <Typography key={`${file.name}-${file.lastModified}`} variant="body2">
                        {file.name || `File (${file.type || "unknown"})`}
                      </Typography>
                    ))
                  )}
                  <Typography variant="caption" color="text.secondary">
                    Accepted formats: PDF, DOCX
                  </Typography>
                </Stack>
              </Stack>
            ) : (
              <TextField
                label="Transcript content"
                value={manualContent}
                onChange={(event) => setManualContent(event.target.value)}
                multiline
                minRows={8}
                placeholder="Paste or type transcript text here"
                fullWidth
              />
            )}

            {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save transcript"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default SessionTranscriptDialog;
