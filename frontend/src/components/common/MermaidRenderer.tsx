import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { Box, Typography, IconButton, useTheme } from "@mui/material";
import { ZoomIn, ZoomOut, CenterFocusStrong } from "@mui/icons-material";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

interface MermaidRendererProps {
  chart: string;
  theme?: {
    primaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
  } | null;
}

const MermaidRenderer: React.FC<MermaidRendererProps> = ({ chart, theme }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [hasError, setHasError] = useState<boolean>(false);
  const muiTheme = useTheme();

  // Smart background-aware text color inversion (fixes unreadable dark themes)
  const textColor =
    theme?.textColor ??
    (theme?.backgroundColor
      ? muiTheme.palette.getContrastText(theme.backgroundColor)
      : muiTheme.palette.text.primary);

  useEffect(() => {
    let isMounted = true;

    const renderChart = async () => {
      // Define ID outside try block so we can locate orphaned error SVGs in finally
      const id = `mermaid-svg-${Math.random().toString(36).substr(2, 9)}`;

      try {
        setHasError(false);
        // Initialize mermaid with dynamic theme variables.
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: {
            primaryColor: theme?.backgroundColor ?? "#ffffff",
            mainBkg: theme?.backgroundColor ?? "#ffffff",
            primaryBorderColor: theme?.primaryColor ?? "#6366f1",
            nodeBorder: theme?.primaryColor ?? "#6366f1",
            primaryTextColor: textColor,
            textColor: textColor,
            nodeTextColor: textColor,
            lineColor: theme?.primaryColor ?? "#6366f1",
            fontFamily: "inherit",
          },
          flowchart: {
            htmlLabels: true,
            useMaxWidth: true,
          },
          securityLevel: "loose",
          logLevel: 5, // Suppress verbose mermaid logs
          suppressErrorRendering: true, // Force Mermaid not to render SVGs for syntax errors
        });

        // Pre-validate syntax so mermaid doesn't successfully render an error SVG
        await mermaid.parse(chart, { suppressErrors: true });

        const { svg } = await mermaid.render(id, chart);

        if (isMounted) {
          // Force text and borders to respect theme variables even if Mermaid chart type ignores them natively
          const themedSvg = svg.replace(
            /(<svg[^>]*>)/i,
            `$1<style>
              #${id} { max-width: 100% !important; height: auto !important; }
              #${id} * { color: ${textColor} !important; }
              #${id} text, #${id} tspan, #${id} .nodeLabel, #${id} .edgeLabel, #${id} .label, #${id} foreignObject div, #${id} foreignObject span, #${id} foreignObject p, #${id} foreignObject strong, #${id} foreignObject b, #${id} foreignObject i, #${id} foreignObject em { 
                fill: ${textColor} !important; 
                color: ${textColor} !important; 
              }
              #${id} .node rect, #${id} .node polygon, #${id} .node circle, #${id} .node ellipse { fill: ${theme?.backgroundColor ?? "#ffffff"} !important; stroke: ${theme?.primaryColor ?? "#6366f1"} !important; }
              #${id} .edgePath .path { stroke: ${theme?.primaryColor ?? "#6366f1"} !important; }
              #${id} .edgeLabel { background-color: ${theme?.backgroundColor ?? "#ffffff"} !important; color: ${textColor} !important; }
              #${id} .actor { fill: ${theme?.backgroundColor ?? "#ffffff"} !important; stroke: ${theme?.primaryColor ?? "#6366f1"} !important; }
              #${id} .messageLine0, #${id} .messageLine1 { stroke: ${theme?.primaryColor ?? "#6366f1"} !important; }
              #${id} .labelBox { fill: ${theme?.backgroundColor ?? "#ffffff"} !important; stroke: ${theme?.primaryColor ?? "#6366f1"} !important; }
              #${id} .labelText { fill: ${textColor} !important; }
              #${id} .loopText, #${id} .loopText > tspan { fill: ${textColor} !important; }
              #${id} .messageText { fill: ${textColor} !important; stroke: none !important; }
              #${id} .note { fill: ${theme?.backgroundColor ?? "#ffffff"} !important; stroke: ${theme?.primaryColor ?? "#6366f1"} !important; }
              #${id} .noteText { fill: ${textColor} !important; stroke: none !important; }
            </style>`,
          );
          setSvgContent(themedSvg);
        }
      } catch (err) {
        console.error("Mermaid parsing error:", err);
        if (isMounted) {
          setHasError(true);
        }
      } finally {
        // Mermaid is notorious for injecting huge error SVG bomb graphics directly to the bottom
        // of the document <body> when parsing fails mid-stream. Physically obliterate them!
        const orphan1 = document.getElementById(id);
        const orphan2 = document.getElementById(`d-${id}`);
        if (orphan1) orphan1.remove();
        if (orphan2) orphan2.remove();
      }
    };

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart, theme, textColor]);

  if (hasError) {
    return (
      <Box sx={{ p: 2, border: "1px solid", borderColor: "error.main", borderRadius: 1, my: 2 }}>
        <Typography color="error" variant="body2" sx={{ fontFamily: "monospace" }}>
          [Mermaid Diagram Error]: Please check syntax
        </Typography>
        <Typography variant="caption" sx={{ fontFamily: "monospace", display: "block", mt: 1 }}>
          {chart}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%", height: "100%", position: "relative" }}>
      <TransformWrapper
        initialScale={1}
        minScale={0.1}
        maxScale={4}
        centerOnInit
        wheel={{ step: 0.1 }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <Box
              sx={{
                position: "absolute",
                bottom: 16,
                right: 80,
                zIndex: 10,
                display: "flex",
                gap: 1,
                bgcolor: "background.paper",
                p: 0.5,
                borderRadius: 2,
                boxShadow: 1,
              }}
            >
              <IconButton size="small" onClick={() => zoomIn()}>
                <ZoomIn fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => zoomOut()}>
                <ZoomOut fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => resetTransform()}>
                <CenterFocusStrong fontSize="small" />
              </IconButton>
            </Box>
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%" }}
              contentStyle={{
                width: "100%",
                height: "100%",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Box
                ref={containerRef}
                className="mermaid-container"
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  p: 4,
                  "& svg": {
                    maxWidth: "none", // Allow SVG to grow for panning
                    height: "auto",
                  },
                }}
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </Box>
  );
};

export default MermaidRenderer;
