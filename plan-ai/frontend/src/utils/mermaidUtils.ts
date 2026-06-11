export type MermaidDiagramType =
  | "FLOWCHART"
  | "SEQUENCE"
  | "CLASS"
  | "STATE"
  | "ER"
  | "GANTT"
  | "JOURNEY"
  | "MINDMAP"
  | "TIMELINE"
  | "PIE"
  | "QUADRANT"
  | "XYCHART"
  | "GIT"
  | "ARCHITECTURE"
  | "KANBAN"
  | "SANKEY"
  | "BLOCK";

/**
 * Derive the diagram type from the Mermaid source's first declaration so the UI
 * tag always reflects the ACTUAL code. A diagram created as a flowchart but then
 * edited into a sequence diagram (or any "AUTO" diagram whose stored type was
 * never resolved) should show its real type, not the stale stored one.
 *
 * Skips YAML frontmatter (`--- … ---`), `%%` comments and `%%{init}%%`
 * directives before reading the header keyword. Returns null if unrecognised
 * (callers fall back to the stored type).
 */
export const detectMermaidType = (code?: string | null): MermaidDiagramType | null => {
  if (!code) return null;

  let inFrontmatter = false;
  let header = "";
  for (const raw of code.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line === "---") {
      // Toggle YAML frontmatter fences (--- … ---).
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) continue;
    if (line.startsWith("%%")) continue; // comments + %%{init}%% directives
    header = line.toLowerCase();
    break;
  }
  if (!header) return null;

  const starts = (prefix: string) => header.startsWith(prefix);
  if (starts("flowchart") || starts("graph")) return "FLOWCHART";
  if (starts("sequencediagram")) return "SEQUENCE";
  if (starts("classdiagram")) return "CLASS";
  if (starts("statediagram")) return "STATE";
  if (starts("erdiagram")) return "ER";
  if (starts("gantt")) return "GANTT";
  if (starts("journey")) return "JOURNEY";
  if (starts("mindmap")) return "MINDMAP";
  if (starts("timeline")) return "TIMELINE";
  if (starts("quadrantchart")) return "QUADRANT";
  if (starts("xychart")) return "XYCHART";
  if (starts("pie")) return "PIE";
  if (starts("gitgraph")) return "GIT";
  if (starts("architecture")) return "ARCHITECTURE";
  if (starts("kanban")) return "KANBAN";
  if (starts("sankey")) return "SANKEY";
  if (starts("block")) return "BLOCK";
  return null;
};

export interface MermaidThemeOptions {
  id: string;
  bg: string;
  primary: string;
  secondary: string;
  canvasTextColor: string;
  /**
   * Text color guaranteed to contrast with the background (`getContrastText(bg)`),
   * ignoring any theme-provided `textColor`. Use for text painted directly on the
   * canvas (e.g. architecture-beta labels) where a theme that sets a light
   * `textColor` on a light background would otherwise make text invisible.
   */
  canvasContrastText: string;
  nodeTextColor: string;
  secondaryTextColor: string;
}

export const injectMermaidThemeStyles = (svg: string, options: MermaidThemeOptions): string => {
  const {
    id,
    bg,
    primary,
    secondary,
    canvasTextColor,
    canvasContrastText,
    nodeTextColor,
    secondaryTextColor,
  } = options;

  return svg.replace(
    /(<svg[^>]*>)/i,
    `$1<style>
      /* Base canvas text - don't blanket override all elements with * to protect flowcharts */
      #${id} > g > text, #${id} > g > foreignObject { 
        fill: ${canvasTextColor} !important; 
        color: ${canvasTextColor} !important; 
      }
      
      /* Edge lines (Flowchart/State) */
      #${id} .edgePath .path, #${id} .edgeTerminals .path, #${id} .transition { stroke: ${secondary} !important; }
      
      /* Edge labels */
      #${id} .edgeLabel { background-color: ${bg} !important; }
      #${id} .edgeLabel rect { fill: ${bg} !important; opacity: 0.8; }
      #${id} .edgeLabel text, #${id} .edgeLabel span { color: ${canvasTextColor} !important; fill: ${canvasTextColor} !important; }


      /* Flowcharts */
      #${id} .node rect, #${id} .node circle, #${id} .node ellipse, #${id} .node polygon, #${id} .node path { fill: ${primary} !important; stroke: ${secondary} !important; stroke-width: 1px !important; }
      #${id} .node text, #${id} .node tspan, #${id} .node foreignObject div, #${id} .node .label { fill: ${nodeTextColor} !important; color: ${nodeTextColor} !important; }
      #${id} .cluster rect { fill: ${bg} !important; stroke: ${secondary} !important; stroke-width: 1px !important; opacity: 0.8; }
      #${id} .cluster text, #${id} .cluster tspan, #${id} .cluster .label { fill: ${canvasTextColor} !important; color: ${canvasTextColor} !important; }
      
      /* State Diagrams */
      #${id} .stateGroup rect, #${id} .stateGroup circle, #${id} .stateGroup ellipse, #${id} .stateGroup polygon, #${id} .state-node rect, #${id} .state-node polygon { fill: ${primary} !important; stroke: ${secondary} !important; }
      #${id} .stateGroup text, #${id} .stateGroup tspan, #${id} .stateGroup foreignObject div, #${id} .state-node text, #${id} .state-node tspan, #${id} .state-node .label { fill: ${nodeTextColor} !important; color: ${nodeTextColor} !important; }
      #${id} .stateGroup .cluster rect { fill: ${bg} !important; opacity: 0.8; }
      #${id} .stateGroup .cluster text { fill: ${canvasTextColor} !important; color: ${canvasTextColor} !important; }

      /* Sequence Diagram Actors */
      #${id} .actor { fill: ${primary} !important; stroke: ${secondary} !important; stroke-width: 2px !important; }
      #${id} text.actor > tspan { fill: ${nodeTextColor} !important; }
      
      /* Sequence Diagram Lines */
      #${id} .actor-line { stroke: ${secondary} !important; }
      #${id} rect[class^="activation"] { fill: ${primary} !important; opacity: 0.2; }
      #${id} .messageLine0, #${id} .messageLine1 { stroke: ${secondary} !important; stroke-width: 2px !important; }
      #${id} .labelBox { fill: ${bg} !important; stroke: ${secondary} !important; }
      #${id} .labelText { fill: ${canvasTextColor} !important; }
      #${id} .loopText, #${id} .loopText > tspan { fill: ${canvasTextColor} !important; }
      #${id} .messageText { fill: ${canvasTextColor} !important; stroke: none !important; }

      /* Gantt Charts */
      #${id} .grid .tick line { stroke: ${secondary} !important; opacity: 0.3; }
      #${id} .today { stroke: ${primary} !important; stroke-width: 2px !important; }
      #${id} .section { fill: none !important; stroke: ${secondary} !important; }
      #${id} .sectionTitle, #${id} .tick text, #${id} .titleText { fill: ${canvasTextColor} !important; color: ${canvasTextColor} !important; }

      /* Class Diagrams */
      #${id} .classGroup rect { fill: ${primary} !important; stroke: ${secondary} !important; }
      #${id} .classGroup text, #${id} .classGroup tspan, #${id} .classLabel .label { fill: ${nodeTextColor} !important; color: ${nodeTextColor} !important; }
      #${id} .classGroup line { stroke: ${secondary} !important; stroke-width: 1; }
      
      /* ER Diagrams */
      #${id} .entityBox, #${id} .attributeBoxOdd, #${id} .attributeBoxEven { fill: ${primary} !important; stroke: ${secondary} !important; }
      #${id} .entityLabel, #${id} .entityLabel text, #${id} .entityLabel tspan { fill: ${nodeTextColor} !important; color: ${nodeTextColor} !important; }
      #${id} .attributeBoxOdd ~ text, #${id} .attributeBoxEven ~ text, #${id} .er.entityLabel text { fill: ${nodeTextColor} !important; color: ${nodeTextColor} !important; }
      #${id} .er.relationshipLine { stroke: ${secondary} !important; }
      #${id} .er.relationshipLabelBox { fill: ${bg} !important; }
      #${id} .er.relationshipLabel { fill: ${canvasTextColor} !important; }
      
      /* Mindmap Diagrams */
      #${id} .mindmap-node rect, #${id} .mindmap-bg { fill: ${primary} !important; stroke: ${secondary} !important; }
      #${id} .mindmap-node text, #${id} .mindmap-node tspan, #${id} .mindmap-node foreignObject div { fill: ${nodeTextColor} !important; color: ${nodeTextColor} !important; }
      #${id} .mindmap-edges path { stroke: ${secondary} !important; stroke-width: 2px !important; }
      
      /* Sankey Diagrams */
      #${id} .sankey-link { fill: ${primary} !important; fill-opacity: 0.3 !important; stroke: none !important; }
      #${id} .sankey-node rect { fill: ${primary} !important; stroke: ${secondary} !important; }
      #${id} .sankey-node text { fill: ${canvasTextColor} !important; color: ${canvasTextColor} !important; }

      /* Architecture (architecture-beta).
         Service & group labels are <text><tspan class="text-outer-tspan"><tspan
         class="text-inner-tspan"> inside .architecture-services / .architecture-groups.
         They carry NO color class and inherit the root SVG fill (white), so they
         vanish on light backgrounds. Force the canvas-contrast color on those tspans.
         Scoped to architecture containers so it can't touch other diagram types.
         NOTE: do NOT fill .node-bkg — in architecture it's the (transparent) group
         box; filling it opaque paints over the icons and blanks the diagram. */
      #${id} .architecture-services text,
      #${id} .architecture-services .text-inner-tspan,
      #${id} .architecture-services .text-outer-tspan,
      #${id} .architecture-groups text,
      #${id} .architecture-groups .text-inner-tspan,
      #${id} .architecture-groups .text-outer-tspan {
        fill: ${canvasContrastText} !important;
        color: ${canvasContrastText} !important;
      }
      /* Architecture group outlines (dashed boxes) + edges — stroke only, never fill. */
      #${id} .architecture-groups .node-bkg { stroke: ${secondary} !important; }
      #${id} .architecture-edges .edge, #${id} [class*="archEdge"], #${id} .arch-edge { stroke: ${secondary} !important; }
      
      /* XYChart Diagrams */
      #${id} [class*="xychart-xaxis-line"], #${id} [class*="xychart-yaxis-line"] { stroke: ${secondary} !important; opacity: 0.5; }
      #${id} [class*="xychart-bg"] { fill: transparent !important; }
      
      /* Notes */
      #${id} .note { fill: ${secondary} !important; stroke: ${primary} !important; }
      #${id} .noteText, #${id} .noteText > tspan { fill: ${secondaryTextColor} !important; stroke: none !important; }

      /* Pie Charts */
      #${id} .pieTitleText, #${id} .legend text { fill: ${canvasTextColor} !important; color: ${canvasTextColor} !important; }
      #${id} .slice { stroke: ${bg} !important; stroke-width: 2px !important; }

      /* Quadrant Charts */
      #${id} .quadrant { fill: transparent !important; }
      #${id} .quadrant-text, #${id} .axis-text, #${id} .quadrant-point-text { fill: ${canvasTextColor} !important; color: ${canvasTextColor} !important; }
      #${id} .axis-path, #${id} .axis-tick { stroke: ${secondary} !important; opacity: 0.5; }
      #${id} circle.point { fill: ${primary} !important; stroke: ${secondary} !important; }

      /* Timeline & Journey */
      #${id} .journey-section { fill: ${primary} !important; stroke: ${secondary} !important; }
      #${id} .journey-section text { fill: ${canvasTextColor} !important; color: ${canvasTextColor} !important; }
      
      /* Timeline Specifics */
      #${id} .event text, #${id} .time text, #${id} .section-title, #${id} .section-title text { fill: ${canvasTextColor} !important; color: ${canvasTextColor} !important; stroke: none !important; }
      #${id} .task-line { stroke: ${secondary} !important; stroke-width: 2px !important; }
      
      /* Kanban & Block */
      #${id} .kanban-card, #${id} .block-node, #${id} .kanban-item { fill: ${primary} !important; stroke: ${secondary} !important; }
      #${id} .kanban-card text, #${id} .kanban-card .label, #${id} .kanban-item text, #${id} .block-node text { fill: ${nodeTextColor} !important; color: ${nodeTextColor} !important; }
      #${id} .kanban-column, #${id} .kanban-board { fill: ${bg} !important; stroke: ${secondary} !important; stroke-opacity: 0.3 !important; }
    </style>`,
  );
};

/**
 * Auto-patches common AI generation syntax errors in Mermaid charts.
 *
 * Wraps node labels that contain delimiter-breaking characters in double quotes
 * (e.g. `R[Traveler Portal (Web/Native)]` -> `R["Traveler Portal (Web/Native)"]`)
 * without ever splitting the surrounding node-shape delimiters.
 *
 * Crucially, this recognises COMPOUND shapes — circle `((…))`, stadium `([…])`,
 * cylinder `[(…)]`, subroutine `[[…]]`, hexagon `{{…}}` — and the rhombus `{…}`.
 * The previous implementation only knew about `[…]` and `(…)`, so a perfectly
 * valid `E((Endpoint Platforms))` was mangled into `E("(Endpoint Platforms"))`,
 * crashing the renderer. A single ordered tokenizer pass (compound delimiters
 * first) consumes each node as one unit and prevents that corruption.
 */
export const repairMermaidSyntax = (chart: string): string => {
  // Chars that break an UNQUOTED node label and therefore force quoting.
  const FORBIDDEN_IN_LABEL = /[(){}&%/\-:#;]/;

  // ─── Step 0: escape inner quotes inside already-quoted node labels ───────────
  // The AI sometimes emits:  A["label with "quoted" word"]
  // Mermaid's parser sees the second `"` as closing the label → STR token crash.
  // Fix: replace any `"` that sits INSIDE a quoted label with `&quot;`.
  // Strategy: find every bracketed shape that opens with `["`, `{["`, etc. and
  // scan forward character-by-character to find inner quotes that are NOT the
  // closing quote of the whole label.
  chart = chart.replace(
    // Match: opening bracket(s) + opening quote  →  capture everything until newline
    /((?:\[|\{|\()+)"([^"\n]*"[^"\n]*)"/g,
    (_match, brackets: string, inner: string) => {
      // `inner` is everything between the outer quotes (may contain more `"`).
      // Escape each `"` inside to &quot; so Mermaid won't treat them as delimiters.
      const escaped = inner.replace(/"/g, "&quot;");
      return `${brackets}"${escaped}"`;
    },
  );

  const quoteInner = (open: string, inner: string, close: string): string => {
    const trimmed = inner.trim();
    if (!trimmed) return `${open}${inner}${close}`;
    // Already quoted — leave as-is (inner quotes already escaped above).
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) return `${open}${inner}${close}`;
    if (FORBIDDEN_IN_LABEL.test(trimmed)) {
      // Mermaid has no escape for a literal `"` inside a quoted label; downgrade to `'`.
      return `${open}"${trimmed.replace(/"/g, "'")}"${close}`;
    }
    return `${open}${inner}${close}`;
  };

  // Ordered alternation: compound (two-char) delimiters MUST come before the
  // single-char ones so `[(`, `[[`, `((`, `([`, `{{` are matched as a whole.
  const NODE_SHAPE =
    /([A-Za-z0-9_]+)(\[\([^\]]*?\)\]|\[\[[^\]]*?\]\]|\(\([^)]*?\)\)|\(\[[^\]]*?\]\)|\{\{[^}]*?\}\}|\[[^\][]*?\]|\{[^{}]*?\}|\([^()]*?\))/g;
  const DELIMITERS: [string, string][] = [
    ["[(", ")]"], // cylinder
    ["[[", "]]"], // subroutine
    ["((", "))"], // circle
    ["([", "])"], // stadium
    ["{{", "}}"], // hexagon
    ["[", "]"], // rectangle
    ["{", "}"], // rhombus / decision
    ["(", ")"], // rounded
  ];

  let safeChart = chart.replace(NODE_SHAPE, (match, id: string, shape: string) => {
    const pair = DELIMITERS.find(([open]) => shape.startsWith(open));
    if (!pair) return match;
    const [open, close] = pair;
    const inner = shape.slice(open.length, shape.length - close.length);
    return id + quoteInner(open, inner, close);
  });

  // Edge labels `-->|label|`: only quote when they carry delimiter-breaking
  // characters that genuinely crash the parser (parens/braces/ampersand/hash).
  // Colons, plus signs and slashes render fine in edge labels, so leave those.
  safeChart = safeChart.replace(/\|([^|\n]+)\|/g, (match, text: string) => {
    const trimmed = text.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) return match;
    if (/[(){}&#]/.test(trimmed)) {
      return `|"${trimmed.replace(/"/g, "'")}"|`;
    }
    return match;
  });

  return safeChart;
};
