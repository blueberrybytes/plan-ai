import React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  Paper,
} from "@mui/material";
import {
  ViewKanban as KanbanIcon,
  ViewQuilt as CanvasIcon,
  CalendarViewWeek as TimelineIcon,
  AccountTree as DiagramIcon,
} from "@mui/icons-material";
import { useDispatch, useSelector } from "react-redux";
import {
  setDefaultProjectView,
  DefaultProjectView,
} from "../../store/slices/preferences/preferencesSlice";
import { RootState } from "../../store/store";

interface ViewOption {
  value: DefaultProjectView;
  label: string;
  description: string;
  icon: React.ReactElement;
  forWho: string;
}

const VIEW_OPTIONS: ViewOption[] = [
  {
    value: "board",
    label: "Kanban Board",
    description: "Tasks organized in columns by status.",
    icon: <KanbanIcon sx={{ fontSize: 32 }} />,
    forWho: "Best for: developers & PMs",
  },
  {
    value: "canvas",
    label: "Canvas",
    description: "Cards grouped by due date — This Week, Next Week, Later.",
    icon: <CanvasIcon sx={{ fontSize: 32 }} />,
    forWho: "Best for: everyone",
  },
  {
    value: "timeline",
    label: "Timeline (Gantt)",
    description: "Tasks on a visual timeline with dates.",
    icon: <TimelineIcon sx={{ fontSize: 32 }} />,
    forWho: "Best for: project managers",
  },
  {
    value: "diagram",
    label: "Dependency Diagram",
    description: "See how tasks depend on each other.",
    icon: <DiagramIcon sx={{ fontSize: 32 }} />,
    forWho: "Best for: architects & leads",
  },
];

interface ProjectViewPreferenceDialogProps {
  open: boolean;
  onClose: () => void;
}

const ProjectViewPreferenceDialog: React.FC<ProjectViewPreferenceDialogProps> = ({
  open,
  onClose,
}) => {
  const dispatch = useDispatch();
  const currentDefault = useSelector((state: RootState) => state.preferences.defaultProjectView);

  const handleSelect = (view: DefaultProjectView) => {
    dispatch(setDefaultProjectView(view));
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        <Stack spacing={0.5}>
          <Typography variant="h6" fontWeight={700}>
            Default project view
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Choose how projects open by default. You can always switch views on the project page.
          </Typography>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          {VIEW_OPTIONS.map(({ value, label, description, icon, forWho }) => {
            const isSelected = currentDefault === value;
            return (
              <Paper
                key={value}
                onClick={() => handleSelect(value)}
                elevation={isSelected ? 3 : 1}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  cursor: "pointer",
                  border: "2px solid",
                  borderColor: isSelected ? "primary.main" : "transparent",
                  bgcolor: isSelected ? "primary.main" : "background.paper",
                  transition: "all 0.15s ease",
                  "&:hover": {
                    borderColor: "primary.main",
                    bgcolor: isSelected ? "primary.dark" : "action.hover",
                  },
                }}
              >
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box
                    sx={{
                      color: isSelected ? "primary.contrastText" : "primary.main",
                      flexShrink: 0,
                    }}
                  >
                    {icon}
                  </Box>
                  <Stack spacing={0.25} flex={1}>
                    <Typography
                      variant="subtitle1"
                      fontWeight={700}
                      color={isSelected ? "primary.contrastText" : "text.primary"}
                    >
                      {label}
                      {isSelected && (
                        <Typography
                          component="span"
                          variant="caption"
                          sx={{
                            ml: 1,
                            px: 0.75,
                            py: 0.25,
                            bgcolor: "rgba(255,255,255,0.25)",
                            borderRadius: 1,
                            fontWeight: 600,
                          }}
                        >
                          Current default
                        </Typography>
                      )}
                    </Typography>
                    <Typography
                      variant="body2"
                      color={isSelected ? "primary.contrastText" : "text.secondary"}
                      sx={{ opacity: isSelected ? 0.9 : 1 }}
                    >
                      {description}
                    </Typography>
                    <Typography
                      variant="caption"
                      color={isSelected ? "primary.contrastText" : "text.disabled"}
                      sx={{ opacity: 0.75 }}
                    >
                      {forWho}
                    </Typography>
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
          <Button onClick={onClose} variant="outlined">
            Close
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectViewPreferenceDialog;
