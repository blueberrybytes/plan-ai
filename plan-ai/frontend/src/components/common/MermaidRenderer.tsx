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
import { repairMermaidSyntax } from "../../utils/mermaidUtils";
import {
  buildMermaidTheme,
  fitSvgToBox,
  injectMermaidThemeStyles,
  type MermaidBrandTheme,
} from "../../utils/mermaidTheme";
import { sanitizeMermaidSvg } from "../../utils/sanitizeSvg";

interface MermaidRendererProps {
  chart: string;
  theme?: MermaidBrandTheme | null;
  /**
   * "width" (default): the diagram fits the width and the box grows with it.
   * "contain": the box takes the height of its parent and the diagram is scaled
   * to fit both width and height. Use it where the parent has a fixed height,
   * like a slide.
   */
  fit?: "width" | "contain";
  onFixDiagram?: (errorMessage?: string) => void;
  isFixing?: boolean;
  onErrorStateChange?: (hasError: boolean, errorMessage?: string) => void;
}

const MermaidRenderer: React.FC<MermaidRendererProps> = ({
  chart,
  theme,
  fit = "width",
  onFixDiagram,
  isFixing,
  onErrorStateChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const muiTheme = useTheme();

  const defaultPrimary = muiTheme.palette.primary.main;
  const defaultSecondary = muiTheme.palette.secondary.main;
  const defaultBackground = muiTheme.palette.background.paper;

  // Brand colours, with the app theme filling in whatever the brand leaves out.
  // The dependencies are the plain values, so a caller that builds a new theme
  // object on every render does not trigger a new Mermaid render.
  const mermaidTheme = React.useMemo(
    () =>
      buildMermaidTheme(
        {
          primaryColor: theme?.primaryColor,
          secondaryColor: theme?.secondaryColor,
          backgroundColor: theme?.backgroundColor,
          textColor: theme?.textColor,
          bodyFont: theme?.bodyFont,
        },
        { primary: defaultPrimary, secondary: defaultSecondary, background: defaultBackground },
      ),
    [
      theme?.primaryColor,
      theme?.secondaryColor,
      theme?.backgroundColor,
      theme?.textColor,
      theme?.bodyFont,
      defaultPrimary,
      defaultSecondary,
      defaultBackground,
    ],
  );
  const bg = mermaidTheme.palette.background;

  // Size of the box the diagram is drawn in, kept up to date on resize.
  // clientWidth and clientHeight ignore CSS transforms, so a slide that is
  // scaled down as a whole still reports its layout size.
  const [boxSize, setBoxSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () =>
      setBoxSize((prev) =>
        prev.width === box.clientWidth && prev.height === box.clientHeight
          ? prev
          : { width: box.clientWidth, height: box.clientHeight },
      );
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [hasError]);

  const contain = fit === "contain";
  const canvasPadding = contain ? 16 : 32;
  const fittedSvg = React.useMemo(() => {
    if (!svgContent || boxSize.width <= 0) return svgContent;
    const width = boxSize.width - canvasPadding * 2;
    const height = boxSize.height - canvasPadding * 2;
    // A box with almost no height means the parent has no fixed height. The
    // diagram is then fitted by width only, or it would shrink to nothing.
    // With a real height the diagram may grow up to MAX_DIAGRAM_UPSCALE.
    if (contain && height >= 80) return fitSvgToBox(svgContent, { width, height });
    // By width only: shrink a wide diagram, never enlarge a small one. The old
    // 300px minimum blew narrow diagrams up until they were cropped.
    return fitSvgToBox(svgContent, { width, height: null }, 1);
  }, [svgContent, boxSize, contain, canvasPadding]);

  useEffect(() => {
    let isMounted = true;

    const renderChart = async () => {
      // Define ID outside try block so we can locate orphaned error SVGs in finally
      const id = `mermaid-svg-${Math.random().toString(36).substr(2, 9)}`;

      try {
        setHasError(false);
        setErrorMessage("");
        if (onErrorStateChange) onErrorStateChange(false);

        // theme "base" is the only Mermaid theme that takes themeVariables in
        // full. All colours come from buildMermaidTheme, already as hex, which
        // is the only format the theme engine accepts.
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          darkMode: mermaidTheme.palette.isDark,
          fontFamily: mermaidTheme.palette.fontFamily,
          themeVariables: mermaidTheme.themeVariables,
          flowchart: { htmlLabels: true, useMaxWidth: true },
          sequence: { wrap: true, showSequenceNumbers: false },
          // Gantt geometry: bigger bars + labels so a long chronology stays legible,
          // and fit to the container width (the default 11px text rendered tiny).
          gantt: {
            useMaxWidth: true,
            fontSize: 14,
            sectionFontSize: 14,
            barHeight: 24,
            barGap: 6,
            topPadding: 48,
            leftPadding: 96,
            gridLineStartPadding: 32,
          },
          // Per-diagram colour config (these colours are NOT themeVariables).
          er: mermaidTheme.er as any,
          sankey: mermaidTheme.sankey as any,
          // Diagram source can come from model output. "strict" sanitises labels and
          // disables click callbacks; the final SVG is sanitised again below.
          securityLevel: "strict",
          logLevel: 5,
          suppressErrorRendering: true,
        });

        // Pre-validate syntax so mermaid doesn't successfully render an error SVG
        const safeChart = repairMermaidSyntax(chart);
        await mermaid.parse(safeChart, { suppressErrors: true });

        const { svg } = await mermaid.render(id, safeChart);

        if (isMounted) {
          // Add the CSS for what theme variables cannot reach.
          const themedSvg = injectMermaidThemeStyles(svg, id, mermaidTheme.palette);
          setSvgContent(sanitizeMermaidSvg(themedSvg));
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
  }, [chart, mermaidTheme, onErrorStateChange]);

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
          [Mermaid Diagram Error]: Parsing crashed. Please check syntax constraints.
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
          {errorMessage || "Invalid diagram syntax."}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      ref={boxRef}
      sx={{
        width: "100%",
        minHeight: contain ? 0 : "400px",
        ...(contain ? { height: "100%", alignSelf: "stretch" } : {}),
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
              wrapperStyle={{ width: "100%", height: "100%", minHeight: contain ? 0 : "400px" }}
              contentStyle={{
                width: "100%",
                height: "100%",
                minHeight: contain ? 0 : "400px",
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
                  p: `${canvasPadding}px`,
                  // The svg carries an explicit size from fitSvgToBox. It must
                  // not be stretched or shrunk again by the flex layout.
                  "& svg": {
                    display: "block",
                    flexShrink: 0,
                  },
                }}
                dangerouslySetInnerHTML={{ __html: fittedSvg }}
              />
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </Box>
  );
};

export default MermaidRenderer;
