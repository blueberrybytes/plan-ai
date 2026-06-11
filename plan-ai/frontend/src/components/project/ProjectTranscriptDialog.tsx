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
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  UploadFile as UploadFileIcon,
  Article as ArticleIcon,
  Mic as MicIcon,
} from "@mui/icons-material";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import type { components } from "../../types/api";
import {
  useCreateProjectTranscriptMutation,
  useUploadProjectTranscriptMutation,
  useImportProjectTranscriptMutation,
  type CreateTranscriptRequest,
} from "../../store/apis/projectApi";
import { setToastMessage } from "../../store/slices/app/appSlice";
import { useListContextsQuery } from "../../store/apis/contextApi";
import { useListGlobalTranscriptsQuery } from "../../store/apis/transcriptApi";
import AiModelSelector from "../common/AiModelSelector";

type InputJsonValue = components["schemas"]["TsoaJsonObject"] | null;
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

interface ProjectTranscriptDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

type TranscriptInputMode = "upload" | "manual" | "import";

const DEFAULT_MODE: TranscriptInputMode = "upload";

const ProjectTranscriptDialog: React.FC<ProjectTranscriptDialogProps> = ({
  open,
  onClose,
  projectId,
}) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [mode, setMode] = useState<TranscriptInputMode>(DEFAULT_MODE);
  const [title, setTitle] = useState<string>("");
  const [objective, setObjective] = useState<string>("");
  const [recordedAt, setRecordedAt] = useState<string>(() => getDefaultRecordedAt());
  const [metadataJson, setMetadataJson] = useState<string>("");
  const [persona, setPersona] =
    useState<NonNullable<CreateTranscriptRequest["persona"]>>("ARCHITECT");
  const [complexityLevel, setEnglishLevel] = useState<string>("Intermediate");
  const [modelKey, setModelKey] = useState<string | null>(null);
  const [taskStrategy, setTaskStrategy] = useState<"AUTO" | "SINGLE_TICKET" | "SPECIFIC_COUNT">(
    "AUTO",
  );
  const [taskCount, setTaskCount] = useState<number>(5);
  const [manualContent, setManualContent] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);
  const [agenticInvestigation, setAgenticInvestigation] = useState<boolean>(true);
  // Meeting type drives a "playbook" (sensible persona/strategy defaults) and is
  // stored on the transcript metadata so the project's Meetings tab can show it.
  const [meetingType, setMeetingType] = useState<string>("general");
  const [confidential, setConfidential] = useState<boolean>(false);
  const [createDoc, setCreateDoc] = useState<boolean>(false);
  const [createSlides, setCreateSlides] = useState<boolean>(false);

  // Playbook: choosing a type preselects sensible outputs + persona/strategy.
  // The user can still override any toggle afterwards.
  const handleMeetingTypeChange = (type: string) => {
    setMeetingType(type);
    switch (type) {
      case "tasks": // standup / task meeting → tickets only
        setPersona("DEVELOPER");
        setTaskStrategy("AUTO");
        setCreateDoc(false);
        setCreateSlides(false);
        break;
      case "briefing": // briefing / discovery → a document
        setPersona("ARCHITECT");
        setCreateDoc(true);
        setCreateSlides(false);
        break;
      case "decision": // decision / strategy → document + slide deck
        setPersona("ARCHITECT");
        setCreateDoc(true);
        setCreateSlides(true);
        break;
      case "client": // client meeting → document + tickets
        setPersona("PRODUCT_MANAGER");
        setCreateDoc(true);
        setCreateSlides(false);
        break;
      default: // general → no extra artifacts
        setCreateDoc(false);
        setCreateSlides(false);
    }
  };

  const [createTranscript, { isLoading: isCreating }] = useCreateProjectTranscriptMutation();
  const [uploadTranscript, { isLoading: isUploading }] = useUploadProjectTranscriptMutation();
  const [importTranscript, { isLoading: isImporting }] = useImportProjectTranscriptMutation();
  const { data: contextsData, isLoading: isContextsLoading } = useListContextsQuery();
  const { data: recordingsData, isLoading: isRecordingsLoading } = useListGlobalTranscriptsQuery(
    { source: "RECORDING", pageSize: 100 },
    { skip: mode !== "import" },
  );

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

  const recordingOptions = useMemo(() => recordingsData?.data?.transcripts ?? [], [recordingsData]);

  const isSubmitting = useMemo(
    () => isCreating || isUploading || isImporting,
    [isCreating, isUploading, isImporting],
  );

  const resetState = () => {
    setMode(DEFAULT_MODE);
    setTitle("");
    setObjective("");
    setRecordedAt(getDefaultRecordedAt());
    setMetadataJson("");
    setPersona("ARCHITECT");
    setEnglishLevel("Intermediate");
    setModelKey(null);
    setTaskStrategy("AUTO");
    setTaskCount(5);
    setManualContent("");
    setSelectedFiles([]);
    setSelectedContextIds([]);
    setSelectedRecordingId(null);
    setErrorMessage("");
    setAgenticInvestigation(true);
    setMeetingType("general");
    setConfidential(false);
    setCreateDoc(false);
    setCreateSlides(false);
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
        setErrorMessage(t("projectTranscriptDialog.messages.metadataError"));
        return;
      }
    }

    // Always stamp the meeting type (+ confidential flag) onto the metadata so
    // the project's Meetings tab can categorize and the Digest can exclude it.
    const mergedMetadata: Record<string, unknown> = {
      ...((metadataPayload as Record<string, unknown> | undefined) ?? {}),
      meetingType,
      ...(confidential ? { confidential: true } : {}),
    };

    try {
      if (mode === "upload") {
        if (selectedFiles.length === 0) {
          setErrorMessage(t("projectTranscriptDialog.messages.selectFileError"));
          return;
        }

        const unsupported = selectedFiles.filter(
          (file) => !ACCEPTED_MIME_TYPES.includes(file.type),
        );
        if (unsupported.length > 0) {
          setErrorMessage(t("projectTranscriptDialog.messages.unsupportedError"));
          return;
        }

        await uploadTranscript({
          projectId,
          files: selectedFiles,
          title: title.trim() || undefined,
          recordedAt: recordedAt || undefined,
          metadataJson: JSON.stringify(mergedMetadata),
          persona,
          complexityLevel,
          modelKey: modelKey || undefined,
          taskStrategy,
          taskCount,
          contextIds: selectedContextIds.length > 0 ? selectedContextIds : undefined,
          agenticInvestigation,
          createDoc,
          createSlides,
        }).unwrap();
      } else if (mode === "manual") {
        const content = manualContent.trim();
        const obj = objective.trim();

        if (!content && !obj) {
          setErrorMessage(t("projectTranscriptDialog.messages.contentError"));
          return;
        }

        const requestBody: CreateTranscriptRequest = {
          content: content || undefined,
          title: title.trim() || undefined,
          recordedAt: recordedAt ? new Date(recordedAt).toISOString() : undefined,
          metadata: mergedMetadata as InputJsonValue,
          source: "MANUAL",
          contextIds: selectedContextIds.length > 0 ? selectedContextIds : undefined,
          persona,
          complexityLevel,
          objective: obj || undefined,
          modelKey: modelKey || undefined,
          taskStrategy,
          taskCount,
          agenticInvestigation,
          createDoc,
          createSlides,
        };

        await createTranscript({
          projectId,
          body: requestBody,
        }).unwrap();
      } else if (mode === "import") {
        if (!selectedRecordingId) {
          setErrorMessage("Please select a recording to import.");
          return;
        }

        await importTranscript({
          projectId,
          body: {
            transcriptId: selectedRecordingId,
            objective: objective.trim() || undefined,
            contextIds: selectedContextIds.length > 0 ? selectedContextIds : undefined,
            persona,
            complexityLevel,
            modelKey: modelKey || undefined,
            agenticInvestigation,
          },
        }).unwrap();
      }

      dispatch(
        setToastMessage({
          message: t("projectTranscriptDialog.messages.pendingSuccess"),
          severity: "success",
        }),
      );
      handleClose();
    } catch (error) {
      const fallbackMessage =
        mode === "upload"
          ? "Failed to upload transcript. Please try again."
          : mode === "import"
            ? "Failed to import recording. Please try again."
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
          {t("projectTranscriptDialog.title")}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t("projectTranscriptDialog.modeLabel")}
              </Typography>
              <Alert severity="info" sx={{ mb: 2 }}>
                Want to record a live meeting?{" "}
                <Typography
                  component="a"
                  href="/"
                  sx={{ color: "info.main", fontWeight: "bold", textDecoration: "underline" }}
                >
                  Download the Desktop App
                </Typography>{" "}
                to capture audio and generate transcripts in real-time.
              </Alert>
              <RadioGroup row value={mode} onChange={handleModeChange}>
                <FormControlLabel
                  value="upload"
                  control={<Radio />}
                  label={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <UploadFileIcon fontSize="small" />
                      <Typography>{t("projectTranscriptDialog.uploadLabel")}</Typography>
                    </Stack>
                  }
                />
                <FormControlLabel
                  value="manual"
                  control={<Radio />}
                  label={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <ArticleIcon fontSize="small" />
                      <Typography>{t("projectTranscriptDialog.manualLabel")}</Typography>
                    </Stack>
                  }
                />
                <FormControlLabel
                  value="import"
                  control={<Radio />}
                  label={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <MicIcon fontSize="small" />
                      <Typography>Import Recording</Typography>
                    </Stack>
                  }
                />
              </RadioGroup>
            </Box>

            <Box>
              <TextField
                label={t("projectTranscriptDialog.fields.objective")}
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                placeholder={t("projectTranscriptDialog.fields.objectivePlaceholder")}
                multiline
                minRows={2}
                fullWidth
              />
            </Box>

            <Divider />

            <Box>
              <FormControl fullWidth>
                <InputLabel id="english-level-select-label">
                  {t("chatContextDialog.complexityLevelLabel")}
                </InputLabel>
                <Select
                  labelId="english-level-select-label"
                  id="english-level-select"
                  value={complexityLevel}
                  label={t("chatContextDialog.complexityLevelLabel")}
                  onChange={(e) => setEnglishLevel(e.target.value)}
                >
                  <MenuItem value="Beginner">
                    {t("chatContextDialog.complexityLevels.Beginner")}
                  </MenuItem>
                  <MenuItem value="Intermediate">
                    {t("chatContextDialog.complexityLevels.Intermediate")}
                  </MenuItem>
                  <MenuItem value="Advanced">
                    {t("chatContextDialog.complexityLevels.Advanced")}
                  </MenuItem>
                  <MenuItem value="Native">
                    {t("chatContextDialog.complexityLevels.Native")}
                  </MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box>
              <FormControl fullWidth>
                <InputLabel id="meeting-type-label">
                  {t("projectTranscriptDialog.meetingType.label", "Meeting type")}
                </InputLabel>
                <Select
                  labelId="meeting-type-label"
                  id="meeting-type-select"
                  value={meetingType}
                  label={t("projectTranscriptDialog.meetingType.label", "Meeting type")}
                  onChange={(e) => handleMeetingTypeChange(e.target.value)}
                >
                  <MenuItem value="general">
                    {t("projectTranscriptDialog.meetingType.general", "General")}
                  </MenuItem>
                  <MenuItem value="briefing">
                    {t("projectTranscriptDialog.meetingType.briefing", "Briefing / Discovery")}
                  </MenuItem>
                  <MenuItem value="tasks">
                    {t("projectTranscriptDialog.meetingType.tasks", "Tasks / Standup")}
                  </MenuItem>
                  <MenuItem value="decision">
                    {t("projectTranscriptDialog.meetingType.decision", "Decision / Strategy")}
                  </MenuItem>
                  <MenuItem value="client">
                    {t("projectTranscriptDialog.meetingType.client", "Client")}
                  </MenuItem>
                </Select>
              </FormControl>
              <Stack sx={{ mt: 1 }}>
                <FormControlLabel
                  control={
                    <Switch checked={createDoc} onChange={(e) => setCreateDoc(e.target.checked)} />
                  }
                  label={t("projectTranscriptDialog.createDoc", "Generate a document")}
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={createSlides}
                      onChange={(e) => setCreateSlides(e.target.checked)}
                    />
                  }
                  label={t("projectTranscriptDialog.createSlides", "Generate a slide deck")}
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={confidential}
                      onChange={(e) => setConfidential(e.target.checked)}
                    />
                  }
                  label={t(
                    "projectTranscriptDialog.confidential",
                    "Confidential (exclude from the Project Digest)",
                  )}
                />
              </Stack>
            </Box>

            <Box>
              <FormControl fullWidth>
                <InputLabel id="persona-select-label">
                  {t("projectTranscriptDialog.personaLabel")}
                </InputLabel>
                <Select
                  labelId="persona-select-label"
                  id="persona-select"
                  value={persona}
                  label={t("projectTranscriptDialog.personaLabel")}
                  onChange={(e) =>
                    setPersona(
                      e.target.value as "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER",
                    )
                  }
                >
                  <MenuItem value="SECRETARY">
                    <Box>
                      <Typography variant="body1">
                        {t("projectTranscriptDialog.personas.SECRETARY.name")}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t("projectTranscriptDialog.personas.SECRETARY.description")}
                      </Typography>
                    </Box>
                  </MenuItem>
                  <MenuItem value="ARCHITECT">
                    <Box>
                      <Typography variant="body1">
                        {t("projectTranscriptDialog.personas.ARCHITECT.name")}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t("projectTranscriptDialog.personas.ARCHITECT.description")}
                      </Typography>
                    </Box>
                  </MenuItem>
                  <MenuItem value="PRODUCT_MANAGER">
                    <Box>
                      <Typography variant="body1">
                        {t("projectTranscriptDialog.personas.PRODUCT_MANAGER.name")}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t("projectTranscriptDialog.personas.PRODUCT_MANAGER.description")}
                      </Typography>
                    </Box>
                  </MenuItem>
                  <MenuItem value="DEVELOPER">
                    <Box>
                      <Typography variant="body1">
                        {t("projectTranscriptDialog.personas.DEVELOPER.name")}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t("projectTranscriptDialog.personas.DEVELOPER.description")}
                      </Typography>
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box>
              <AiModelSelector value={modelKey} onChange={setModelKey} disabled={isSubmitting} />
            </Box>

            <Box>
              <FormControl fullWidth>
                <InputLabel id="task-strategy-label">Agile Task Generation</InputLabel>
                <Select
                  labelId="task-strategy-label"
                  label="Agile Task Generation"
                  value={taskStrategy}
                  onChange={(e) =>
                    setTaskStrategy(e.target.value as "AUTO" | "SINGLE_TICKET" | "SPECIFIC_COUNT")
                  }
                >
                  <MenuItem value="AUTO">AI Slice & Dice (1 Epic + Auto Sub-tasks)</MenuItem>
                  <MenuItem value="SINGLE_TICKET">Force 1 Mega-Ticket</MenuItem>
                  <MenuItem value="SPECIFIC_COUNT">Specific fixed number of tasks</MenuItem>
                </Select>
              </FormControl>
              {taskStrategy === "SPECIFIC_COUNT" && (
                <TextField
                  fullWidth
                  sx={{ mt: 2 }}
                  label="Number of Tasks"
                  type="number"
                  value={taskCount}
                  onChange={(e) => setTaskCount(Math.max(1, parseInt(e.target.value) || 1))}
                  inputProps={{ min: 1, max: 20 }}
                />
              )}
            </Box>

            <Stack spacing={2}>
              <TextField
                label={t("projectTranscriptDialog.fields.title")}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                fullWidth
              />
              <TextField
                label={t("projectTranscriptDialog.fields.recordedAt")}
                type="datetime-local"
                value={recordedAt}
                onChange={(event) => setRecordedAt(event.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label={t("projectTranscriptDialog.fields.metadata")}
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
                    label={t("projectTranscriptDialog.fields.contexts")}
                    placeholder={
                      contextOptions.length > 0
                        ? t("projectTranscriptDialog.fields.contextsPlaceholder")
                        : t("projectTranscriptDialog.fields.noContexts")
                    }
                  />
                )}
                filterSelectedOptions
                disableCloseOnSelect
                fullWidth
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={agenticInvestigation}
                    onChange={(e) => setAgenticInvestigation(e.target.checked)}
                    color="primary"
                  />
                }
                label="Perform Agentic Codebase Investigation (Slower but gathers codebase context)"
              />
            </Stack>

            <Divider />

            {mode === "upload" ? (
              <Stack spacing={2}>
                <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                  {t("projectTranscriptDialog.buttons.selectFiles")}
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
                      {t("projectTranscriptDialog.messages.noFiles")}
                    </Typography>
                  ) : (
                    selectedFiles.map((file) => (
                      <Typography key={`${file.name}-${file.lastModified}`} variant="body2">
                        {file.name || `File (${file.type || "unknown"})`}
                      </Typography>
                    ))
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {t("projectTranscriptDialog.messages.formats")}
                  </Typography>
                </Stack>
              </Stack>
            ) : mode === "manual" ? (
              <TextField
                label={t("projectTranscriptDialog.fields.content")}
                value={manualContent}
                onChange={(event) => setManualContent(event.target.value)}
                multiline
                minRows={8}
                placeholder={t("projectTranscriptDialog.fields.contentPlaceholder")}
                fullWidth
              />
            ) : (
              <Autocomplete
                options={recordingOptions}
                loading={isRecordingsLoading}
                value={recordingOptions.find((r) => r.id === selectedRecordingId) || null}
                onChange={(_, newValue) => setSelectedRecordingId(newValue?.id || null)}
                getOptionLabel={(option) =>
                  `${option.title || "Untitled"} (${new Date(option.recordedAt || option.createdAt).toLocaleDateString()})`
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Select recording to import"
                    placeholder="Search past recordings..."
                  />
                )}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                fullWidth
              />
            )}

            {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={isSubmitting}>
            {t("projectTranscriptDialog.buttons.cancel")}
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting
              ? t("projectTranscriptDialog.buttons.saving")
              : t("projectTranscriptDialog.buttons.save")}
          </Button>
        </DialogActions>
      </form>
      <Dialog open={isSubmitting} disableEscapeKeyDown maxWidth="xs" fullWidth>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 4 }}
        >
          <CircularProgress size={60} thickness={4} sx={{ mb: 3 }} />
          <Typography variant="h6" gutterBottom align="center">
            {t("projectTranscriptDialog.messages.processing")}
          </Typography>
          <Typography variant="body2" color="text.secondary" align="center">
            {t("projectTranscriptDialog.messages.processingWait")}
          </Typography>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default ProjectTranscriptDialog;
