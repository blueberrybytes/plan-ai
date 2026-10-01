import React from "react";
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import type { TeamReportMember, TeamReportTask } from "../../store/apis/dailyReportApi";

const SHOWN = 5;

interface TaskListProps {
  label: string;
  color: string;
  tasks: TeamReportTask[];
  total: number;
  note: (task: TeamReportTask) => string | null;
}

const TaskList: React.FC<TaskListProps> = ({ label, color, tasks, total, note }) => {
  const { t } = useTranslation();
  if (tasks.length === 0) return null;
  const shown = tasks.slice(0, SHOWN);
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="caption" sx={{ fontWeight: 700, color }}>
        {label}
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {shown.map((task) => {
          const extra = note(task);
          return (
            <Typography component="li" variant="body2" key={task.id}>
              {task.title}
              {extra && (
                <Typography component="span" variant="body2" color="text.secondary">
                  {` · ${extra}`}
                </Typography>
              )}
            </Typography>
          );
        })}
        {total > shown.length && (
          <Typography component="li" variant="body2" color="text.secondary">
            {t("teamReport.more", { count: total - shown.length })}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

/** One member's week: counts, the AI sentence when asked for, and the tasks. */
const TeamMemberCard: React.FC<{ member: TeamReportMember }> = ({ member }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("es") ? es : enUS;
  const day = (iso: string | null) => (iso ? format(new Date(iso), "d MMM", { locale }) : null);

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {member.name}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap", rowGap: 1 }}>
        <Chip
          size="small"
          color="success"
          label={`${t("teamReport.closed")}: ${member.completedCount}`}
        />
        <Chip size="small" label={`${t("teamReport.inProgress")}: ${member.inProgressCount}`} />
        {member.blocked.length > 0 && (
          <Chip
            size="small"
            color="warning"
            label={`${t("teamReport.stuck")}: ${member.blocked.length}`}
          />
        )}
        {member.overdueCount > 0 && (
          <Chip
            size="small"
            color="error"
            label={`${t("teamReport.overdue")}: ${member.overdueCount}`}
          />
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {member.reportDays === null
          ? t("teamReport.notUsing")
          : t("teamReport.reportDays", { count: member.reportDays })}
      </Typography>
      {member.summary && (
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          {member.summary}
        </Typography>
      )}
      <TaskList
        label={t("teamReport.closed")}
        color="success.main"
        tasks={member.completed}
        total={member.completedCount}
        note={(task) => task.projectTitle}
      />
      <TaskList
        label={t("teamReport.stuck")}
        color="warning.main"
        tasks={member.blocked}
        total={member.blocked.length}
        note={(task) => task.reason}
      />
      <TaskList
        label={t("teamReport.overdue")}
        color="error.main"
        tasks={member.overdue}
        total={member.overdueCount}
        note={(task) => (task.date ? t("teamReport.due", { date: day(task.date) }) : null)}
      />
    </Paper>
  );
};

export default TeamMemberCard;
