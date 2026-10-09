import JSZip from "jszip";
import { buildFontTableXml, fallbackFor, withFontFallbacks } from "./docxFontFallback";

describe("fallbackFor", () => {
  it("treats brand fonts as sans-serif unless they are known not to be", () => {
    expect(fallbackFor("Outfit")).toMatchObject({ family: "swiss", altName: "Arial" });
    expect(fallbackFor("  dm sans ")).toMatchObject({ family: "swiss" });
    expect(fallbackFor("Some Custom Font")).toMatchObject({ family: "swiss" });
    expect(fallbackFor("Playfair Display")).toMatchObject({ family: "roman", altName: "Georgia" });
    expect(fallbackFor("JetBrains Mono")).toMatchObject({ family: "modern", pitch: "fixed" });
  });
});

describe("buildFontTableXml", () => {
  it("declares one entry per font, without repeats, in schema order", () => {
    const xml = buildFontTableXml(["Outfit", "DM Sans", "Outfit", " "]);
    expect(xml.match(/<w:font /g)).toHaveLength(2);
    expect(xml).toContain(
      '<w:font w:name="Outfit"><w:altName w:val="Arial"/><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>',
    );
  });

  it("escapes a font name that holds markup", () => {
    expect(buildFontTableXml(['A&B "<x>"'])).toContain('w:name="A&amp;B &quot;&lt;x&gt;&quot;"');
  });
});

describe("withFontFallbacks", () => {
  const makeDocx = async (withTable: boolean): Promise<ArrayBuffer> => {
    const zip = new JSZip();
    zip.file("word/document.xml", "<w:document/>");
    if (withTable) zip.file("word/fontTable.xml", "<w:fonts/>");
    return zip.generateAsync({ type: "arraybuffer" });
  };

  it("rewrites the font table and leaves the rest of the file alone", async () => {
    const out = await withFontFallbacks(await makeDocx(true), ["Outfit", "Merriweather"]);
    const zip = await JSZip.loadAsync(out);
    const table = await zip.file("word/fontTable.xml")?.async("string");
    expect(table).toContain('w:name="Outfit"');
    expect(table).toContain('<w:family w:val="roman"/>');
    expect(await zip.file("word/document.xml")?.async("string")).toBe("<w:document/>");
  });

  it("returns the file untouched when it has no font table or is not a zip", async () => {
    const noTable = await makeDocx(false);
    expect(await withFontFallbacks(noTable, ["Outfit"])).toBe(noTable);
    const notZip = Uint8Array.from([110, 111, 116, 32, 122, 105, 112]).buffer;
    expect(await withFontFallbacks(notZip, ["Outfit"])).toBe(notZip);
  });
});
