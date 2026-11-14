import React, { useRef } from "react";
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Typography,
} from "@mui/material";
import { UploadFile as UploadFileIcon } from "@mui/icons-material";
import type { createPlanAiApi } from "../services/planAiApi";
import { IMPORT_ACCEPT, useAudioImport } from "../hooks/useAudioImport";

interface Props {
  api: ReturnType<typeof createPlanAiApi>;
  /** ASR language picked on Home ("" means auto-detect). */
  language: string;
  /** Project picked on Home ("" means none). */
  projectId: string;
  /** Refreshes the meetings list once the meeting exists. */
  onImported: () => void;
}

/** "Import audio file" button for Home, with its progress and errors. */
const AudioImportButton: React.FC<Props> = ({
  api,
  language,
  projectId,
  onImported,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { state, importFile, cancel, dismiss } = useAudioImport({
    api,
    language,
    projectId,
    onImported,
  });
  const busy = state.phase === "uploading" || state.phase === "saving";

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Cleared so the same file can be picked again after a failure.
    e.target.value = "";
    if (file) void importFile(file);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <input
        ref={inputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        hidden
        onChange={onPick}
      />

      {!busy && (
        <Button
          variant="outlined"
          startIcon={<UploadFileIcon />}
          onClick={() => inputRef.current?.click()}
          fullWidth
          sx={{ borderRadius: 2 }}
        >
          Import audio file
        </Button>
      )}

      {busy && (
        <Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
              mb: 0.5,
            }}
          >
            <Typography variant="caption" color="text.secondary" noWrap>
              {state.phase === "uploading"
                ? `Uploading ${state.fileName} (${Math.round(state.progress * 100)}%)`
                : `Saving ${state.fileName}...`}
            </Typography>
            {state.phase === "uploading" && (
              <Button size="small" onClick={cancel} sx={{ minWidth: 0 }}>
                Cancel
              </Button>
            )}
          </Box>
          <LinearProgress
            variant={state.phase === "uploading" ? "determinate" : "indeterminate"}
            value={state.phase === "uploading" ? state.progress * 100 : undefined}
          />
        </Box>
      )}

      {state.phase === "done" && (
        <Alert severity="success" onClose={dismiss}>
          {state.fileName} was uploaded. The summary and tasks will appear in
          the list when processing ends.
        </Alert>
      )}
      {state.phase === "error" && (
        <Alert severity="error" onClose={dismiss}>
          {state.message}
        </Alert>
      )}
    </Box>
  );
};

export default AudioImportButton;
