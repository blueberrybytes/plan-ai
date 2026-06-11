import React, { useRef, useState, useCallback, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { Box, Typography, IconButton, Tooltip, useTheme, alpha } from "@mui/material";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import CodeIcon from "@mui/icons-material/Code";

export interface ContextGraphNode {
  id: string;
  name: string;
  group: "ticket" | "file" | "function" | "database";
  val: number;
  x?: number;
  y?: number;
}

export interface ContextGraphLink {
  source: string;
  target: string;
}

export interface AiGraphTrace {
  nodes: ContextGraphNode[];
  links: ContextGraphLink[];
}

interface ContextGraphProps {
  nodes?: ContextGraphNode[];
  links?: ContextGraphLink[];
  height?: number;
}

// Dummy data for the WOW effect demo
const DUMMY_NODES: ContextGraphNode[] = [
  { id: "ticket", name: "Add Stripe Payment", group: "ticket", val: 30 },
  { id: "userController", name: "userController.ts", group: "file", val: 20 },
  { id: "authService", name: "AuthService", group: "function", val: 15 },
  { id: "schema", name: "schema.prisma", group: "database", val: 25 },
  { id: "paymentService", name: "PaymentService", group: "file", val: 20 },
  { id: "stripeConfig", name: "stripeConfig.ts", group: "file", val: 10 },
];

const DUMMY_LINKS: ContextGraphLink[] = [
  { source: "ticket", target: "userController" },
  { source: "ticket", target: "paymentService" },
  { source: "userController", target: "authService" },
  { source: "userController", target: "schema" },
  { source: "paymentService", target: "schema" },
  { source: "paymentService", target: "stripeConfig" },
];

export const ContextGraph: React.FC<ContextGraphProps> = ({
  nodes = DUMMY_NODES,
  links = DUMMY_LINKS,
  height = 300,
}) => {
  const theme = useTheme();
  const fgRef = useRef<React.ElementRef<typeof ForceGraph2D>>();
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Resize observer to make canvas responsive
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setContainerWidth(entries[0].contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleZoomIn = useCallback(() => {
    if (fgRef.current) {
      const currentZoom = fgRef.current.zoom();
      fgRef.current.zoom(currentZoom * 1.5, 400);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (fgRef.current) {
      const currentZoom = fgRef.current.zoom();
      fgRef.current.zoom(currentZoom / 1.5, 400);
    }
  }, []);

  const handleRecenter = useCallback(() => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(400, 50);
    }
  }, []);

  // Theme-aware colors
  const getColorByGroup = (group: string) => {
    switch (group) {
      case "ticket":
        return theme.palette.primary.main;
      case "file":
        return theme.palette.info.main;
      case "function":
        return theme.palette.warning.main;
      case "database":
        return theme.palette.success.main;
      default:
        return theme.palette.text.secondary;
    }
  };

  return (
    <Box
      ref={containerRef}
      sx={{
        width: "100%",
        height: height,
        borderRadius: 2,
        overflow: "hidden",
        position: "relative",
        bgcolor: theme.palette.mode === "dark" ? "#0F172A" : "#F8FAFC",
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `inset 0 0 40px ${alpha(theme.palette.background.default, 0.5)}`,
      }}
    >
      {/* Floating Header */}
      <Box
        sx={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 1,
          bgcolor: alpha(theme.palette.background.paper, 0.8),
          backdropFilter: "blur(8px)",
          px: 2,
          py: 0.5,
          borderRadius: 2,
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        <CodeIcon color="primary" fontSize="small" />
        <Typography variant="body2" fontWeight={600} color="text.primary">
          Cortex AI Context
        </Typography>
      </Box>

      {/* Floating Controls */}
      <Box
        sx={{
          position: "absolute",
          bottom: 16,
          right: 16,
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
          bgcolor: alpha(theme.palette.background.paper, 0.8),
          backdropFilter: "blur(8px)",
          borderRadius: 2,
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Tooltip title="Zoom In" placement="left">
          <IconButton size="small" onClick={handleZoomIn}>
            <ZoomInIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Reset View" placement="left">
          <IconButton size="small" onClick={handleRecenter}>
            <CenterFocusStrongIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Zoom Out" placement="left">
          <IconButton size="small" onClick={handleZoomOut}>
            <ZoomOutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {containerWidth > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={containerWidth}
          height={height}
          graphData={{ nodes, links }}
          nodeRelSize={6}
          nodeColor={(node: object) => getColorByGroup((node as ContextGraphNode).group)}
          linkColor={() => alpha(theme.palette.text.secondary, 0.3)}
          linkWidth={1.5}
          linkDirectionalParticles={2}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleColor={() => alpha(theme.palette.primary.main, 0.6)}
          nodeCanvasObject={(node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const graphNode = node as ContextGraphNode;
            const label = graphNode.name;
            const fontSize = 12 / globalScale;
            ctx.font = `${fontSize}px Inter, sans-serif`;
            const textWidth = ctx.measureText(label).width;
            const bckgDimensions = [textWidth, fontSize].map((n) => n + fontSize * 0.2);

            // Draw Node Circle
            ctx.beginPath();
            ctx.arc(graphNode.x || 0, graphNode.y || 0, graphNode.val / 2, 0, 2 * Math.PI, false);
            ctx.fillStyle = getColorByGroup(graphNode.group);
            ctx.fill();

            // Draw Label Background
            ctx.fillStyle = alpha(theme.palette.background.paper, 0.8);
            ctx.fillRect(
              (graphNode.x || 0) - bckgDimensions[0] / 2,
              (graphNode.y || 0) + graphNode.val / 2 + 2,
              bckgDimensions[0],
              bckgDimensions[1],
            );

            // Draw Label Text
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = theme.palette.mode === "dark" ? "#E2E8F0" : "#1E293B";
            ctx.fillText(
              label,
              graphNode.x || 0,
              (graphNode.y || 0) + graphNode.val / 2 + 2 + bckgDimensions[1] / 2,
            );
          }}
          onEngineStop={() => handleRecenter()}
        />
      )}
    </Box>
  );
};
