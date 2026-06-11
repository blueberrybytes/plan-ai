import React, { useState } from "react";
import { Box, Collapse, Typography } from "@mui/material";
import {
  Psychology as PsychologyIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";

/**
 * Collapsible panel showing the AI's reasoning for WHY it extracted the tasks
 * it did from a meeting (persisted as `metadata.extractionReasoning` by the
 * transcript analysis). Collapsed by default — a transparency/trust feature,
 * not something that should shout over the actual tasks.
 */
const ExtractionReasoningPanel: React.FC<{ reasoning?: string | null }> = ({ reasoning }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!reasoning || !reasoning.trim()) return null;

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        bgcolor: "action.hover",
        overflow: "hidden",
      }}
    >
      <Box
        onClick={() => setOpen((o) => !o)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          px: 1.5,
          py: 0.75,
          cursor: "pointer",
        }}
      >
        <PsychologyIcon sx={{ fontSize: 18, color: "primary.main" }} />
        <Typography variant="body2" sx={{ fontWeight: 600, color: "text.secondary", flex: 1 }}>
          {t("projectTranscriptDetail.aiReasoning.title", {
            defaultValue: "Why these tasks — AI reasoning",
          })}
        </Typography>
        {open ? (
          <ExpandLessIcon sx={{ fontSize: 18, color: "text.secondary" }} />
        ) : (
          <ExpandMoreIcon sx={{ fontSize: 18, color: "text.secondary" }} />
        )}
      </Box>
      <Collapse in={open}>
        <Typography
          variant="body2"
          sx={{
            px: 1.5,
            pb: 1.5,
            whiteSpace: "pre-wrap",
            color: "text.secondary",
            lineHeight: 1.6,
          }}
        >
          {reasoning}
        </Typography>
      </Collapse>
    </Box>
  );
};

export default ExtractionReasoningPanel;
