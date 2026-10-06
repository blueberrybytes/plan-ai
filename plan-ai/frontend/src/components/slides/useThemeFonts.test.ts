import { loadThemeFont, themeFontHref } from "./useThemeFonts";
import { FONT_OPTIONS } from "./themePresets";

const PRELOADED = ["Inter", "Montserrat", "Nunito"];

describe("themeFontHref", () => {
  it("has a stylesheet for every offered font that index.html does not load", () => {
    FONT_OPTIONS.filter((f) => !PRELOADED.includes(f)).forEach((font) => {
      expect(themeFontHref(font)).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?family=/);
    });
    expect(themeFontHref("Open Sans")).toContain("family=Open+Sans:wght@");
  });

  it("gives nothing for preloaded fonts and for names outside the list", () => {
    PRELOADED.forEach((font) => expect(themeFontHref(font)).toBeNull());
    expect(themeFontHref("Comic Sans MS")).toBeNull();
    expect(themeFontHref("Roboto&family=Evil")).toBeNull();
    expect(themeFontHref("https://example.com/x.css")).toBeNull();
    expect(themeFontHref(undefined)).toBeNull();
  });
});

describe("loadThemeFont", () => {
  const links = () => Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'));

  it("adds the stylesheet once per font", () => {
    loadThemeFont("Poppins");
    loadThemeFont("Poppins");
    loadThemeFont("Lato");

    const hrefs = links().map((l) => l.getAttribute("href"));
    expect(hrefs.filter((h) => h?.includes("family=Poppins"))).toHaveLength(1);
    expect(hrefs.filter((h) => h?.includes("family=Lato"))).toHaveLength(1);
  });

  it("adds nothing for a name outside the list", () => {
    const before = links().length;
    loadThemeFont("Wingdings");
    expect(links()).toHaveLength(before);
  });
});
