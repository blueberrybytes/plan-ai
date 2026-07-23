import { describe, it, expect } from "vitest";
import { extractBullets, extractSummary } from "../docOutline";

const DOC = `# Propuesta de comandas

El restaurante pierde comandas entre sala y cocina, con **errores** frecuentes
en hora punta.

## Alcance

- App de sala para tomar la comanda
- Pantalla de cocina en tiempo real
  - con sonido de aviso
- Informes de servicio

\`\`\`mermaid
graph TD
    A["Sala"] --> B["Cocina"]
\`\`\`

- Integración con el TPV
`;

describe("extractSummary", () => {
  it("takes the first real paragraph, skipping the heading", () => {
    const summary = extractSummary(DOC);
    expect(summary).toContain("pierde comandas");
    expect(summary).not.toContain("#");
  });

  it("strips inline markdown so PowerPoint shows clean text", () => {
    expect(extractSummary(DOC)).toContain("errores");
    expect(extractSummary(DOC)).not.toContain("**");
  });

  it("respects the character cap", () => {
    const long = `# T\n\n${"palabra ".repeat(300)}`;
    expect(extractSummary(long, 100).length).toBeLessThanOrEqual(100);
  });

  it("returns empty string for a document with no prose", () => {
    expect(extractSummary("# Solo\n\n## Encabezados\n\n- y listas")).toBe("");
  });
});

describe("extractBullets", () => {
  it("collects top-level bullets in document order", () => {
    const bullets = extractBullets(DOC);
    expect(bullets[0]).toBe("App de sala para tomar la comanda");
    expect(bullets[1]).toBe("Pantalla de cocina en tiempo real");
  });

  it("skips nested sub-bullets", () => {
    expect(extractBullets(DOC)).not.toContain("con sonido de aviso");
  });

  it("ignores list-looking lines inside fenced code", () => {
    const bullets = extractBullets("```\n- not a bullet\n```\n\n- real bullet");
    expect(bullets).toEqual(["real bullet"]);
  });

  it("honours the limit", () => {
    expect(extractBullets(DOC, 2)).toHaveLength(2);
  });

  it("handles numbered lists too", () => {
    expect(extractBullets("1. primero\n2. segundo")).toEqual(["primero", "segundo"]);
  });
});
