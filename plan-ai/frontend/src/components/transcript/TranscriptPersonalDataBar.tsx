import React, { useEffect, useState } from "react";
import { Box, FormControlLabel, Switch, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useGetTranscriptPersonalDataQuery } from "../../store/apis/transcriptApi";

const KINDS = ["EMAIL", "PHONE", "IBAN", "CARD", "NATIONAL_ID"] as const;

interface Props {
  transcriptId: string;
  /** True while a translation is on screen: the hidden text is of the original. */
  disabled: boolean;
  /** Called with the transcript lines to show, or null for the transcript as it is. */
  onChange: (hidden: { lines: string[] } | null) => void;
}

/**
 * Says what personal data the transcript holds and lets the reader hide it.
 * Renders nothing when none was found.
 */
const TranscriptPersonalDataBar = ({ transcriptId, disabled, onChange }: Props) => {
  const { t } = useTranslation();
  const { data } = useGetTranscriptPersonalDataQuery(transcriptId);
  const [hide, setHide] = useState(false);
  const found = data?.data;

  // The lines change when the transcript is edited or reprocessed.
  useEffect(() => {
    onChange(hide && found ? { lines: found.lines } : null);
  }, [hide, found, onChange]);

  if (!found || found.total === 0) return null;

  const list = KINDS.filter((kind) => found.counts[kind] > 0)
    .map((kind) => t(`transcriptPersonalData.${kind}`, { count: found.counts[kind] }))
    .join(", ");

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="body2">{t("transcriptPersonalData.found", { list })}</Typography>
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={hide && !disabled}
            disabled={disabled}
            onChange={(event) => setHide(event.target.checked)}
          />
        }
        label={
          <Typography variant="body2">
            {t(disabled ? "transcriptPersonalData.whileTranslated" : "transcriptPersonalData.hide")}
          </Typography>
        }
      />
      <Typography variant="caption" color="text.secondary" component="p">
        {t("transcriptPersonalData.note")}
      </Typography>
    </Box>
  );
};

export default TranscriptPersonalDataBar;
