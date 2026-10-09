import React from "react";
import { Box } from "@mui/material";
import type { RecordingAudioPlayerHandle } from "../transcript/RecordingAudioPlayer";
import CommentThread from "./CommentThread";

interface MeetingCommentsProps {
  transcriptId: string;
  playerRef: React.RefObject<RecordingAudioPlayerHandle | null>;
}

/**
 * The comments of a meeting, wired to its player: a comment can be pinned to
 * the moment being played, and the time on a comment plays from there.
 */
const MeetingComments: React.FC<MeetingCommentsProps> = ({ transcriptId, playerRef }) => (
  <Box
    sx={{ mb: 3, p: 2, border: 1, borderColor: "divider", borderRadius: 1 }}
    data-testid="meeting-comments"
  >
    <CommentThread
      key={transcriptId}
      target={{ transcriptId }}
      getCurrentTime={() => playerRef.current?.getCurrentTime() ?? null}
      // Comment times are on the player's own clock, like the bookmarks.
      onSeek={(seconds) => playerRef.current?.seek(seconds, "mic")}
    />
  </Box>
);

export default MeetingComments;
