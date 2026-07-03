/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { Box, Typography } from "@mui/material";
import type { SpeakerInsight } from "./SpeakerInsightsTab";

const formatTimestamp = (seconds?: number | null) => {
  if (seconds == null) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `[${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}]`;
};

/**
 * Renders a transcript body with speaker-attributed segments.
 *
 * Raw diarization emits opaque labels ("User 0", "Speaker 1"). We resolve them
 * to the AI-identified names via `metadata.speakers` (the same data shown on the
 * "Speakers" tab), keyed by the raw label — which matches each utterance's
 * `speaker` string exactly (the backend builds both from the same diarization).
 *
 * Shared by the project transcript detail page and the standalone recording
 * detail page. Falls back gracefully: structured `utterances` first, then a
 * "Label: text" parse of the flat transcript, then the raw text.
 */
const TranscriptBody = ({ transcript }: { transcript: any }) => {
  const principalSpeaker = (transcript?.metadata as any)?.principalSpeaker;

  const speakers: SpeakerInsight[] =
    (transcript?.metadata as { speakers?: SpeakerInsight[] } | null)?.speakers ?? [];
  const speakerByLabel = new Map(speakers.map((s) => [s.label, s]));

  const renderSpeaker = (rawLabel: string) => {
    const info = speakerByLabel.get(rawLabel);
    const isMe =
      info?.isPrincipalSpeaker ??
      (principalSpeaker ? rawLabel === principalSpeaker : false);
    const identified = info?.identifiedName?.trim() || null;
    const role = info?.role ?? null;
    // Prefer the identified name; for the principal speaker without a name show
    // "You"; otherwise fall back to the raw diarized label.
    const primary = identified || (isMe ? "You" : rawLabel);
    return {
      isMe,
      node: (
        <>
          {primary}
          {isMe && identified ? (
            <Box component="span" sx={{ fontWeight: 400, opacity: 0.7 }}>
              {" "}
              (You)
            </Box>
          ) : null}
          {role ? (
            <Box component="span" sx={{ fontWeight: 400, opacity: 0.7 }}>
              {" · "}
              {role}
            </Box>
          ) : null}
        </>
      ),
    };
  };

  if (
    transcript?.utterances &&
    Array.isArray(transcript.utterances) &&
    transcript.utterances.length > 0
  ) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {transcript.utterances.map((u: any, i: number) => {
          const { isMe, node } = renderSpeaker(u.speaker || "Unknown");
          return (
            <Box key={i} sx={{ display: "flex", flexDirection: "column" }}>
              <Typography
                variant="subtitle2"
                color={isMe ? "primary.main" : "secondary.main"}
                fontWeight="bold"
              >
                {formatTimestamp(u.start)} {node}
              </Typography>
              <Typography variant="body1" sx={{ lineHeight: 1.6, color: "text.primary" }}>
                {u.transcript}
              </Typography>
            </Box>
          );
        })}
      </Box>
    );
  }

  // Fallback for transcripts without structured utterances.
  const rawText = transcript?.transcript || "No transcript content available.";
  const parts = rawText.split("\n\n");

  if (parts.length > 0) {
    // Detect a "Speaker Name: Text" shape in the flat transcript.
    const hasLabels = parts.some((p: string) => /^([\w\s]+):\s*([\s\S]*)/i.test(p));

    if (hasLabels) {
      return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {parts.map((block: string, i: number) => {
            const match = block.match(/^([\w\s]+):\s*([\s\S]*)/i);
            if (match) {
              const speaker = match[1].trim();
              const text = match[2];
              const { isMe, node } = renderSpeaker(speaker);
              return (
                <Box key={i} sx={{ display: "flex", flexDirection: "column" }}>
                  <Typography
                    variant="subtitle2"
                    color={isMe ? "primary.main" : "secondary.main"}
                    fontWeight="bold"
                  >
                    {node}
                  </Typography>
                  <Typography variant="body1" sx={{ lineHeight: 1.6, color: "text.primary" }}>
                    {text}
                  </Typography>
                </Box>
              );
            }
            return (
              <Typography
                key={i}
                variant="body1"
                sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6, color: "text.primary" }}
              >
                {block}
              </Typography>
            );
          })}
        </Box>
      );
    }
  }

  return (
    <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
      {rawText}
    </Typography>
  );
};

export default TranscriptBody;
