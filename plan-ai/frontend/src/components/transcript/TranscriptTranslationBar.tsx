import React, { useState } from "react";
import { Alert, Box, MenuItem, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  useTranslateTranscriptMutation,
  type TranscriptTranslation,
} from "../../store/apis/transcriptApi";
import { TRANSLATION_LANGUAGE_CODES, languageLabel } from "./transcriptTranslation";

const ORIGINAL = "original";

interface Props {
  transcriptId: string;
  /** Called with the translation to show, or null to go back to the original. */
  onChange: (translation: TranscriptTranslation | null) => void;
}

const errorKey = (error: unknown): string => {
  const e = error as { status?: number; data?: { message?: string } };
  if (e?.data?.message?.includes("MISSING_API_KEY")) return "transcriptTranslation.missingKey";
  if (e?.status === 413) return "transcriptTranslation.tooLong";
  return "transcriptTranslation.failed";
};

/** "Translate to" selector above a saved transcript. */
const TranscriptTranslationBar = ({ transcriptId, onChange }: Props) => {
  const { t, i18n } = useTranslation();
  const [language, setLanguage] = useState<string>(ORIGINAL);
  const [failure, setFailure] = useState<string | null>(null);
  const [translate, { isLoading }] = useTranslateTranscriptMutation();

  const handleChange = async (value: string) => {
    setLanguage(value);
    setFailure(null);
    if (value === ORIGINAL) {
      onChange(null);
      return;
    }
    try {
      const response = await translate({ id: transcriptId, body: { language: value } }).unwrap();
      onChange(response.data ?? null);
    } catch (error) {
      setFailure(errorKey(error));
      setLanguage(ORIGINAL);
      onChange(null);
    }
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <TextField
          select
          size="small"
          label={t("transcriptTranslation.label")}
          value={language}
          disabled={isLoading}
          onChange={(e) => void handleChange(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value={ORIGINAL}>{t("transcriptTranslation.original")}</MenuItem>
          {TRANSLATION_LANGUAGE_CODES.map((code) => (
            <MenuItem key={code} value={code}>
              {languageLabel(code, i18n.language)}
            </MenuItem>
          ))}
        </TextField>
        {isLoading && (
          <Typography variant="body2" color="text.secondary">
            {t("transcriptTranslation.loading")}
          </Typography>
        )}
      </Box>
      {failure && (
        <Alert severity="warning" onClose={() => setFailure(null)} sx={{ mt: 1 }}>
          {t(failure)}
        </Alert>
      )}
    </Box>
  );
};

export default TranscriptTranslationBar;
