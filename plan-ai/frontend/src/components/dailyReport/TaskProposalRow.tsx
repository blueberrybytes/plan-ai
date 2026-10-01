import React, { useState } from "react";
import { Box, Chip, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import {
  Check as AcceptIcon,
  Close as RejectIcon,
  EditOutlined as EditIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { TaskUpdateKind, TaskUpdateProposal } from "../../store/apis/dailyReportApi";

const KIND_COLOR: Record<TaskUpdateKind, "success" | "info" | "warning" | "default"> = {
  COMPLETED: "success",
  DONE: "success",
  PROGRESS: "info",
  BLOCKED: "warning",
  NEW: "default",
};

export const isNewTask = (p: TaskUpdateProposal) => p.kind === "NEW" || p.kind === "DONE";

interface TaskProposalRowProps {
  proposal: TaskUpdateProposal;
  /** The title the member typed, for a new task. */
  title: string;
  busy: boolean;
  onTitleChange: (title: string) => void;
  onAccept: () => void;
  onReject: () => void;
}

/** One proposed change: what the AI read, with accept, edit and reject. */
const TaskProposalRow: React.FC<TaskProposalRowProps> = ({
  proposal,
  title,
  busy,
  onTitleChange,
  onAccept,
  onReject,
}) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const newTask = isNewTask(proposal);
  const project = proposal.projectTitle ?? t("dailyReport.proposals.defaultProject");

  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", py: 1.25 }}>
      <Chip
        size="small"
        color={KIND_COLOR[proposal.kind]}
        variant={proposal.kind === "NEW" ? "outlined" : "filled"}
        label={t(`dailyReport.kind.${proposal.kind}`)}
        sx={{ minWidth: 96, mt: 0.25 }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <TextField
            size="small"
            fullWidth
            autoFocus
            value={title}
            inputProps={{ maxLength: 200, "aria-label": t("dailyReport.proposals.edit") }}
            onChange={(event) => onTitleChange(event.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
        )}
        {proposal.detail && (
          <Typography variant="body2" color="text.secondary">
            {proposal.detail}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          {newTask ? t("dailyReport.proposals.newTaskProject", { project }) : project}
        </Typography>
      </Box>
      <Stack direction="row" spacing={0.5}>
        <Tooltip title={t("dailyReport.proposals.accept")}>
          <span>
            <IconButton
              size="small"
              color="success"
              aria-label={t("dailyReport.proposals.accept")}
              disabled={busy || !title.trim()}
              onClick={onAccept}
            >
              <AcceptIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        {newTask && !editing && (
          <Tooltip title={t("dailyReport.proposals.edit")}>
            <span>
              <IconButton
                size="small"
                aria-label={t("dailyReport.proposals.edit")}
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        <Tooltip title={t("dailyReport.proposals.reject")}>
          <span>
            <IconButton
              size="small"
              aria-label={t("dailyReport.proposals.reject")}
              disabled={busy}
              onClick={onReject}
            >
              <RejectIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Box>
  );
};

export default TaskProposalRow;
