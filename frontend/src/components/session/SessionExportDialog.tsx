import React, { useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import type { TaskResponse } from "../../store/apis/sessionApi";

export type ExportFormat = "jira" | "csv" | "diagram" | "gantt";

interface SessionExportDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat) => void;
  tasks: TaskResponse[];
}

const formatSummary = (tasks: TaskResponse[]) => `${tasks.length} tasks ready for export`;

const SessionExportDialog: React.FC<SessionExportDialogProps> = ({
  open,
  onClose,
  onExport,
  tasks,
}) => {
  const summary = useMemo(() => formatSummary(tasks), [tasks]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Export session</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {summary}
          </Typography>
        </Stack>
        <List>
          <ListItemButton onClick={() => onExport("jira")}>
            <ListItemText
              primary="Jira-style JSON"
              secondary="Includes title, summary, acceptance criteria, priority, dependencies"
            />
          </ListItemButton>
          <ListItemButton onClick={() => onExport("csv")}>
            <ListItemText primary="CSV" secondary="Spreadsheet-friendly task export" />
          </ListItemButton>
          <ListItemButton onClick={() => onExport("diagram")}>
            <ListItemText
              primary="Diagram snapshot"
              secondary="Download the dependency diagram as an image"
            />
          </ListItemButton>
          <ListItemButton onClick={() => onExport("gantt")}>
            <ListItemText
              primary="Gantt snapshot"
              secondary="Download the timeline view as an image"
            />
          </ListItemButton>
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SessionExportDialog;
