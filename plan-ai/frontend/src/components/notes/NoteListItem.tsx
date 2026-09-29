import React from "react";
import { Box, ListItemButton, Tooltip, Typography } from "@mui/material";
import {
  EventNote as DailyIcon,
  Folder as ProjectIcon,
  Groups as SharedIcon,
  Mic as MeetingIcon,
  PushPin as PinnedIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { Note } from "../../store/apis/notesApi";
import { bodySnippet, noteHeading } from "./noteUtils";
import { useNoteLabels } from "./usePeriodLabel";

interface NoteListItemProps {
  note: Note;
  selected: boolean;
  dense?: boolean;
  onSelect: (note: Note) => void;
}

const Badge: React.FC<{ label: string; icon: React.ReactElement }> = ({ label, icon }) => (
  <Tooltip title={label}>
    <Box
      component="span"
      aria-label={label}
      sx={{ display: "inline-flex", color: "text.secondary" }}
    >
      {icon}
    </Box>
  </Tooltip>
);

const NoteListItem: React.FC<NoteListItemProps> = ({ note, selected, dense, onSelect }) => {
  const { t } = useTranslation();
  const { heading, updatedAgo } = useNoteLabels();
  // The snippet repeats nothing: skip it when the heading is the first line.
  const snippet = note.title?.trim() || !noteHeading(note) ? bodySnippet(note.body) : "";
  const iconSx = { fontSize: 14 };

  return (
    <ListItemButton
      selected={selected}
      onClick={() => onSelect(note)}
      sx={{
        display: "block",
        borderRadius: 1.5,
        py: dense ? 0.75 : 1,
        px: 1.5,
        mb: 0.25,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1, minWidth: 0 }}>
          {heading(note)}
        </Typography>
        {note.pinned && (
          <Badge label={t("notes.badges.pinned")} icon={<PinnedIcon sx={iconSx} />} />
        )}
        {note.visibility === "WORKSPACE" && (
          <Badge label={t("notes.badges.shared")} icon={<SharedIcon sx={iconSx} />} />
        )}
        {note.periodType && (
          <Badge label={t("notes.badges.daily")} icon={<DailyIcon sx={iconSx} />} />
        )}
        {note.projectId && (
          <Badge label={t("notes.badges.project")} icon={<ProjectIcon sx={iconSx} />} />
        )}
        {note.transcriptId && (
          <Badge label={t("notes.badges.meeting")} icon={<MeetingIcon sx={iconSx} />} />
        )}
      </Box>
      {snippet && !dense && (
        <Typography variant="caption" color="text.secondary" component="p" noWrap>
          {snippet}
        </Typography>
      )}
      <Typography variant="caption" color="text.disabled" component="p">
        {note.isMine ? updatedAgo(note) : t("notes.byMember", { when: updatedAgo(note) })}
      </Typography>
    </ListItemButton>
  );
};

export default NoteListItem;
