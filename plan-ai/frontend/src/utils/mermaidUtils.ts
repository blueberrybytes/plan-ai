export interface MermaidThemeOptions {
  id: string;
  bg: string;
  primary: string;
  secondary: string;
  canvasTextColor: string;
  nodeTextColor: string;
  secondaryTextColor: string;
}

export const injectMermaidThemeStyles = (svg: string, options: MermaidThemeOptions): string => {
  const { id, bg, primary, secondary, canvasTextColor, nodeTextColor, secondaryTextColor } =
    options;

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

      /* Architecture */
      #${id} .arch-node rect, #${id} .arch-node-bg { fill: ${primary} !important; }
      #${id} .arch-node text, #${id} .arch-node tspan { fill: ${nodeTextColor} !important; color: ${nodeTextColor} !important; }
      #${id} .arch-edge { stroke: ${secondary} !important; }
      
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
 * Converts things like R[Traveler Portal (Web/Native)] to R["Traveler Portal (Web/Native)"]
 * preventing fatal parsing crashes caused by unescaped parentheses or slashes.
 */
export const repairMermaidSyntax = (chart: string): string => {
  let safeChart = chart;

  // Fix square brackets: A[Some text (with parens)] -> A["Some text (with parens)"]
  safeChart = safeChart.replace(/([A-Za-z0-9_]+)\[([^\]"]+)\]/g, (match, id, text) => {
    if (text.startsWith('"') && text.endsWith('"')) return match;
    if (/[(){}&%/-]/.test(text)) {
      return `${id}["${text}"]`;
    }
    return match;
  });

  // Fix round shapes: A(Some text) -> A("Some text") if containing forbidden internal chars
  // Mermaid's native regex has a hard time with text containing slashes in A(...) blocks.
  safeChart = safeChart.replace(/([A-Za-z0-9_]+)\(([^)"]+)\)/g, (match, id, text) => {
    if (text.startsWith('"') && text.endsWith('"')) return match;
    if (/[(){}&%/-]/.test(text)) {
      return `${id}("${text}")`;
    }
    return match;
  });

  return safeChart;
};
