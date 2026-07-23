import { describe, it, expect } from "vitest";
import { resolveLang, berryStrings } from "../telegramI18n";

describe("resolveLang", () => {
  it("maps English tags to en", () => {
    expect(resolveLang("en")).toBe("en");
    expect(resolveLang("en-US")).toBe("en");
    expect(resolveLang("en-GB")).toBe("en");
  });

  it("maps Spanish tags to es", () => {
    expect(resolveLang("es")).toBe("es");
    expect(resolveLang("es-ES")).toBe("es");
    expect(resolveLang("es-419")).toBe("es");
  });

  /** Catalan prospects read Spanish — group them rather than default to English. */
  it("maps Catalan to es", () => {
    expect(resolveLang("ca")).toBe("es");
  });

  /**
   * Default is English: most prospects are English-speaking, so an unknown or
   * missing tag must never surface Spanish chrome to them.
   */
  it("defaults unknown or missing tags to en", () => {
    expect(resolveLang("fr")).toBe("en");
    expect(resolveLang("de")).toBe("en");
    expect(resolveLang(undefined)).toBe("en");
    expect(resolveLang("")).toBe("en");
  });
});

describe("berryStrings", () => {
  it("returns English chrome for en", () => {
    const t = berryStrings("en");
    expect(t.greeting).toContain("Berry");
    expect(t.greeting).not.toContain("Hola");
    expect(t.deckChallenge).toBe("The challenge");
  });

  it("returns Spanish chrome for es", () => {
    const t = berryStrings("es");
    expect(t.greeting).toContain("Hola");
    expect(t.deckChallenge).toBe("El reto");
  });

  it("localizes the variant labels", () => {
    expect(berryStrings("en").variantLabel("Claro")).toBe("Light");
    expect(berryStrings("en").variantLabel("Oscuro")).toBe("Dark");
    expect(berryStrings("es").variantLabel("Claro")).toBe("Claro");
  });

  it("builds localized dynamic labels", () => {
    expect(berryStrings("en").openPrototypeLabel("Light")).toBe("Open Light prototype");
    expect(berryStrings("es").openPrototypeLabel("Claro")).toBe("Abrir prototipo Claro");
  });

  it("covers every string key in both locales", () => {
    const en = berryStrings("en");
    const es = berryStrings("es");
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });
});
