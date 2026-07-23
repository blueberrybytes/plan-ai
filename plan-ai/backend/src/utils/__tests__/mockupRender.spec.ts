import { describe, it, expect } from "vitest";
import { buildMockupSvg, isRenderableSpec, MOCKUP_PALETTES } from "../mockupRender";
import { stripUnrenderable, svgText } from "../textSanitize";
import type { MockupSpec } from "../mockupRender";

const spec = (overrides: Partial<MockupSpec> = {}): MockupSpec => ({
  appName: "TapaGo",
  screenTitle: "Comandas",
  primaryAction: "Nueva comanda",
  rows: [{ label: "Mesa 4", meta: "Pendiente · 3 min" }],
  stats: ["Abiertas", "En cocina", "Servidas"],
  ...overrides,
});

describe("stripUnrenderable", () => {
  /**
   * U+FE0F makes librsvg/pango abort() the whole process — SIGTRAP, exit 133,
   * uncatchable. A prospect typing one emoji into Telegram would otherwise take
   * down the API and every in-process worker.
   */
  it("removes variation selectors, the known process-abort trigger", () => {
    expect(stripUnrenderable("Comandas 🍽️")).not.toContain("️");
    expect(stripUnrenderable("⚙️ Config")).not.toContain("️");
  });

  it("keeps accents, ñ and CJK — only the presentation modifiers go", () => {
    expect(stripUnrenderable("Menú del día ñ 你好")).toBe("Menú del día ñ 你好");
  });

  it("strips zero-width joiners and control characters", () => {
    expect(stripUnrenderable("a‍bc")).toBe("abc");
  });
});

describe("svgText", () => {
  it("escapes XML so a quote cannot break out of the document", () => {
    expect(svgText('Bar "El Rincón" & Grill')).toBe("Bar &quot;El Rincón&quot; &amp; Grill");
  });

  it("escapes angle brackets so injected markup cannot become an element", () => {
    expect(svgText("<script>alert(1)</script>")).not.toContain("<script>");
  });

  it("truncates to the cap", () => {
    expect(svgText("x".repeat(500), 10)).toHaveLength(10);
  });
});

describe("buildMockupSvg", () => {
  it("produces well-formed SVG with the spec content", () => {
    const svg = buildMockupSvg(spec(), MOCKUP_PALETTES[0]);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).toContain("TapaGo");
    expect(svg).toContain("Nueva comanda");
  });

  it("never emits a raw variation selector, whatever the model returned", () => {
    const svg = buildMockupSvg(
      spec({
        appName: "Comandas 🍽️",
        screenTitle: "Sala ⚙️",
        rows: [{ label: "Café ☕️", meta: "Listo ✅️" }],
      }),
      MOCKUP_PALETTES[0],
    );
    expect(svg).not.toContain("️");
  });

  it("does not let injected markup survive into the document", () => {
    const svg = buildMockupSvg(
      spec({ appName: '"><script>alert(1)</script><text x="' }),
      MOCKUP_PALETTES[0],
    );
    expect(svg).not.toContain("<script>");
  });

  it("grows the canvas with the row count instead of leaving dead space", () => {
    const short = buildMockupSvg(spec(), MOCKUP_PALETTES[0]);
    const tall = buildMockupSvg(
      spec({ rows: Array.from({ length: 6 }, (_, i) => ({ label: `M${i}`, meta: "x" })) }),
      MOCKUP_PALETTES[0],
    );
    const heightOf = (svg: string) => Number(svg.match(/height="(\d+)"/)![1]);
    expect(heightOf(tall)).toBeGreaterThan(heightOf(short));
  });

  it("caps rows so a chatty model cannot produce an endless screen", () => {
    const svg = buildMockupSvg(
      spec({ rows: Array.from({ length: 30 }, (_, i) => ({ label: `Row ${i}`, meta: "x" })) }),
      MOCKUP_PALETTES[0],
    );
    expect(svg).not.toContain("Row 6");
  });

  it("offers two visibly different palettes", () => {
    expect(MOCKUP_PALETTES).toHaveLength(2);
    expect(MOCKUP_PALETTES[0].surface).not.toBe(MOCKUP_PALETTES[1].surface);
  });
});

describe("isRenderableSpec", () => {
  it("accepts a complete spec", () => {
    expect(isRenderableSpec(spec())).toBe(true);
  });

  it("rejects a spec whose text is only unrenderable characters", () => {
    expect(isRenderableSpec(spec({ appName: "️‍" }))).toBe(false);
  });

  it("rejects empty rows", () => {
    expect(isRenderableSpec(spec({ rows: [{ label: "", meta: "" }] }))).toBe(false);
  });
});
