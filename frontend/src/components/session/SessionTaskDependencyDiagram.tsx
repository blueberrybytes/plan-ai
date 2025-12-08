import React, { useMemo } from "react";
import { Box, Stack, Typography } from "@mui/material";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "reactflow";
import dagre from "@dagrejs/dagre";
import type {
  TaskPrioritySchema,
  TaskResponse,
  TaskStatusSchema,
} from "../../store/apis/sessionApi";

import "reactflow/dist/style.css";

const NODE_HORIZONTAL_PADDING = 24;
const NODE_WIDTH = 260;
const NODE_HEIGHT = 110;

const statusColors: Record<TaskStatusSchema, string> = {
  BACKLOG: "#90a4ae",
  IN_PROGRESS: "#42a5f5",
  BLOCKED: "#ef5350",
  COMPLETED: "#66bb6a",
  ARCHIVED: "#bdbdbd",
};

const priorityLabels: Record<TaskPrioritySchema, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

type FlowNode = Node<{
  label: React.ReactNode;
  status: TaskStatusSchema;
}>;

type FlowEdge = Edge<{
  label?: string;
}>;

const layoutWithDagre = (nodes: FlowNode[], edges: FlowEdge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: "LR", align: "UL" });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const positionedNodes = nodes.map((node) => {
    const { x, y } = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: x - NODE_WIDTH / 2,
        y: y - NODE_HEIGHT / 2,
      },
      draggable: false,
    } satisfies FlowNode;
  });

  return { nodes: positionedNodes, edges };
};

const buildFlowNodes = (tasks: TaskResponse[]): FlowNode[] =>
  tasks.map((task) => {
    const statusColor = statusColors[task.status];

    return {
      id: task.id,
      type: "default",
      data: {
        label: (
          <Box
            sx={{
              width: NODE_WIDTH - NODE_HORIZONTAL_PADDING,
              px: 1,
              py: 0.5,
              display: "flex",
              flexDirection: "column",
              gap: 0.5,
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }} gutterBottom>
              {task.title}
            </Typography>
            {task.summary ? (
              <Typography variant="caption" color="text.primary" sx={{ lineHeight: 1.3 }}>
                {task.summary.length > 120 ? `${task.summary.slice(0, 117)}…` : task.summary}
              </Typography>
            ) : null}
            {task.description ? (
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                {task.description.length > 120
                  ? `${task.description.slice(0, 117)}…`
                  : task.description}
              </Typography>
            ) : null}
            {task.acceptanceCriteria ? (
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                Acceptance:{" "}
                {task.acceptanceCriteria.length > 120
                  ? `${task.acceptanceCriteria.slice(0, 117)}…`
                  : task.acceptanceCriteria}
              </Typography>
            ) : null}
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Typography
                variant="caption"
                sx={{
                  px: 0.75,
                  py: 0.25,
                  borderRadius: 1,
                  bgcolor: `${statusColor}1A`,
                  color: statusColor,
                  fontWeight: 600,
                }}
              >
                {task.status.replace("_", " ")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Priority: {priorityLabels[task.priority]}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Due: {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
              </Typography>
              {task.dependencies?.length ? (
                <Typography variant="caption" color="text.secondary">
                  Dependencies: {task.dependencies.length}
                </Typography>
              ) : null}
            </Stack>
          </Box>
        ),
        status: task.status,
      },
      position: { x: 0, y: 0 },
      style: {
        width: NODE_WIDTH,
        borderRadius: 12,
        border: `1px solid ${statusColor}`,
        boxShadow: "rgba(15, 23, 42, 0.08) 0px 4px 18px",
        background: "#ffffff",
      },
    } satisfies FlowNode;
  });

const buildSequentialEdges = (tasks: TaskResponse[]): FlowEdge[] => {
  if (tasks.length < 2) {
    return [];
  }

  const sortedTasks = [...tasks].sort((a, b) => {
    const aDate = a.dueDate ?? a.updatedAt;
    const bDate = b.dueDate ?? b.updatedAt;
    return new Date(aDate).getTime() - new Date(bDate).getTime();
  });

  const edges: FlowEdge[] = [];

  for (let index = 1; index < sortedTasks.length; index += 1) {
    const source = sortedTasks[index - 1];
    const target = sortedTasks[index];

    if (source.id === target.id) {
      continue;
    }

    edges.push({
      id: `edge-${source.id}-${target.id}`,
      source: source.id,
      target: target.id,
      animated: true,
      type: "smoothstep",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
      },
    });
  }

  return edges;
};

export interface SessionTaskDependencyDiagramProps {
  tasks: TaskResponse[];
  onTaskClick?: (task: TaskResponse) => void;
}

const SessionTaskDependencyDiagram: React.FC<SessionTaskDependencyDiagramProps> = ({
  tasks,
  onTaskClick,
}) => {
  const layout = useMemo(() => {
    const nodes = buildFlowNodes(tasks);
    const edges = buildSequentialEdges(tasks);

    return layoutWithDagre(nodes, edges);
  }, [tasks]);

  const handleNodeClick: NodeMouseHandler = (_, node) => {
    if (!onTaskClick) {
      return;
    }
    const task = tasks.find((item) => item.id === node.id);
    if (task) {
      onTaskClick(task);
    }
  };

  if (!tasks.length) {
    return (
      <Box sx={{ py: 6 }}>
        <Typography variant="body2" color="text.secondary" align="center">
          No tasks available yet. Create tasks to explore the board and dependency diagram.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      <Typography variant="body2" color="text.secondary">
        Dependency data is inferred chronologically while explicit dependencies are not yet exposed
        by the API.
      </Typography>
      <Box
        sx={{
          height: 480,
          width: "100%",
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
          overflow: "hidden",
        }}
      >
        <ReactFlow
          nodes={layout.nodes}
          edges={layout.edges}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.4}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          panOnScroll
          onNodeClick={handleNodeClick}
        >
          <MiniMap
            nodeColor={(node) =>
              statusColors[(node.data as { status?: TaskStatusSchema })?.status ?? "BACKLOG"] ||
              "#90a4ae"
            }
          />
          <Controls position="top-right" />
          <Background gap={16} color="#e3f2fd" />
        </ReactFlow>
      </Box>
    </Stack>
  );
};

export default SessionTaskDependencyDiagram;
