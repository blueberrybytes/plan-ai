import { describe, it, expect } from "vitest";
import { buildSalesDeck, DEFAULT_DECK_THEME } from "../salesDeck";

/** .pptx is a zip; every valid one starts with the PK local-file header. */
const isPptx = (buffer: Buffer): boolean =>
  buffer.length > 1000 && buffer[0] === 0x50 && buffer[1] === 0x4b;

describe("buildSalesDeck", () => {
  it("produces a valid pptx from a minimal proposal", async () => {
    const deck = await buildSalesDeck({
      title: "Comandas para restaurante",
      summary: "El restaurante pierde comandas entre sala y cocina.",
      scope: ["App de sala", "Pantalla de cocina"],
    });
    expect(isPptx(deck)).toBe(true);
  });

  it("survives an empty scope (no bullets slide)", async () => {
    const deck = await buildSalesDeck({ title: "Sin alcance", summary: "Resumen.", scope: [] });
    expect(isPptx(deck)).toBe(true);
  });

  it("embeds a diagram when one is supplied", async () => {
    // 1x1 transparent PNG — enough to exercise the addImage path.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    );
    const withDiagram = await buildSalesDeck({
      title: "Con diagrama",
      summary: "Resumen.",
      scope: ["Uno"],
      diagramPng: png,
    });
    const without = await buildSalesDeck({
      title: "Con diagrama",
      summary: "Resumen.",
      scope: ["Uno"],
    });
    expect(isPptx(withDiagram)).toBe(true);
    expect(withDiagram.length).toBeGreaterThan(without.length);
  });

  it("tolerates a malformed theme colour instead of emitting a broken file", async () => {
    const deck = await buildSalesDeck({
      title: "Tema roto",
      summary: "Resumen.",
      scope: ["Uno"],
      theme: { ...DEFAULT_DECK_THEME, primaryColor: "not-a-color", headingFont: "SomeWebFont" },
    });
    expect(isPptx(deck)).toBe(true);
  });
});
