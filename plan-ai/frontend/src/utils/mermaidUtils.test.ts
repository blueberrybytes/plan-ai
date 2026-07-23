import { repairMermaidSyntax } from "./mermaidUtils";

describe("repairMermaidSyntax — quotes inside labels", () => {
  // Regression: the AI emitted `B{AI Agent "Berry"}`. Mermaid's lexer reads the
  // inner `"` as the start of a STR token and crashes expecting DIAMOND_STOP.
  // Neither the step-0 escape (which only matches a quote directly after the
  // bracket) nor FORBIDDEN_IN_LABEL caught it, so it reached the parser raw.
  it("quotes a rhombus label containing a quoted name", () => {
    const repaired = repairMermaidSyntax('graph TD\n    A --> B{AI Agent "Berry"}');
    expect(repaired).toContain(`B{"AI Agent 'Berry'"}`);
  });

  it("handles the same case in every shape", () => {
    expect(repairMermaidSyntax('graph TD\n    A[Agent "Berry"]')).toContain(`A["Agent 'Berry'"]`);
    expect(repairMermaidSyntax('graph TD\n    A(Agent "Berry")')).toContain(`A("Agent 'Berry'")`);
    expect(repairMermaidSyntax('graph TD\n    A[[Agent "Berry"]]')).toContain(
      `A[["Agent 'Berry'"]]`,
    );
  });

  it("quotes an edge label containing a quote", () => {
    const repaired = repairMermaidSyntax('graph TD\n    A -->|says "hi"| B');
    expect(repaired).toContain(`|"says 'hi'"|`);
  });

  it("leaves an already-quoted label untouched", () => {
    const chart = 'graph TD\n    A["Menu (Client)"] --> B';
    expect(repairMermaidSyntax(chart)).toBe(chart);
  });

  it("leaves a plain unquoted label unquoted", () => {
    const chart = "graph TD\n    A[User DB] --> B";
    expect(repairMermaidSyntax(chart)).toBe(chart);
  });

  it("does not touch non-flowchart diagrams", () => {
    // xychart arrays legitimately carry quotes — repairing them corrupts the source.
    const chart = 'xychart-beta\n    x-axis ["Jan", "Feb"]';
    expect(repairMermaidSyntax(chart)).toBe(chart);
  });
});
