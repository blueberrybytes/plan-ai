import React, { useState } from "react";
import { Box, Button, CircularProgress, Paper, Stack, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { ExtractResponse } from "../../store/apis/trackersApi";
import MissingKeyAlert from "./MissingKeyAlert";
import { useExtract } from "./useExtract";

const MAX_LENGTH = 2000;

interface QuickLogInputProps {
  onResult?: (result: ExtractResponse) => void;
}

/** "What did you eat or do?": the AI turns a line of text into proposals. */
const QuickLogInput: React.FC<QuickLogInputProps> = ({ onResult }) => {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const { run, isLoading, missingKey } = useExtract();

  const submit = async () => {
    const value = text.trim();
    if (!value || isLoading) return;
    const result = await run({ text: value });
    if (!result) return;
    setText("");
    onResult?.(result);
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Stack spacing={1.5}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            size="small"
            value={text}
            placeholder={t("trackers.quickLog.placeholder")}
            inputProps={{ maxLength: MAX_LENGTH, "aria-label": t("trackers.quickLog.placeholder") }}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <Button
            variant="contained"
            onClick={() => void submit()}
            disabled={!text.trim() || isLoading}
            startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ flexShrink: 0 }}
          >
            {t("trackers.quickLog.submit")}
          </Button>
        </Box>
        {missingKey && <MissingKeyAlert />}
      </Stack>
    </Paper>
  );
};

export default QuickLogInput;
