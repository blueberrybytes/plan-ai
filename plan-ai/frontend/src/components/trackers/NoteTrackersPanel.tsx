import React from "react";
import { Stack } from "@mui/material";
import MissingKeyAlert from "./MissingKeyAlert";
import PendingProposals from "./PendingProposals";

interface NoteTrackersPanelProps {
  noteId: string;
  hideCalories: boolean;
  missingKey: boolean;
}

/** Below a note: the proposals read from it, waiting for review. */
const NoteTrackersPanel: React.FC<NoteTrackersPanelProps> = ({
  noteId,
  hideCalories,
  missingKey,
}) => (
  <Stack spacing={1.5} sx={{ mt: 2 }}>
    {missingKey && <MissingKeyAlert />}
    <PendingProposals noteId={noteId} hideCalories={hideCalories} />
  </Stack>
);

export default NoteTrackersPanel;
