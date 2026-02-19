import React, { useCallback, useMemo, useRef, useState } from "react";
import { useParams, Navigate, Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Home as HomeIcon,
  Refresh as RefreshIcon,
  InfoOutlined,
  AddCircleOutline,
  FileDownloadOutlined,
  AddTask,
} from "@mui/icons-material";
import SidebarLayout from "../components/layout/SidebarLayout";
import {
  useGetSessionQuery,
  useListSessionTasksQuery,
  useDeleteSessionTaskMutation,
} from "../store/apis/sessionApi";
import { useDispatch } from "react-redux";
import { setToastMessage } from "../store/slices/app/appSlice";
import { useTranslation } from "react-i18next";
import SessionTaskFormDialog from "../components/session/SessionTaskFormDialog";
import SessionTaskBoard from "../components/session/SessionTaskBoard";
import SessionTaskDependencyDiagram from "../components/session/SessionTaskDependencyDiagram";
import SessionTaskGantt from "../components/session/SessionTaskGantt";
import SessionExportDialog, { type ExportFormat } from "../components/session/SessionExportDialog";
import SessionTranscriptDialog from "../components/session/SessionTranscriptDialog";
import SessionTaskDialog from "../components/session/SessionTaskDialog";
import { toPng } from "html-to-image";
import type { TaskResponse } from "../store/apis/sessionApi";
import ConfirmDeletionDialog from "../components/dialogs/ConfirmDeletionDialog";

const SessionDetails: React.FC = () => {
  const params = useParams();
  const sessionId = params.sessionId ?? null;
  const dispatch = useDispatch();
  const { t } = useTranslation();

  const { data, isLoading, isFetching, error, refetch } = useGetSessionQuery(sessionId ?? "", {
    skip: !sessionId,
  });

  const {
    data: tasksData,
    isLoading: isTasksLoading,
    isFetching: isTasksFetching,
    error: tasksError,
    refetch: refetchTasks,
  } = useListSessionTasksQuery(
    { sessionId: sessionId ?? "", params: undefined },
    { skip: !sessionId },
  );

  const [activeTab, setActiveTab] = useState<"board" | "diagram" | "timeline">("board");
  const [isTranscriptDialogOpen, setIsTranscriptDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskResponse | null>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [taskFormMode, setTaskFormMode] = useState<"create" | "edit">("create");
  const [taskForForm, setTaskForForm] = useState<TaskResponse | null>(null);
  const diagramRef = useRef<HTMLDivElement | null>(null);
  const ganttRef = useRef<HTMLDivElement | null>(null);
  const [isDeleteTaskConfirmOpen, setIsDeleteTaskConfirmOpen] = useState(false);
  const [taskPendingDeletion, setTaskPendingDeletion] = useState<TaskResponse | null>(null);

  const session = data?.data;
  const tasks = useMemo(() => tasksData?.data?.tasks ?? [], [tasksData]);
  const exportableTasks = useMemo(() => tasks, [tasks]);
  const [deleteSessionTask, { isLoading: isDeletingTask }] = useDeleteSessionTaskMutation();

  const ensuredSessionId = sessionId as string;
  const buildJiraPayload = useCallback(() => {
    return exportableTasks.map((task) => ({
      id: task.id,
      title: task.title,
      summary: task.summary,
      description: task.description,
      acceptanceCriteria: task.acceptanceCriteria,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      dependencies: task.dependencies ?? [],
    }));
  }, [exportableTasks]);

  const buildCsv = useCallback(() => {
    const header = [
      "ID",
      "Title",
      "Summary",
      "Description",
      "Acceptance Criteria",
      "Status",
      "Priority",
      "Due Date",
      "Created At",
      "Updated At",
      "Dependencies",
    ];

    const rows = exportableTasks.map((task) => [
      task.id,
      task.title,
      task.summary ?? "",
      task.description ?? "",
      task.acceptanceCriteria ?? "",
      task.status,
      task.priority,
      task.dueDate ?? "",
      task.createdAt,
      task.updatedAt,
      (task.dependencies ?? []).join(";"),
    ]);

    const formatCsvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

    return [header, ...rows]
      .map((row) => row.map((cell) => formatCsvCell(String(cell ?? ""))).join(","))
      .join("\n");
  }, [exportableTasks]);

  const triggerDownload = useCallback((content: Blob | string, filename: string) => {
    const url = typeof content === "string" ? content : URL.createObjectURL(content);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (typeof content !== "string") {
      URL.revokeObjectURL(url);
    }
  }, []);

  const captureNodeAsPng = useCallback(
    async (node: HTMLElement | null, filename: string) => {
      if (!node) {
        throw new Error("Element not available for capture");
      }
      const dataUrl = await toPng(node, {
        cacheBust: true,
        backgroundColor: "white",
      });
      triggerDownload(dataUrl, filename);
    },
    [triggerDownload],
  );

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      try {
        if (format === "jira") {
          const payload = buildJiraPayload();
          const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
          });
          triggerDownload(blob, "tasks-jira.json");
        } else if (format === "csv") {
          const csv = buildCsv();
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
          triggerDownload(blob, "tasks.csv");
        } else if (format === "diagram") {
          await captureNodeAsPng(diagramRef.current, "tasks-diagram.png");
        } else if (format === "gantt") {
          await captureNodeAsPng(ganttRef.current, "tasks-gantt.png");
        }
      } catch (error) {
        console.error("Export failed", error);
      } finally {
        setIsExportDialogOpen(false);
      }
    },
    [buildCsv, buildJiraPayload, captureNodeAsPng, triggerDownload],
  );

  const tasksErrorMessage = (() => {
    if (!tasksError) {
      return null;
    }

    if ("status" in tasksError) {
      if (typeof tasksError.data === "string") {
        return tasksError.data;
      }
      if (
        typeof tasksError.data === "object" &&
        tasksError.data !== null &&
        "message" in tasksError.data &&
        typeof (tasksError.data as { message?: string }).message === "string"
      ) {
        return (tasksError.data as { message?: string }).message;
      }
      return typeof tasksError.status === "number"
        ? t("sessionDetails.messages.tasksErrorStatus", { status: tasksError.status })
        : t("sessionDetails.messages.tasksErrorFallback");
    }

    return (
      (tasksError as { message?: string }).message ??
      t("sessionDetails.messages.tasksErrorFallback")
    );
  })();

  const errorMessage = (() => {
    if (!error) {
      return null;
    }

    if ("status" in error) {
      const statusLabel = typeof error.status === "number" ? `Error ${error.status}` : "Error";

      if (typeof error.data === "string") {
        return error.data;
      }

      if (typeof error.data === "object" && error.data !== null && "message" in error.data) {
        const message = (error.data as { message?: string }).message;
        if (typeof message === "string" && message.trim().length > 0) {
          return message;
        }
      }

      return statusLabel;
    }

    return (error as { message?: string }).message ?? t("sessionDetails.messages.unexpectedError");
  })();

  const handleOpenCreateTask = () => {
    setTaskFormMode("create");
    setTaskForForm(null);
    setIsTaskFormOpen(true);
  };

  const handleTaskFormClose = () => {
    setIsTaskFormOpen(false);
    setTaskForForm(null);
  };

  const handleTaskFormSuccess = (savedTask: TaskResponse) => {
    setIsTaskFormOpen(false);
    setTaskForForm(null);
    setSelectedTask(savedTask);
    refetchTasks();
  };

  const handleDeleteTask = async (task: TaskResponse) => {
    setTaskPendingDeletion(task);
    setIsDeleteTaskConfirmOpen(true);
  };

  const executeTaskDeletion = async () => {
    if (!taskPendingDeletion) {
      return;
    }

    try {
      await deleteSessionTask({
        sessionId: ensuredSessionId,
        taskId: taskPendingDeletion.id,
      }).unwrap();
      dispatch(
        setToastMessage({
          severity: "success",
          message: t("sessionDetails.messages.deleteSuccess"),
        }),
      );
      setSelectedTask(null);
      refetchTasks();
    } catch (mutationError) {
      console.error("Failed to delete task", mutationError);
      dispatch(
        setToastMessage({
          severity: "error",
          message: t("sessionDetails.messages.deleteError"),
        }),
      );
    } finally {
      setIsDeleteTaskConfirmOpen(false);
      setTaskPendingDeletion(null);
    }
  };

  if (!sessionId) {
    return <Navigate to="/sessions" replace />;
  }

  return (
    <SidebarLayout>
      <Box
        sx={{
          p: { xs: 3, md: 6 },
          bgcolor: "background.default",
          minHeight: "100vh",
        }}
      >
        <Stack spacing={3}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack spacing={1}>
              <Breadcrumbs aria-label={t("sessionDetails.breadcrumbs.aria")}>
                <Button
                  component={RouterLink}
                  to="/home"
                  color="inherit"
                  startIcon={<HomeIcon fontSize="small" />}
                  sx={{ textTransform: "none" }}
                >
                  {t("sessionDetails.breadcrumbs.home")}
                </Button>
                <Button
                  component={RouterLink}
                  to="/sessions"
                  color="inherit"
                  sx={{ textTransform: "none" }}
                >
                  {t("sessionDetails.breadcrumbs.sessions")}
                </Button>
                <Typography color="text.primary">
                  {session?.title ?? t("sessionDetails.breadcrumbs.fallback")}
                </Typography>
              </Breadcrumbs>

              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {session?.title ?? t("sessionDetails.breadcrumbs.fallback")}
              </Typography>
              <Typography variant="subtitle1" color="text.secondary">
                {t("sessionDetails.subtitle")}
              </Typography>
            </Stack>

            <Tooltip title={t("sessionDetails.buttons.refresh")}>
              <span>
                <IconButton onClick={() => refetch()} disabled={isFetching} size="small">
                  <RefreshIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>

          <Box
            sx={{
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              bgcolor: "background.paper",
              px: { xs: 2, md: 3 },
              py: { xs: 1.5, md: 2 },
            }}
          >
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={{ xs: 1.5, sm: 2 }}
              alignItems={{ xs: "flex-start", sm: "center" }}
              justifyContent="space-between"
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {t("sessionDetails.sections.actions")}
              </Typography>
              <Stack direction="row" spacing={1.5} flexWrap="wrap">
                <Button
                  component={RouterLink}
                  to={`/sessions/${sessionId}/info`}
                  variant="contained"
                  startIcon={<InfoOutlined />}
                >
                  {t("sessionDetails.buttons.moreInfo")}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<AddCircleOutline />}
                  onClick={() => setIsTranscriptDialogOpen(true)}
                >
                  {t("sessionDetails.buttons.addTranscript")}
                </Button>
                <Button
                  variant="outlined"
                  color="secondary"
                  startIcon={<FileDownloadOutlined />}
                  onClick={() => setIsExportDialogOpen(true)}
                >
                  {t("sessionDetails.buttons.export")}
                </Button>
              </Stack>
            </Stack>
          </Box>

          {isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
              <CircularProgress />
            </Box>
          ) : errorMessage ? (
            <Alert severity="error">{errorMessage}</Alert>
          ) : session ? (
            <Stack spacing={3}>
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={2}>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={2}
                      alignItems={{ xs: "flex-start", md: "center" }}
                      justifyContent="space-between"
                    >
                      <Stack spacing={0.5}>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>
                          {t("sessionDetails.sections.tasksOverviewTitle")}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {t("sessionDetails.sections.tasksOverviewDescription")}
                        </Typography>
                      </Stack>

                      <Stack direction="row" spacing={1}>
                        <Tooltip title={t("sessionDetails.buttons.refreshTasks")}>
                          <span>
                            <IconButton
                              onClick={() => refetchTasks()}
                              disabled={isTasksFetching}
                              size="small"
                            >
                              <RefreshIcon />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Button
                          variant="contained"
                          startIcon={<AddTask />}
                          onClick={handleOpenCreateTask}
                        >
                          {t("sessionDetails.buttons.createTask")}
                        </Button>
                      </Stack>
                    </Stack>

                    <Divider />

                    <Tabs
                      value={activeTab}
                      onChange={(_, value: "board" | "diagram" | "timeline") => setActiveTab(value)}
                      aria-label={t("sessionDetails.tabs.aria")}
                    >
                      <Tab label={t("sessionDetails.tabs.board")} value="board" />
                      <Tab label={t("sessionDetails.tabs.diagram")} value="diagram" />
                      <Tab label={t("sessionDetails.tabs.timeline")} value="timeline" />
                    </Tabs>

                    {isTasksLoading ? (
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "center",
                          py: 6,
                        }}
                      >
                        <CircularProgress />
                      </Box>
                    ) : tasksErrorMessage ? (
                      <Alert severity="error">{tasksErrorMessage}</Alert>
                    ) : tasks.length === 0 ? (
                      <Alert
                        severity="info"
                        action={
                          <Button color="primary" size="small" onClick={handleOpenCreateTask}>
                            {t("sessionDetails.buttons.createTask")}
                          </Button>
                        }
                      >
                        {t("sessionDetails.messages.noTasks")}
                      </Alert>
                    ) : activeTab === "board" ? (
                      <SessionTaskBoard
                        tasks={tasks}
                        onTaskClick={(task) => setSelectedTask(task)}
                      />
                    ) : activeTab === "diagram" ? (
                      <div ref={diagramRef}>
                        <SessionTaskDependencyDiagram
                          tasks={tasks}
                          onTaskClick={(task) => setSelectedTask(task)}
                        />
                      </div>
                    ) : (
                      <div ref={ganttRef}>
                        <SessionTaskGantt
                          tasks={tasks}
                          onTaskClick={(task) => setSelectedTask(task)}
                        />
                      </div>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          ) : (
            <Alert severity="warning">{t("sessionDetails.messages.sessionNotFound")}</Alert>
          )}
        </Stack>
      </Box>
      <SessionTranscriptDialog
        open={isTranscriptDialogOpen}
        onClose={() => setIsTranscriptDialogOpen(false)}
        sessionId={ensuredSessionId}
      />
      <SessionTaskDialog
        open={Boolean(selectedTask)}
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onEdit={(task) => {
          setTaskFormMode("edit");
          setTaskForForm(task);
          setIsTaskFormOpen(true);
        }}
        onDelete={(task) => handleDeleteTask(task)}
        isDeleting={isDeletingTask && Boolean(taskPendingDeletion)}
      />
      <ConfirmDeletionDialog
        open={isDeleteTaskConfirmOpen}
        onCancel={() => {
          if (!isDeletingTask) {
            setIsDeleteTaskConfirmOpen(false);
            setTaskPendingDeletion(null);
          }
        }}
        onConfirm={executeTaskDeletion}
        isProcessing={isDeletingTask}
        title={t("sessionDetails.dialogs.deleteTask.title")}
        entityName={
          taskPendingDeletion?.title ?? t("sessionDetails.dialogs.deleteTask.entityFallback")
        }
        description={t("sessionDetails.dialogs.deleteTask.description")}
        additionalWarning={t("sessionDetails.dialogs.deleteTask.additionalWarning")}
        confirmLabel={t("sessionDetails.dialogs.deleteTask.confirm")}
      />
      <SessionExportDialog
        open={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        onExport={async (format) => {
          await handleExport(format);
        }}
        tasks={tasks}
      />
      <SessionTaskFormDialog
        open={isTaskFormOpen}
        mode={taskFormMode}
        sessionId={ensuredSessionId}
        tasks={tasks}
        task={taskFormMode === "edit" ? taskForForm : null}
        onClose={handleTaskFormClose}
        onSuccess={handleTaskFormSuccess}
      />
    </SidebarLayout>
  );
};

export default SessionDetails;
