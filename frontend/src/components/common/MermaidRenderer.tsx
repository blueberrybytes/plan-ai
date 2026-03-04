import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { Box, Typography } from "@mui/material";

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

  useEffect(() => {
    let isMounted = true;

    const renderChart = async () => {
      try {
        setHasError(false);
        // Initialize mermaid with dynamic theme variables.
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: {
            primaryColor: theme?.backgroundColor ?? "#ffffff",
            primaryBorderColor: theme?.primaryColor ?? "#6366f1",
            primaryTextColor: theme?.textColor ?? "#333333",
            lineColor: theme?.textColor ?? "#6366f1",
            fontFamily: "inherit",
          },
          securityLevel: "loose",
        });

        // Unique ID for this instance to prevent SVG collisions
        const id = `mermaid-svg-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);

        if (isMounted) {
          setSvgContent(svg);
        }
      } catch (err) {
        console.error("Mermaid parsing error:", err);
        if (isMounted) {
          setHasError(true);
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart, theme]);

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
    <Box
      ref={containerRef}
      className="mermaid-container"
      sx={{
        display: "flex",
        justifyContent: "center",
        my: 3,
        overflowX: "auto",
        "& svg": {
          maxWidth: "100%",
          height: "auto",
        },
      }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
};

export default MermaidRenderer;
