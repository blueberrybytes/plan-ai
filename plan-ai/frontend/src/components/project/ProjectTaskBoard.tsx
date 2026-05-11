/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Divider,
  Stack,
  Typography,
  Chip,
  Tooltip,
  CircularProgress,
} from "@mui/material";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDispatch } from "react-redux";
import {
  type TaskResponse,
  type TaskStatusSchema,
  type TaskPrioritySchema,
  useUpdateProjectTaskMutation,
} from "../../store/apis/projectApi";
import { setToastMessage } from "../../store/slices/app/appSlice";
import MarkdownRenderer from "../common/MarkdownRenderer";
import { useSyncTaskMutation } from "../../store/apis/taskApi";
import SyncIcon from "@mui/icons-material/Sync";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import type { components } from "../../types/api";
import { useListIntegrationsQuery } from "../../store/apis/integrationApi";

type TaskMetadata = components["schemas"]["TaskMetadata"];

interface TaskBoardColumn {
  status: TaskStatusSchema;
  title: string;
  description: string;
}

const COLUMNS: TaskBoardColumn[] = [
  {
    status: "BACKLOG",
    title: "Backlog",
    description: "Ideas and work waiting to be picked up",
  },
  {
    status: "IN_PROGRESS",
    title: "In Progress",
    description: "Work currently underway",
  },
  {
    status: "BLOCKED",
    title: "Blocked",
    description: "Tasks waiting on external actions",
  },
  {
    status: "COMPLETED",
    title: "Completed",
    description: "Finished work ready for review",
  },
  {
    status: "ARCHIVED",
    title: "Archived",
    description: "Tasks no longer active",
  },
];

export interface ProjectTaskBoardProps {
  tasks: TaskResponse[];
  onTaskClick?: (task: TaskResponse) => void;
}

const priorityColorMap: Record<TaskPrioritySchema, "default" | "primary" | "warning" | "error"> = {
  LOW: "default",
  MEDIUM: "primary",
  HIGH: "warning",
  URGENT: "error",
};

const COLUMN_STATUSES = COLUMNS.map((column) => column.status);

type ColumnTaskIds = Record<TaskStatusSchema, string[]>;

interface BoardState {
  columns: ColumnTaskIds;
}

const buildColumnTaskIds = (taskList: TaskResponse[]): ColumnTaskIds => {
  return COLUMNS.reduce<ColumnTaskIds>((acc, column) => {
    acc[column.status] = taskList
      .filter((task) => task.status === column.status)
      .map((task) => task.id);
    return acc;
  }, {} as ColumnTaskIds);
};

const findColumnForTask = (
  columns: ColumnTaskIds,
  taskId: string,
): TaskStatusSchema | undefined => {
  const entry = Object.entries(columns).find(([, taskIds]) => taskIds.includes(taskId));
  return entry ? (entry[0] as TaskStatusSchema) : undefined;
};

const DroppableColumn: React.FC<{
  column: TaskBoardColumn;
  tasks: TaskResponse[];
  children: React.ReactNode;
}> = ({ column, tasks, children }) => {
  const { setNodeRef } = useDroppable({
    id: column.status,
    data: { type: "column", status: column.status },
  });

  return (
    <Card
      ref={setNodeRef}
      key={column.status}
      variant="outlined"
      sx={{
        flex: 1,
        minWidth: { xs: 260, sm: 280, xl: 240 },
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <CardContent
        sx={{ flex: 1, display: "flex", flexDirection: "column", p: 2, pb: "16px !important" }}
      >
        <Stack spacing={2} sx={{ height: "100%" }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {column.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {column.description}
            </Typography>
          </Box>
          <Divider />
          <Box sx={{ flex: 1, overflowY: "auto", minHeight: { xs: 200, md: 50 }, pr: 1, mr: -1 }}>
            {tasks.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No tasks yet.
              </Typography>
            ) : (
              <Stack spacing={2}>{children}</Stack>
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};

const DraggableTaskCard: React.FC<{
  task: TaskResponse;
  onClick?: (task: TaskResponse) => void;
}> = ({ task, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    cursor: "grab",
  } as const;

  const [syncTask, { isLoading: isSyncing }] = useSyncTaskMutation();
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const { data: integrationsResponse } = useListIntegrationsQuery();
  const dispatch = useDispatch();

  const integrations = integrationsResponse?.data || [];
  const hasJira = integrations.some((i) => i.provider === "JIRA" && i.status === "CONNECTED");
  const hasLinear = integrations.some((i) => i.provider === "LINEAR" && i.status === "CONNECTED");
  const hasTrello = integrations.some((i) => i.provider === "TRELLO" && i.status === "CONNECTED");

  const handleSyncClick = async (e: React.MouseEvent, provider: "jira" | "linear" | "trello") => {
    e.stopPropagation();
    try {
      setSyncingProvider(provider);
      await syncTask({ taskId: task.id, provider, body: {} }).unwrap();
      dispatch(setToastMessage({ severity: "success", message: `Task pushed to ${provider}!` }));
    } catch (err: any) {
      dispatch(
        setToastMessage({
          severity: "error",
          message: `Failed to push to ${provider}: ${err?.data?.message || err.message}`,
        }),
      );
    } finally {
      setSyncingProvider(null);
    }
  };

  const metadata = task.metadata as TaskMetadata | null;
  const jiraMeta = metadata?.jira;
  const linearMeta = metadata?.linear;
  const trelloMeta = metadata?.trello;

  const handleExternalLink = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Card
      ref={setNodeRef}
      variant="outlined"
      sx={{ borderRadius: 2, boxShadow: isDragging ? 6 : undefined }}
      style={style}
      onClick={() => onClick?.(task)}
      {...attributes}
      {...listeners}
    >
      <CardContent>
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {task.title}
            </Typography>
            <Chip label={task.priority} size="small" color={priorityColorMap[task.priority]} />
          </Stack>

          {task.summary ? (
            <MarkdownRenderer
              content={task.summary}
              sx={{
                display: "-webkit-box",
                WebkitLineClamp: 1,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                "& p": { variant: "body2", color: "text.secondary", m: 0 },
              }}
            />
          ) : null}

          {task.dependencies?.length ? (
            <Tooltip title="Number of blocking tasks">
              <Chip
                label={`${task.dependencies.length} blocked`}
                size="small"
                variant="outlined"
                sx={{ height: 20, fontSize: "0.7rem", width: "fit-content" }}
              />
            </Tooltip>
          ) : null}

          {/* Sync Provider Toggles */}
          <Divider sx={{ my: 0.5 }} />
          <Stack direction="row" spacing={1} pt={0.5}>
            {jiraMeta ? (
              <Chip
                icon={<OpenInNewIcon sx={{ fontSize: "1rem" }} />}
                label={jiraMeta.issueKey}
                size="small"
                color="primary"
                variant="filled"
                onClick={(e) => handleExternalLink(e, jiraMeta.url)}
                sx={{ cursor: "pointer", fontWeight: 600, height: 24 }}
              />
            ) : hasJira ? (
              <Chip
                icon={
                  isSyncing && syncingProvider === "jira" ? (
                    <CircularProgress size={12} color="inherit" />
                  ) : (
                    <SyncIcon sx={{ fontSize: "1rem" }} />
                  )
                }
                label="Jira"
                size="small"
                variant="outlined"
                onClick={(e) => handleSyncClick(e, "jira")}
                sx={{ cursor: "pointer", opacity: 0.6, "&:hover": { opacity: 1 }, height: 24 }}
              />
            ) : null}

            {linearMeta ? (
              <Chip
                icon={<OpenInNewIcon sx={{ fontSize: "1rem" }} />}
                label={linearMeta.identifier}
                size="small"
                style={{ backgroundColor: "#5E6AD2", color: "white" }}
                variant="filled"
                onClick={(e) => handleExternalLink(e, linearMeta.url)}
                sx={{ cursor: "pointer", fontWeight: 600, height: 24 }}
              />
            ) : hasLinear ? (
              <Chip
                icon={
                  isSyncing && syncingProvider === "linear" ? (
                    <CircularProgress size={12} color="inherit" />
                  ) : (
                    <SyncIcon sx={{ fontSize: "1rem" }} />
                  )
                }
                label="Linear"
                size="small"
                variant="outlined"
                onClick={(e) => handleSyncClick(e, "linear")}
                sx={{ cursor: "pointer", opacity: 0.6, "&:hover": { opacity: 1 }, height: 24 }}
              />
            ) : null}

            {trelloMeta ? (
              <Chip
                icon={<OpenInNewIcon sx={{ fontSize: "1rem" }} />}
                label={trelloMeta.shortLink}
                size="small"
                style={{ backgroundColor: "#0079BF", color: "white" }}
                variant="filled"
                onClick={(e) => handleExternalLink(e, trelloMeta.url)}
                sx={{ cursor: "pointer", fontWeight: 600, height: 24 }}
              />
            ) : hasTrello ? (
              <Chip
                icon={
                  isSyncing && syncingProvider === "trello" ? (
                    <CircularProgress size={12} color="inherit" />
                  ) : (
                    <SyncIcon sx={{ fontSize: "1rem" }} />
                  )
                }
                label="Trello"
                size="small"
                variant="outlined"
                onClick={(e) => handleSyncClick(e, "trello")}
                sx={{ cursor: "pointer", opacity: 0.6, "&:hover": { opacity: 1 }, height: 24 }}
              />
            ) : null}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
};

const ProjectTaskBoard: React.FC<ProjectTaskBoardProps> = ({ tasks, onTaskClick }) => {
  const dispatch = useDispatch();
  const [updateTask] = useUpdateProjectTaskMutation();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [boardState, setBoardState] = useState<BoardState>({
    columns: buildColumnTaskIds(tasks),
  });
  const dragOriginStatusRef = useRef<TaskStatusSchema | null>(null);
  useEffect(() => {
    setBoardState({ columns: buildColumnTaskIds(tasks) });
  }, [tasks]);

  const findTaskById = (taskId: string) => tasks.find((task) => task.id === taskId);

  const handleDragStart = ({ active }: DragStartEvent) => {
    const activeId = String(active.id);
    const originStatus =
      findColumnForTask(boardState.columns, activeId) ?? findTaskById(activeId)?.status ?? null;
    dragOriginStatusRef.current = originStatus;
    console.debug("TaskBoard dragStart", { activeId, originStatus });
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) {
      console.debug("TaskBoard dragOver aborted: no target", {
        activeId: String(active.id),
      });
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    const activeContainer = active.data.current?.sortable?.containerId as
      | TaskStatusSchema
      | undefined;
    const overContainer = over.data.current?.sortable?.containerId as TaskStatusSchema | undefined;

    setBoardState((current) => {
      const currentSourceStatus =
        findColumnForTask(current.columns, activeId) ??
        dragOriginStatusRef.current ??
        activeContainer ??
        findTaskById(activeId)?.status;

      let targetStatus =
        overContainer ??
        findColumnForTask(current.columns, overId) ??
        (COLUMN_STATUSES.includes(overId as TaskStatusSchema)
          ? (overId as TaskStatusSchema)
          : undefined);

      if (!currentSourceStatus || !targetStatus || currentSourceStatus === targetStatus) {
        console.debug("TaskBoard dragOver ignored", {
          activeId,
          overId,
          sourceStatus: currentSourceStatus,
          targetStatus,
        });
        return current;
      }

      const sourceTasks = current.columns[currentSourceStatus];
      const targetTasks = current.columns[targetStatus];
      const activeIndex = sourceTasks.indexOf(activeId);

      if (activeIndex === -1) {
        return current;
      }

      const updatedSource = [...sourceTasks];
      updatedSource.splice(activeIndex, 1);

      const overIndex = targetTasks.indexOf(overId);
      const insertIndex = overIndex >= 0 ? overIndex : targetTasks.length;

      const updatedTarget = [...targetTasks];
      updatedTarget.splice(insertIndex, 0, activeId);

      console.debug("TaskBoard dragOver preview", {
        activeId,
        sourceStatus: currentSourceStatus,
        targetStatus,
        insertIndex,
      });

      return {
        columns: {
          ...current.columns,
          [currentSourceStatus]: updatedSource,
          [targetStatus]: updatedTarget,
        },
      };
    });
  };

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over) {
      // Reset to authoritative state if dropped outside
      console.debug("TaskBoard dragEnd outside drop target", {
        activeId: String(active.id),
      });
      setBoardState({ columns: buildColumnTaskIds(tasks) });
      dragOriginStatusRef.current = null;
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    const activeContainer = active.data.current?.sortable?.containerId as
      | TaskStatusSchema
      | undefined;
    const overContainer = over.data.current?.sortable?.containerId as TaskStatusSchema | undefined;

    const originStatus =
      dragOriginStatusRef.current ??
      findColumnForTask(boardState.columns, activeId) ??
      activeContainer ??
      findTaskById(activeId)?.status;

    let targetStatus =
      overContainer ??
      findColumnForTask(boardState.columns, overId) ??
      (COLUMN_STATUSES.includes(overId as TaskStatusSchema)
        ? (overId as TaskStatusSchema)
        : undefined);

    if (!originStatus || !targetStatus) {
      console.warn("TaskBoard dragEnd missing status", {
        activeId,
        overId,
        originStatus,
        targetStatus,
      });
      setBoardState({ columns: buildColumnTaskIds(tasks) });
      dragOriginStatusRef.current = null;
      return;
    }

    if (originStatus === targetStatus) {
      console.debug("TaskBoard dragEnd same column", {
        activeId,
        column: originStatus,
      });
      setBoardState({ columns: buildColumnTaskIds(tasks) });
      dragOriginStatusRef.current = null;
      return;
    }

    const task = findTaskById(activeId);
    if (!task) {
      console.warn("TaskBoard dragEnd could not resolve task", { activeId });
      setBoardState({ columns: buildColumnTaskIds(tasks) });
      dragOriginStatusRef.current = null;
      return;
    }

    try {
      console.info("TaskBoard updating task status", {
        taskId: task.id,
        projectId: task.projectId,
        from: originStatus,
        to: targetStatus,
      });
      await updateTask({
        path: { projectId: task.projectId, taskId: task.id },
        body: { status: targetStatus },
      }).unwrap();
      dragOriginStatusRef.current = null;
    } catch (mutationError) {
      console.error("TaskBoard update failed", {
        error: mutationError,
        taskId: task.id,
        projectId: task.projectId,
        from: originStatus,
        to: targetStatus,
      });
      dispatch(
        setToastMessage({
          severity: "error",
          message: "Failed to move task. Please try again.",
        }),
      );
      setBoardState({ columns: buildColumnTaskIds(tasks) });
      dragOriginStatusRef.current = null;
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <Box sx={{ width: "100%", overflowX: "auto", pb: { xs: 2, md: 0 } }}>
        <Stack
          direction="row"
          spacing={3}
          sx={{
            width: "fit-content",
            minWidth: "100%",
            pr: { xs: 2, md: 0 },
            alignItems: "stretch",
            minHeight: "65vh",
          }}
        >
          {COLUMNS.map((column) => {
            const columnTasks = boardState.columns[column.status]
              .map((id) => tasks.find((task) => task.id === id))
              .filter((task): task is TaskResponse => Boolean(task));

            return (
              <SortableContext
                key={column.status}
                id={column.status}
                items={columnTasks.map((task) => task.id)}
                strategy={rectSortingStrategy}
              >
                <DroppableColumn column={column} tasks={columnTasks}>
                  {columnTasks.map((task) => (
                    <DraggableTaskCard key={task.id} task={task} onClick={onTaskClick} />
                  ))}
                </DroppableColumn>
              </SortableContext>
            );
          })}
        </Stack>
      </Box>
    </DndContext>
  );
};

export default ProjectTaskBoard;
