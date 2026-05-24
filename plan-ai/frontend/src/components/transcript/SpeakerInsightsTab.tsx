import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import { Person as PersonIcon, FormatQuote as QuoteIcon } from "@mui/icons-material";

export interface SpeakerInsight {
  label: string;
  identifiedName: string | null;
  role?: string | null;
  isPrincipalSpeaker: boolean;
  summary: string;
  keyQuotes?: string[];
  sentiment?: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "MIXED";
  speakingTimeSeconds: number;
  utteranceCount: number;
}

interface SpeakerInsightsTabProps {
  speakers?: SpeakerInsight[] | null;
  /** Used to colour-flag the speaker that owned the recording. */
  principalSpeakerLabel?: string | null;
}

const SENTIMENT_COLOR: Record<NonNullable<SpeakerInsight["sentiment"]>, "success" | "default" | "error" | "warning"> = {
  POSITIVE: "success",
  NEUTRAL: "default",
  NEGATIVE: "error",
  MIXED: "warning",
};

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
};

const initialsFor = (name: string | null, label: string): string => {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  // "Speaker 0" → "S0"
  const labelMatch = label.match(/(\D+)\s*(\d+)/);
  if (labelMatch) return `${labelMatch[1][0].toUpperCase()}${labelMatch[2]}`;
  return label.slice(0, 2).toUpperCase();
};

/**
 * Renders a card per speaker with inferred name, role, sentiment, key quotes,
 * speaking time, and utterance count. Shared by the project transcript
 * detail page, the standalone recording detail page, the recorder app, and
 * (via a thin wrapper) the mobile app.
 *
 * Designed to gracefully degrade: when the AI couldn't identify a name we
 * show the raw "Speaker N" label; when there are no utterances at all we
 * show a friendly empty state.
 */
const SpeakerInsightsTab: React.FC<SpeakerInsightsTabProps> = ({ speakers, principalSpeakerLabel }) => {
  if (!speakers || speakers.length === 0) {
    return (
      <Alert severity="info">
        No speaker breakdown available. This usually means the recording wasn&apos;t diarized
        (text-only transcript) or processing hasn&apos;t finished yet.
      </Alert>
    );
  }

  // Sort: principal speaker first, then by speaking time desc.
  const sorted = [...speakers].sort((a, b) => {
    if (a.isPrincipalSpeaker !== b.isPrincipalSpeaker) {
      return a.isPrincipalSpeaker ? -1 : 1;
    }
    return b.speakingTimeSeconds - a.speakingTimeSeconds;
  });

  return (
    <Stack spacing={2}>
      {sorted.map((s) => {
        const displayName = s.identifiedName || s.label;
        const isPrincipal = s.isPrincipalSpeaker || principalSpeakerLabel === s.label;
        return (
          <Card key={s.label} variant="outlined">
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <Avatar
                  sx={{
                    bgcolor: isPrincipal ? "primary.main" : "secondary.main",
                    width: 48,
                    height: 48,
                    fontWeight: 600,
                  }}
                >
                  {s.identifiedName ? initialsFor(s.identifiedName, s.label) : <PersonIcon />}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
                    <Typography variant="subtitle1" fontWeight={700}>
                      {displayName}
                    </Typography>
                    {!s.identifiedName && (
                      <Chip label="unidentified" size="small" variant="outlined" sx={{ fontSize: "0.65rem", height: 18 }} />
                    )}
                    {isPrincipal && (
                      <Chip label="You" size="small" color="primary" sx={{ fontSize: "0.65rem", height: 18 }} />
                    )}
                    {s.role && (
                      <Chip
                        label={s.role}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: "0.65rem", height: 18 }}
                      />
                    )}
                    {s.sentiment && (
                      <Chip
                        label={s.sentiment.toLowerCase()}
                        size="small"
                        color={SENTIMENT_COLOR[s.sentiment]}
                        variant="outlined"
                        sx={{ fontSize: "0.65rem", height: 18 }}
                      />
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                    {formatDuration(s.speakingTimeSeconds)} · {s.utteranceCount} utterance{s.utteranceCount === 1 ? "" : "s"}
                    {s.identifiedName ? null : ` · diarized label: ${s.label}`}
                  </Typography>
                  {s.summary && (
                    <Typography variant="body2" sx={{ lineHeight: 1.6, mb: s.keyQuotes?.length ? 1.5 : 0 }}>
                      {s.summary}
                    </Typography>
                  )}
                  {s.keyQuotes && s.keyQuotes.length > 0 && (
                    <Stack spacing={0.75}>
                      {s.keyQuotes.map((q, i) => (
                        <Box
                          key={i}
                          sx={{
                            display: "flex",
                            gap: 1,
                            alignItems: "flex-start",
                            pl: 1.5,
                            borderLeft: "3px solid",
                            borderColor: "divider",
                            color: "text.secondary",
                            fontStyle: "italic",
                            fontSize: "0.85rem",
                          }}
                        >
                          <QuoteIcon sx={{ fontSize: 14, mt: 0.4, opacity: 0.6, flexShrink: 0 }} />
                          <Typography variant="body2" sx={{ fontStyle: "italic" }}>
                            {q}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  )}
                </Box>
              </Stack>
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
};

export default SpeakerInsightsTab;
