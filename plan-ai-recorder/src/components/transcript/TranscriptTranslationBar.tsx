// Port of plan-ai/frontend/src/components/transcript/TranscriptTranslationBar.tsx.
import React, { useState } from "react";
import { Alert, Box, MenuItem, TextField, Typography } from "@mui/material";
import { useAuth } from "../../hooks/useAuth";
import type { TranscriptTranslation } from "../../services/planAiApi";
import { TRANSLATION_LANGUAGES } from "../../utils/liveTranslation";

const ORIGINAL = "original";

const failureText = (error: unknown): string => {
  const e = error as { status?: number; message?: string };
  if (e?.message?.includes("MISSING_API_KEY")) {
    return "The workspace needs an AI key configured to translate.";
  }
  if (e?.status === 413) return "This transcript is too long to translate in one go.";
  return "The translation could not be made. Try again.";
};

/**
 * "Translate to" selector above a saved meeting. The translation is only
 * shown on screen; the stored meeting is never replaced by it.
 */
const TranscriptTranslationBar: React.FC<{
  transcriptId: string;
  /** Called with the translation to show, or null to go back to the original. */
  onChange: (translation: TranscriptTranslation | null) => void;
}> = ({ transcriptId, onChange }) => {
  const { api } = useAuth();
  const [language, setLanguage] = useState<string>(ORIGINAL);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const handleChange = async (value: string) => {
    setLanguage(value);
    setFailure(null);
    if (value === ORIGINAL) {
      onChange(null);
      return;
    }
    setLoading(true);
    try {
      onChange(await api.translateTranscript(transcriptId, value));
    } catch (error) {
      setFailure(failureText(error));
      setLanguage(ORIGINAL);
      onChange(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <TextField
          select
          size="small"
          label="Translate to"
          value={language}
          disabled={loading}
          onChange={(e) => void handleChange(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value={ORIGINAL}>Original</MenuItem>
          {TRANSLATION_LANGUAGES.map((l) => (
            <MenuItem key={l.code} value={l.code}>
              {l.name}
            </MenuItem>
          ))}
        </TextField>
        {loading && (
          <Typography variant="body2" color="text.secondary">
            Translating. A long meeting can take up to a minute.
          </Typography>
        )}
      </Box>
      {failure && (
        <Alert severity="warning" onClose={() => setFailure(null)} sx={{ mt: 1 }}>
          {failure}
        </Alert>
      )}
    </Box>
  );
};

export default TranscriptTranslationBar;
