import { describe, it, expect, vi, afterEach } from "vitest";
import { extractMermaidBlocks, renderMermaidToPng, stripMermaidBlocks } from "../mermaidRender";

const DOC = `# Propuesta

Resumen del alcance.

\`\`\`mermaid
graph TD
    A["Camarero"] --> B["Cocina"]
\`\`\`

## Fases

\`\`\`mermaid
sequenceDiagram
    A->>B: comanda
\`\`\`

Fin.
`;

describe("extractMermaidBlocks", () => {
  it("pulls every fenced diagram out in order", () => {
    const blocks = extractMermaidBlocks(DOC);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("graph TD");
    expect(blocks[1]).toContain("sequenceDiagram");
  });

  it("returns an empty list when there is no diagram", () => {
    expect(extractMermaidBlocks("# Solo texto\n\nSin diagramas.")).toEqual([]);
  });

  it("ignores other fenced languages", () => {
    expect(extractMermaidBlocks("```ts\nconst a = 1;\n```")).toEqual([]);
  });
});

describe("stripMermaidBlocks", () => {
  it("removes the diagrams so the docx does not repeat them as raw code", () => {
    const stripped = stripMermaidBlocks(DOC);
    expect(stripped).not.toContain("graph TD");
    expect(stripped).not.toContain("sequenceDiagram");
    expect(stripped).toContain("# Propuesta");
    expect(stripped).toContain("## Fases");
  });

  it("collapses the gap left behind rather than leaving blank runs", () => {
    expect(stripMermaidBlocks(DOC)).not.toMatch(/\n{3,}/);
  });

  it("leaves a diagram-free document untouched", () => {
    const plain = "# Título\n\nContenido.";
    expect(stripMermaidBlocks(plain)).toBe(plain);
  });
});

describe("renderMermaidToPng — request shape", () => {
  afterEach(() => vi.unstubAllGlobals());

  const capture = (body: Buffer, contentType = "image/png") => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return {
          ok: true,
          headers: { get: () => contentType },
          arrayBuffer: async () =>
            body.buffer.slice(body.byteOffset, body.byteOffset + body.length),
        };
      }),
    );
    return calls;
  };

  /**
   * Regression guard. The original implementation fetched `/svg/` and rasterized
   * locally, but mermaid puts node labels in <foreignObject>, which librsvg does
   * not implement — every diagram shipped to a prospect had NO TEXT on it.
   */
  it("asks mermaid.ink for PNG, never SVG", async () => {
    const calls = capture(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]));
    await renderMermaidToPng('graph TD\n  A["Hola"] --> B');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/img/");
    expect(calls[0]).toContain("type=png");
    expect(calls[0]).not.toContain("/svg/");
  });

  it("encodes as base64url so accented labels cannot break the URL path", async () => {
    // Standard base64 of this text contains "/" — which would split the path.
    const code = 'graph TD\n  A["Gestión de operación ñ"] --> B["Informes"]';
    const calls = capture(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]));
    await renderMermaidToPng(code);

    const payload = calls[0].split("/img/")[1].split("?")[0];
    expect(payload).not.toContain("/");
    expect(payload).not.toContain("+");
    expect(Buffer.from(payload, "base64url").toString("utf-8")).toBe(code);
  });

  it("rejects a non-PNG body even when the status is 200", async () => {
    capture(Buffer.from("<svg>error page</svg>"), "image/svg+xml");
    expect(await renderMermaidToPng("graph TD\n  A --> B")).toBeNull();
  });
});
