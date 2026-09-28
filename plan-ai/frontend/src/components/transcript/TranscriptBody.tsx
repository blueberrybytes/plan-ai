/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useRef } from "react";
import { Box, Chip, Typography } from "@mui/material";
import BookmarkIcon from "@mui/icons-material/BookmarkBorder";
import { useTranslation } from "react-i18next";
import RecordingAudioPlayer, {
  channelOfUtterance,
  formatClock,
  type RecordingAudioPlayerHandle,
} from "./RecordingAudioPlayer";
import type { SpeakerInsight } from "./SpeakerInsightsTab";
import { parseSpeakerBlocks } from "./speakerBlocks";

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
  const { t } = useTranslation();
  const playerRef = useRef<RecordingAudioPlayerHandle>(null);
  const bookmarks: { atSeconds: number; note?: string }[] =
    (transcript?.metadata as { bookmarks?: { atSeconds: number; note?: string }[] } | null)
      ?.bookmarks ?? [];

  return (
    <>
      {/* Player and marked moments above the text, when the meeting has audio. */}
      {transcript?.id && (
        <RecordingAudioPlayer
          ref={playerRef}
          transcriptId={transcript.id}
          durationHint={transcript.durationSeconds}
          metadata={transcript.metadata}
        />
      )}
      {bookmarks.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t("recordingPlayer.bookmarks")}
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {bookmarks.map((b, i) => (
              <Chip
                key={i}
                icon={<BookmarkIcon />}
                label={`${formatClock(b.atSeconds)} · ${b.note || t("recordingPlayer.noNote")}`}
                onClick={() => playerRef.current?.seek(b.atSeconds, "mic")}
                variant="outlined"
                size="small"
              />
            ))}
          </Box>
        </Box>
      )}
      <TranscriptText transcript={transcript} playerRef={playerRef} />
    </>
  );
};

/** The transcript itself; a timestamp click plays that moment. */
const TranscriptText = ({
  transcript,
  playerRef,
}: {
  transcript: any;
  playerRef: React.RefObject<RecordingAudioPlayerHandle | null>;
}) => {
  const { t } = useTranslation();
  const principalSpeaker = (transcript?.metadata as any)?.principalSpeaker;

  const speakers: SpeakerInsight[] =
    (transcript?.metadata as { speakers?: SpeakerInsight[] } | null)?.speakers ?? [];
  const speakerByLabel = new Map(speakers.map((s) => [s.label, s]));

  const renderSpeaker = (rawLabel: string) => {
    const info = speakerByLabel.get(rawLabel);
    const isMe =
      info?.isPrincipalSpeaker ?? (principalSpeaker ? rawLabel === principalSpeaker : false);
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
                <Box
                  component="button"
                  type="button"
                  onClick={() => playerRef.current?.seek(u.start ?? 0, channelOfUtterance(u))}
                  title={t("recordingPlayer.jumpTo", { time: formatClock(u.start ?? 0) })}
                  sx={{
                    all: "unset",
                    cursor: "pointer",
                    fontVariantNumeric: "tabular-nums",
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  {formatTimestamp(u.start)}
                </Box>{" "}
                {node}
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

  // Fallback for transcripts without structured utterances (text-only saves,
  // recorder crash recoveries): one block per "Speaker: text" line.
  const rawText: string = transcript?.transcript || "No transcript content available.";
  const blocks = parseSpeakerBlocks(rawText);

  if (blocks) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {blocks.map((block, i) => {
          if (block.speaker) {
            const { isMe, node } = renderSpeaker(block.speaker);
            return (
              <Box key={i} sx={{ display: "flex", flexDirection: "column" }}>
                <Typography
                  variant="subtitle2"
                  color={isMe ? "primary.main" : "secondary.main"}
                  fontWeight="bold"
                >
                  {node}
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6, color: "text.primary" }}
                >
                  {block.text}
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
              {block.text}
            </Typography>
          );
        })}
      </Box>
    );
  }

  return (
    <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
      {rawText}
    </Typography>
  );
};

export default TranscriptBody;
