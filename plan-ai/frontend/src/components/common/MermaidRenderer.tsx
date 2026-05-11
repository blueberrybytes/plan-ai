/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { Box, Typography, IconButton, useTheme, Button } from "@mui/material";
import {
  ZoomIn,
  ZoomOut,
  CenterFocusStrong,
  Download,
  AutoAwesome as AutoAwesomeIcon,
} from "@mui/icons-material";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { injectMermaidThemeStyles, repairMermaidSyntax } from "../../utils/mermaidUtils";

interface MermaidRendererProps {
  chart: string;
  theme?: {
    primaryColor?: string;
    secondaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
  } | null;
  onFixDiagram?: (errorMessage?: string) => void;
  isFixing?: boolean;
  onErrorStateChange?: (hasError: boolean, errorMessage?: string) => void;
}

const MermaidRenderer: React.FC<MermaidRendererProps> = ({
  chart,
  theme,
  onFixDiagram,
  isFixing,
  onErrorStateChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const muiTheme = useTheme();

  // Smart background-aware text color inversion (fixes unreadable dark themes)
  const bg = theme?.backgroundColor || muiTheme.palette.background.paper;
  const primary = theme?.primaryColor || muiTheme.palette.primary.main;
  const secondary = theme?.secondaryColor || muiTheme.palette.secondary.main;

  // Compute text colors mathematically to guarantee readability against their respective backgrounds
  const canvasTextColor = theme?.textColor || muiTheme.palette.getContrastText(bg);
  const nodeTextColor = muiTheme.palette.getContrastText(primary);
  const secondaryTextColor = muiTheme.palette.getContrastText(secondary);

  const isDark = muiTheme.palette.getContrastText(bg) === "#fff";

  // Generate a derived palette for charts to ensure variety
  const generatePalette = (p: string, s: string) => {
    // To ensure pie charts and multi-line charts always have distinct, high-contrast slices/lines,
    // we lead with the primary brand color, followed by curated vibrant colors, and mix in secondary.
    return [
      p,
      "#f59e0b", // Amber
      "#10b981", // Emerald
      s, // Brand Secondary
      "#8b5cf6", // Violet
      "#ef4444", // Red
      "#0ea5e9", // Sky
      "#f43f5e", // Rose
      "#84cc16", // Lime
      "#d946ef", // Fuchsia
    ];
  };
  const palette = React.useMemo(() => generatePalette(primary, secondary), [primary, secondary]);

  useEffect(() => {
    let isMounted = true;

    const renderChart = async () => {
      // Define ID outside try block so we can locate orphaned error SVGs in finally
      const id = `mermaid-svg-${Math.random().toString(36).substr(2, 9)}`;

      try {
        setHasError(false);
        setErrorMessage("");
        if (onErrorStateChange) onErrorStateChange(false);
        // Initialize mermaid with dynamic theme variables.
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          themeVariables: {
            primaryColor: primary,
            mainBkg: bg,
            primaryBorderColor: secondary,
            nodeBorder: secondary,
            lineColor: secondary,
            nodeTextColor: nodeTextColor,
            clusterBkg: bg,
            clusterBorder: secondary,
            fontFamily: '"Inter", "Roboto", sans-serif',
            fontSize: "14px",
            edgeLabelBackground: bg, // Ensure Mermaid natively sets edge label bg to canvas color

            // Text color helpers for native contrast computations (Journey, Timeline, etc)
            taskTextDarkColor: "#0f172a",
            taskTextLightColor: "#f8fafc",
            taskTextOutsideColor: canvasTextColor,

            // Gantt native variables
            taskBkgColor: primary,
            taskBorderColor: secondary,
            taskTextColor: nodeTextColor,

            // General text fallback
            textColor: canvasTextColor,

            // Timeline & Journey text variables (some versions use these)
            cScaleLabel0: isDark ? "#ffffff" : "#0f172a",
            cScaleLabel1: isDark ? "#ffffff" : "#0f172a",
            cScaleLabel2: isDark ? "#ffffff" : "#0f172a",
            cScaleLabel3: isDark ? "#ffffff" : "#0f172a",
            cScaleLabel4: isDark ? "#ffffff" : "#0f172a",
            cScaleLabel5: isDark ? "#ffffff" : "#0f172a",

            // Pie Charts
            pie1: palette[0],
            pie2: palette[1],
            pie3: palette[2],
            pie4: palette[3],
            pie5: palette[4],
            pie6: palette[5],
            pie7: palette[6],
            pie8: palette[7],
            pie9: palette[8],
            pie10: palette[9],
            pieTitleTextSize: "16px",
            pieTitleTextColor: canvasTextColor,
            pieSectionTextSize: "12px",
            pieSectionTextColor: canvasTextColor,
            pieLegendTextSize: "14px",
            pieLegendTextColor: canvasTextColor,
            pieStrokeColor: bg,
            pieStrokeWidth: "2px",
            pieOuterStrokeWidth: "2px",
            pieOuterStrokeColor: bg,

            // XYChart
            xyChart: {
              backgroundColor: "transparent",
              titleColor: canvasTextColor,
              dataLabelColor: canvasTextColor,
              xAxisLabelColor: canvasTextColor,
              xAxisTitleColor: canvasTextColor,
              xAxisTickColor: secondary,
              xAxisLineColor: secondary,
              yAxisLabelColor: canvasTextColor,
              yAxisTitleColor: canvasTextColor,
              yAxisTickColor: secondary,
              yAxisLineColor: secondary,
              plotColorPalette: palette.join(", "),
            } as any,
          },
          flowchart: {
            htmlLabels: true,
            useMaxWidth: true,
          },
          sequence: {
            wrap: true,
            showSequenceNumbers: false,
          },
          securityLevel: "loose",
          logLevel: 5, // Suppress verbose mermaid logs
          suppressErrorRendering: true, // Force Mermaid not to render SVGs for syntax errors
        });

        // Pre-validate syntax so mermaid doesn't successfully render an error SVG
        const safeChart = repairMermaidSyntax(chart);
        await mermaid.parse(safeChart, { suppressErrors: true });

        const { svg } = await mermaid.render(id, safeChart);

        if (isMounted) {
          // Wrap with theme styles for complex diagrams (Gantt, Class, Sequence)
          // while preserving intrinsic node colors for Flowcharts.
          const themedSvg = injectMermaidThemeStyles(svg, {
            id,
            bg,
            primary,
            secondary,
            canvasTextColor,
            nodeTextColor,
            secondaryTextColor,
          });
          setSvgContent(themedSvg);
        }
      } catch (err: any) {
        console.error("Mermaid parsing error:", err);
        const errMsg = err?.message || String(err);
        if (isMounted) {
          setHasError(true);
          setErrorMessage(errMsg);
          if (onErrorStateChange) onErrorStateChange(true, errMsg);
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
  }, [
    chart,
    bg,
    primary,
    secondary,
    canvasTextColor,
    nodeTextColor,
    secondaryTextColor,
    onErrorStateChange,
    isDark,
    palette,
  ]);

  const handleDownloadSvg = () => {
    if (!svgContent) return;

    // Fix common XML/SVG malformations introduced by Mermaid HTML labels
    let safeSvg = svgContent;
    // Fix unclosed break tags
    safeSvg = safeSvg.replace(/<br>/gi, "<br/>");
    // Fix unescaped ampersands that aren't already valid XML entities
    safeSvg = safeSvg.replace(/&(?!(?:apos|quot|[gl]t|amp);|#)/g, "&amp;");
    // Ensure xmlns is present for standalone SVG viewing
    if (!safeSvg.includes('xmlns="http://www.w3.org/2000/svg"')) {
      safeSvg = safeSvg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
    }

    const blob = new Blob([safeSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `diagram-${Math.random().toString(36).substr(2, 6)}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (hasError) {
    return (
      <Box
        sx={{
          p: 3,
          border: "1px solid",
          borderColor: "error.main",
          borderRadius: 1,
          my: 2,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          alignItems: "flex-start",
        }}
      >
        <Typography
          color="error.dark"
          variant="body2"
          sx={{ fontFamily: "monospace", fontWeight: "bold" }}
        >
          [Mermaid Diagram Error]: Parsing crashed. Please check syntax syntax constraints.
        </Typography>

        {onFixDiagram && (
          <Button
            variant="contained"
            color="warning"
            startIcon={<AutoAwesomeIcon />}
            onClick={() => onFixDiagram(errorMessage)}
            disabled={isFixing}
            size="small"
          >
            {isFixing ? "AI is fixing..." : "Fix Diagram with AI"}
          </Button>
        )}

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: "monospace", display: "block", mt: 1, whiteSpace: "pre-wrap" }}
        >
          {errorMessage ? errorMessage.split("\n")[0] : "Invalid diagram syntax."}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: "100%",
        minHeight: "400px",
        position: "relative",
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <TransformWrapper
        initialScale={1}
        minScale={0.1}
        maxScale={8}
        centerOnInit
        wheel={{ step: 0.1 }}
        panning={{ velocityDisabled: false }}
        doubleClick={{ mode: "reset" }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <Box
              onClick={(e) => e.stopPropagation()}
              sx={{
                position: "absolute",
                bottom: 16,
                right: 16,
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
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownloadSvg();
                }}
              >
                <Download fontSize="small" />
              </IconButton>
            </Box>
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%", minHeight: "400px" }}
              contentStyle={{
                width: "100%",
                height: "100%",
                minHeight: "400px",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Box
                ref={containerRef}
                className="mermaid-canvas"
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  bgcolor: bg,
                  borderRadius: 2,
                  p: 4,
                  "& svg": {
                    display: "block",
                    minWidth: "300px",
                    minHeight: "300px",
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
