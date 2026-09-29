import React from "react";
import { MenuItem, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useListProjectsQuery } from "../../store/apis/projectApi";

interface NoteProjectSelectProps {
  projectId: string | null;
  disabled?: boolean;
  onChange: (projectId: string | null) => void;
}

/** Links the note to one of the workspace projects, or to none. */
const NoteProjectSelect: React.FC<NoteProjectSelectProps> = ({ projectId, disabled, onChange }) => {
  const { t } = useTranslation();
  const { data, isLoading } = useListProjectsQuery(undefined);
  const projects = data?.data?.projects ?? [];
  // Keep the current value selectable while the list loads.
  const known = !projectId || projects.some((p) => p.id === projectId);

  return (
    <TextField
      select
      size="small"
      label={t("notes.actions.project")}
      value={projectId ?? ""}
      disabled={disabled || isLoading}
      onChange={(event) => onChange(event.target.value || null)}
      sx={{ minWidth: 160, maxWidth: 240 }}
      SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 360 } } } }}
    >
      <MenuItem value="">
        <em>{t("notes.actions.noProject")}</em>
      </MenuItem>
      {!known && projectId && (
        <MenuItem value={projectId}>{t("notes.actions.linkedProject")}</MenuItem>
      )}
      {projects.map((project) => (
        <MenuItem key={project.id} value={project.id}>
          {project.title}
        </MenuItem>
      ))}
    </TextField>
  );
};

export default NoteProjectSelect;
