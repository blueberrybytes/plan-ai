import React, { useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { UploadFile as UploadFileIcon, Article as ArticleIcon } from "@mui/icons-material";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [mode, setMode] = useState<TranscriptInputMode>(DEFAULT_MODE);
  const [title, setTitle] = useState<string>("");
  const [recordedAt, setRecordedAt] = useState<string>(() => getDefaultRecordedAt());
  const [metadataJson, setMetadataJson] = useState<string>("");
  const [persona, setPersona] =
    useState<NonNullable<CreateTranscriptRequest["persona"]>>("ARCHITECT");
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
    setMetadataJson("");
    setPersona("ARCHITECT");
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

    let metadataPayload: InputJsonValue | undefined;
    if (metadataJson.trim()) {
      try {
        metadataPayload = JSON.parse(metadataJson) as InputJsonValue;
      } catch (parseError) {
        console.error(parseError);
        setErrorMessage(t("sessionTranscriptDialog.messages.metadataError"));
        return;
      }
    }

    try {
      if (mode === "upload") {
        if (selectedFiles.length === 0) {
          setErrorMessage(t("sessionTranscriptDialog.messages.selectFileError"));
          return;
        }

        const unsupported = selectedFiles.filter(
          (file) => !ACCEPTED_MIME_TYPES.includes(file.type),
        );
        if (unsupported.length > 0) {
          setErrorMessage(t("sessionTranscriptDialog.messages.unsupportedError"));
          return;
        }

        await uploadTranscript({
          sessionId,
          files: selectedFiles,
          title: title.trim() || undefined,
          recordedAt: recordedAt || undefined,
          metadataJson: metadataJson.trim() || undefined,
          persona,
          contextIds: selectedContextIds.length > 0 ? selectedContextIds : undefined,
        }).unwrap();
      } else {
        const content = manualContent.trim();
        if (!content) {
          setErrorMessage(t("sessionTranscriptDialog.messages.contentError"));
          return;
        }

        const requestBody: CreateTranscriptRequest = {
          content,
          title: title.trim() || undefined,
          recordedAt: recordedAt ? new Date(recordedAt).toISOString() : undefined,
          metadata: metadataPayload || null,
          source: "MANUAL",
          contextIds: selectedContextIds.length > 0 ? selectedContextIds : undefined,
          persona,
        };

        await createTranscript({
          sessionId,
          body: requestBody,
        }).unwrap();
      }

      dispatch(
        setToastMessage({
          message: t("sessionTranscriptDialog.messages.success"),
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
      dispatch(
        setToastMessage({
          message: derivedMessage,
          severity: "error",
        }),
      );
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
        <DialogTitle id="session-transcript-dialog-title">
          {t("sessionTranscriptDialog.title")}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t("sessionTranscriptDialog.modeLabel")}
              </Typography>
              <RadioGroup row value={mode} onChange={handleModeChange}>
                <FormControlLabel
                  value="upload"
                  control={<Radio />}
                  label={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <UploadFileIcon fontSize="small" />
                      <Typography>{t("sessionTranscriptDialog.uploadLabel")}</Typography>
                    </Stack>
                  }
                />
                <FormControlLabel
                  value="manual"
                  control={<Radio />}
                  label={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <ArticleIcon fontSize="small" />
                      <Typography>{t("sessionTranscriptDialog.manualLabel")}</Typography>
                    </Stack>
                  }
                />
              </RadioGroup>
            </Box>

            <Divider />

            <Box>
              <FormControl fullWidth>
                <InputLabel id="persona-select-label">
                  {t("sessionTranscriptDialog.personaLabel")}
                </InputLabel>
                <Select
                  labelId="persona-select-label"
                  id="persona-select"
                  value={persona}
                  label={t("sessionTranscriptDialog.personaLabel")}
                  onChange={(e) =>
                    setPersona(
                      e.target.value as "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER",
                    )
                  }
                >
                  <MenuItem value="SECRETARY">
                    <Box>
                      <Typography variant="body1">
                        {t("sessionTranscriptDialog.personas.SECRETARY.name")}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t("sessionTranscriptDialog.personas.SECRETARY.description")}
                      </Typography>
                    </Box>
                  </MenuItem>
                  <MenuItem value="ARCHITECT">
                    <Box>
                      <Typography variant="body1">
                        {t("sessionTranscriptDialog.personas.ARCHITECT.name")}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t("sessionTranscriptDialog.personas.ARCHITECT.description")}
                      </Typography>
                    </Box>
                  </MenuItem>
                  <MenuItem value="PRODUCT_MANAGER">
                    <Box>
                      <Typography variant="body1">
                        {t("sessionTranscriptDialog.personas.PRODUCT_MANAGER.name")}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t("sessionTranscriptDialog.personas.PRODUCT_MANAGER.description")}
                      </Typography>
                    </Box>
                  </MenuItem>
                  <MenuItem value="DEVELOPER">
                    <Box>
                      <Typography variant="body1">
                        {t("sessionTranscriptDialog.personas.DEVELOPER.name")}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t("sessionTranscriptDialog.personas.DEVELOPER.description")}
                      </Typography>
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Stack spacing={2}>
              <TextField
                label={t("sessionTranscriptDialog.fields.title")}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                fullWidth
              />
              <TextField
                label={t("sessionTranscriptDialog.fields.recordedAt")}
                type="datetime-local"
                value={recordedAt}
                onChange={(event) => setRecordedAt(event.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label={t("sessionTranscriptDialog.fields.metadata")}
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
                    label={t("sessionTranscriptDialog.fields.contexts")}
                    placeholder={
                      contextOptions.length > 0
                        ? t("sessionTranscriptDialog.fields.contextsPlaceholder")
                        : t("sessionTranscriptDialog.fields.noContexts")
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
                  {t("sessionTranscriptDialog.buttons.selectFiles")}
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
                      {t("sessionTranscriptDialog.messages.noFiles")}
                    </Typography>
                  ) : (
                    selectedFiles.map((file) => (
                      <Typography key={`${file.name}-${file.lastModified}`} variant="body2">
                        {file.name || `File (${file.type || "unknown"})`}
                      </Typography>
                    ))
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {t("sessionTranscriptDialog.messages.formats")}
                  </Typography>
                </Stack>
              </Stack>
            ) : (
              <TextField
                label={t("sessionTranscriptDialog.fields.content")}
                value={manualContent}
                onChange={(event) => setManualContent(event.target.value)}
                multiline
                minRows={8}
                placeholder={t("sessionTranscriptDialog.fields.contentPlaceholder")}
                fullWidth
              />
            )}

            {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={isSubmitting}>
            {t("sessionTranscriptDialog.buttons.cancel")}
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting
              ? t("sessionTranscriptDialog.buttons.saving")
              : t("sessionTranscriptDialog.buttons.save")}
          </Button>
        </DialogActions>
      </form>
      <Dialog open={isSubmitting} disableEscapeKeyDown maxWidth="xs" fullWidth>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 4 }}
        >
          <CircularProgress size={60} thickness={4} sx={{ mb: 3 }} />
          <Typography variant="h6" gutterBottom align="center">
            {t("sessionTranscriptDialog.messages.processing")}
          </Typography>
          <Typography variant="body2" color="text.secondary" align="center">
            {t("sessionTranscriptDialog.messages.processingWait")}
          </Typography>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default SessionTranscriptDialog;
