import React, { useEffect, useRef, useState } from "react";
import { Box, Card, CardContent, Divider, Stack, Typography, Chip, Tooltip } from "@mui/material";
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
      }}
    >
      <CardContent>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {column.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {column.description}
            </Typography>
          </Box>
          <Divider />
          {tasks.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No tasks yet.
            </Typography>
          ) : (
            <Stack spacing={2}>{children}</Stack>
          )}
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
              sx={{ "& p": { variant: "body2", color: "text.primary" } }}
            />
          ) : null}

          {task.description ? (
            <MarkdownRenderer
              content={task.description}
              sx={{ "& p": { variant: "body2", color: "text.secondary" } }}
            />
          ) : null}

          {task.acceptanceCriteria ? (
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
              Acceptance: {task.acceptanceCriteria}
            </Typography>
          ) : null}

          <Stack direction="row" spacing={2}>
            <Tooltip title="Due date">
              <Typography variant="caption" color="text.secondary">
                Due: {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
              </Typography>
            </Tooltip>
            <Tooltip title="Last updated">
              <Typography variant="caption" color="text.secondary">
                Updated: {new Date(task.updatedAt).toLocaleString()}
              </Typography>
            </Tooltip>
            {task.dependencies?.length ? (
              <Tooltip title="Number of blocking tasks">
                <Typography variant="caption" color="text.secondary">
                  Dependencies: {task.dependencies.length}
                </Typography>
              </Tooltip>
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
