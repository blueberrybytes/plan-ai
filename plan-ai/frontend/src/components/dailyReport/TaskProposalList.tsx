import React, { useState } from "react";
import { Box, Button, Divider, Paper, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  useReviewDailyReportProposalsMutation,
  type ReviewProposalItem,
  type TaskUpdateProposal,
} from "../../store/apis/dailyReportApi";
import TaskProposalRow, { isNewTask } from "./TaskProposalRow";
import { useDailyReportToast } from "./useDailyReportToast";

interface TaskProposalListProps {
  proposals: TaskUpdateProposal[];
}

/** Proposed changes waiting for the member. Nothing changes until accepted. */
const TaskProposalList: React.FC<TaskProposalListProps> = ({ proposals }) => {
  const { t } = useTranslation();
  const toast = useDailyReportToast();
  const [review] = useReviewDailyReportProposalsMutation();
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [busyIds, setBusyIds] = useState<string[]>([]);

  if (proposals.length === 0) return null;

  const titleOf = (p: TaskUpdateProposal) => titles[p.id] ?? p.title;

  const itemFor = (p: TaskUpdateProposal, status: ReviewProposalItem["status"]) => {
    const item: ReviewProposalItem = { id: p.id, status };
    if (status === "ACCEPTED" && isNewTask(p) && titleOf(p) !== p.title) {
      item.title = titleOf(p).trim();
    }
    return item;
  };

  const send = async (items: ReviewProposalItem[]) => {
    const ids = items.map((i) => i.id);
    setBusyIds((prev) => [...prev, ...ids]);
    try {
      const result = await review(items).unwrap();
      if (result.failed.length > 0) {
        toast.show(
          "info",
          t("dailyReport.proposals.failed", {
            count: result.failed.length,
            message: result.failed[0].message,
          }),
        );
      } else if (items.some((i) => i.status === "ACCEPTED")) {
        toast.show("success", t("dailyReport.proposals.done"));
      }
    } catch (error) {
      toast.error(error, "dailyReport.proposals.error", "dailyReport.review");
    } finally {
      setBusyIds((prev) => prev.filter((id) => !ids.includes(id)));
    }
  };

  const acceptAll = () =>
    void send(proposals.filter((p) => titleOf(p).trim()).map((p) => itemFor(p, "ACCEPTED")));

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {t("dailyReport.proposals.title", { count: proposals.length })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("dailyReport.proposals.hint")}
          </Typography>
        </Box>
        {proposals.length > 1 && (
          <Button
            size="small"
            variant="contained"
            onClick={acceptAll}
            disabled={busyIds.length > 0}
          >
            {t("dailyReport.proposals.acceptAll")}
          </Button>
        )}
      </Box>
      {proposals.map((p, index) => (
        <React.Fragment key={p.id}>
          {index > 0 && <Divider />}
          <TaskProposalRow
            proposal={p}
            title={titleOf(p)}
            busy={busyIds.includes(p.id)}
            onTitleChange={(title) => setTitles((prev) => ({ ...prev, [p.id]: title }))}
            onAccept={() => void send([itemFor(p, "ACCEPTED")])}
            onReject={() => void send([itemFor(p, "REJECTED")])}
          />
        </React.Fragment>
      ))}
    </Paper>
  );
};

export default TaskProposalList;
