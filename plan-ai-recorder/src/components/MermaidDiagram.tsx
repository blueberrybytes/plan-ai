import React, { useEffect, useId, useState } from "react";
import { Alert, Box, CircularProgress } from "@mui/material";
import DOMPurify from "dompurify";

// Diagrams are drawn on this machine. They used to go through the mermaid.ink
// web service, which sent task titles from the meeting to a third party.
// Mermaid is loaded on first use, it is a large bundle.
let mermaidReady: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        // Strict: labels are encoded and click handlers are disabled.
        securityLevel: "strict",
        theme: "default",
        // Plain SVG text labels, no <foreignObject> HTML to sanitise.
        htmlLabels: false,
      });
      return mermaid;
    });
  }
  return mermaidReady;
}

async function renderSvg(id: string, code: string): Promise<string> {
  const mermaid = await loadMermaid();
  const { svg } = await mermaid.render(id, code);
  // Labels come from meeting content: sanitise before it touches the DOM.
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
}

const MermaidDiagram = ({ code }: { code: string }) => {
  const reactId = useId();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);
    const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
    renderSvg(id, code)
      .then((out) => {
        if (!cancelled) setSvg(out);
      })
      .catch((err) => {
        console.warn("[MermaidDiagram] Render failed:", err instanceof Error ? err.message : err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code, reactId]);

  if (failed) return <Alert severity="error">Failed to render the diagram.</Alert>;
  if (svg === null) return <CircularProgress size={24} />;
  return (
    <Box
      sx={{ "& svg": { maxWidth: "100%", height: "auto" } }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

export default MermaidDiagram;
