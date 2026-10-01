import React from "react";
import { Chip } from "@mui/material";
import { PersonOutline as PersonIcon } from "@mui/icons-material";
import { useGetWorkspaceMembersQuery } from "../../store/apis/workspaceApi";

/** The name of the member who owns a task. Nothing when nobody does. */
const TaskAssigneeChip: React.FC<{ assigneeId: string | null }> = ({ assigneeId }) => {
  const { data } = useGetWorkspaceMembersQuery(undefined, { skip: !assigneeId });
  if (!assigneeId) return null;
  const member = data?.members.find((m) => m.userId === assigneeId);
  if (!member) return null;
  return (
    <Chip
      icon={<PersonIcon />}
      label={member.name || member.email}
      size="small"
      variant="outlined"
      sx={{ height: 20, fontSize: "0.7rem", width: "fit-content", maxWidth: "100%" }}
    />
  );
};

export default TaskAssigneeChip;
