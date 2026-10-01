import React from "react";
import { MenuItem, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useGetWorkspaceMembersQuery } from "../../store/apis/workspaceApi";

const NOBODY = "";

interface TaskAssigneeSelectProps {
  value: string | null;
  onChange: (userId: string | null) => void;
  disabled?: boolean;
}

/** Picks the workspace member who owns a task. Pending invitations are left out. */
const TaskAssigneeSelect: React.FC<TaskAssigneeSelectProps> = ({ value, onChange, disabled }) => {
  const { t } = useTranslation();
  const { data } = useGetWorkspaceMembersQuery();
  const members = (data?.members ?? []).filter((m) => m.status === "ACTIVE" && m.userId);
  // Shown even before the members load, so the saved value is never lost.
  const known = value && members.some((m) => m.userId === value);

  return (
    <TextField
      select
      label={t("taskAssignee.label")}
      value={value ?? NOBODY}
      onChange={(event) => onChange(event.target.value || null)}
      disabled={disabled}
      SelectProps={{ displayEmpty: true }}
      InputLabelProps={{ shrink: true }}
    >
      <MenuItem value={NOBODY}>{t("taskAssignee.nobody")}</MenuItem>
      {value && !known && <MenuItem value={value}>{t("taskAssignee.unknown")}</MenuItem>}
      {members.map((m) => (
        <MenuItem key={m.userId} value={m.userId as string}>
          {m.name || m.email}
        </MenuItem>
      ))}
    </TextField>
  );
};

export default TaskAssigneeSelect;
