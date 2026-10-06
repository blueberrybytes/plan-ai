import {
  MAX_DIAGRAM_UPSCALE,
  MIN_TEXT_CONTRAST,
  SERIES_SIZE,
  buildMermaidPalette,
  buildMermaidTheme,
  buildMermaidThemeCss,
  computeFitScale,
  contrastRatio,
  ensureContrast,
  fitSvgToBox,
  injectMermaidThemeStyles,
  mixHex,
  normalizeHex,
  readSvgSize,
  readableTextOn,
  relativeLuminance,
  type MermaidBrandTheme,
} from "./mermaidTheme";
import { sanitizeMermaidSvg } from "./sanitizeSvg";

const APP_DEFAULTS = { primary: "#4361EE", secondary: "#8fa2f5", background: "#13161e" };

// Brand themes that cover the cases that matter: a dark primary on a light
// background (the reported one), a light primary on a light background, a dark
// slide, two brand colours that are the same, and a theme whose own text
// colour cannot be read on its background.
const THEMES: Record<string, MermaidBrandTheme> = {
  darkPrimaryOnLight: {
    primaryColor: "#1e3a8a",
    secondaryColor: "#f97316",
    backgroundColor: "#ffffff",
  },
  lightPrimaryOnLight: {
    primaryColor: "#fde047",
    secondaryColor: "#0ea5e9",
    backgroundColor: "#fafafa",
  },
  darkSlide: { primaryColor: "#6366f1", secondaryColor: "#a78bfa", backgroundColor: "#0f172a" },
  sameColours: { primaryColor: "#0f172a", secondaryColor: "#0f172a", backgroundColor: "#0f172a" },
  unreadableText: {
    primaryColor: "#7c3aed",
    secondaryColor: "#0d9488",
    backgroundColor: "#ffffff",
    textColor: "#fefefe",
  },
};

// Colours Mermaid or the old renderer used when nothing was set. None of them
// may show up in a themed diagram.
const LEAKS = [
  "#7cfc00", // journey actor, lime
  "#8fbc8f", // journey actor, grey green
  "#fff8dc", // journey face
  "#087ebf", // architecture icon box
  "#1f77b4", // d3 category blue
  "#4e79a7", // d3 tableau blue, sankey nodes
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#84cc16", // old hard coded series palette
];

const str = (vars: Record<string, unknown>, key: string): string => {
  const value = vars[key];
  if (typeof value !== "string") throw new Error(`${key} is not set`);
  return value;
};

describe("colour helpers", () => {
  it("normalises the colour formats the app produces", () => {
    expect(normalizeHex("#FFF")).toBe("#ffffff");
    expect(normalizeHex("#1E3A8A")).toBe("#1e3a8a");
    expect(normalizeHex("#1e3a8acc")).toBe("#1e3a8a");
    expect(normalizeHex("rgba(0, 0, 0, 0.87)")).toBe("#000000");
    expect(normalizeHex("rgb(30 58 138)")).toBe("#1e3a8a");
    expect(normalizeHex("tomato")).toBeNull();
    expect(normalizeHex(undefined)).toBeNull();
  });

  it("computes WCAG luminance and contrast", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
    // Reference value from the WCAG contrast checker.
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
  });

  it("mixes two colours", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("picks a readable text colour on any fill", () => {
    expect(readableTextOn("#1e3a8a")).toBe("#ffffff");
    expect(readableTextOn("#fde047")).toBe("#1a1a1a");
    // The preferred colour is kept only when it reads.
    expect(readableTextOn("#ffffff", "#334155")).toBe("#334155");
    expect(readableTextOn("#ffffff", "#fefefe")).toBe("#1a1a1a");
    // No grey is left without a readable label.
    for (let v = 0; v <= 255; v++) {
      const grey = `#${v.toString(16).padStart(2, "0").repeat(3)}`;
      expect(contrastRatio(readableTextOn(grey), grey)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  it("moves a colour until it reaches the wanted contrast", () => {
    const fixed = ensureContrast("#eeeeee", "#ffffff", 3, "#000000");
    expect(contrastRatio(fixed, "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(ensureContrast("#000000", "#ffffff", 3, "#000000")).toBe("#000000");
  });
});

describe.each(Object.entries(THEMES))("brand theme %s", (_name, theme) => {
  const { palette, themeVariables: vars, er, sankey } = buildMermaidTheme(theme, APP_DEFAULTS);
  const on = (label: string, fill: string) => contrastRatio(str(vars, label), str(vars, fill));

  it("keeps the brand colours", () => {
    expect(palette.primary).toBe(normalizeHex(theme.primaryColor));
    expect(palette.secondary).toBe(normalizeHex(theme.secondaryColor));
    expect(palette.background).toBe(normalizeHex(theme.backgroundColor));
    expect(vars.primaryColor).toBe(palette.primary);
    expect(vars.secondaryColor).toBe(palette.secondary);
    expect(vars.background).toBe(palette.background);
  });

  it("has readable text on the background and on both brand colours", () => {
    expect(contrastRatio(palette.text, palette.background)).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
    expect(contrastRatio(palette.onPrimary, palette.primary)).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
    expect(contrastRatio(palette.onSecondary, palette.secondary)).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
    expect(contrastRatio(palette.text, palette.surface)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it("draws lines that can be seen on the background", () => {
    expect(contrastRatio(palette.line, palette.background)).toBeGreaterThanOrEqual(3);
    for (const key of ["lineColor", "arrowheadColor", "archEdgeColor", "archEdgeArrowColor"]) {
      expect(vars[key]).toBe(palette.line);
    }
  });

  it("gives every series fill a readable label and keeps it visible", () => {
    expect(palette.series).toHaveLength(SERIES_SIZE);
    palette.series.forEach((fill, i) => {
      expect(contrastRatio(palette.seriesText[i], fill)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      expect(contrastRatio(fill, palette.background)).toBeGreaterThanOrEqual(1.25);
    });
  });

  it("covers kanban, timeline and mindmap (cScale) with readable labels", () => {
    for (let i = 0; i < SERIES_SIZE; i++) {
      expect(vars[`cScale${i}`]).toBe(palette.series[i]);
      expect(on(`cScaleLabel${i}`, `cScale${i}`)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      expect(str(vars, `cScaleInv${i}`)).toMatch(/^#[0-9a-f]{6}$/);
      expect(str(vars, `cScalePeer${i}`)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("covers journey sections, actors and faces", () => {
    for (let i = 0; i < 8; i++) expect(vars[`fillType${i}`]).toBe(palette.series[i]);
    for (let i = 0; i < 6; i++) expect(palette.series).toContain(vars[`actor${i}`]);
    expect(vars.faceColor).toBe(palette.background);
  });

  it("covers architecture edges and group borders", () => {
    expect(vars.archEdgeColor).toBe(palette.line);
    expect(vars.archEdgeArrowColor).toBe(palette.line);
    expect(vars.archGroupBorderColor).toBe(palette.line);
    expect(vars.archEdgeWidth).toBeDefined();
    expect(vars.archGroupBorderWidth).toBeDefined();
  });

  it("covers pie, git graph, quadrant, xy chart, er and sankey", () => {
    for (let i = 1; i <= 12; i++) expect(vars[`pie${i}`]).toBe(palette.series[i - 1]);
    expect(on("pieLegendTextColor", "background")).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    for (let i = 0; i < 8; i++) {
      expect(vars[`git${i}`]).toBe(palette.series[i]);
      expect(on(`gitBranchLabel${i}`, `git${i}`)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
    expect(on("commitLabelColor", "commitLabelBackground")).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
    expect(on("tagLabelColor", "tagLabelBackground")).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    for (let i = 1; i <= 4; i++) {
      expect(on(`quadrant${i}TextFill`, `quadrant${i}Fill`)).toBeGreaterThanOrEqual(
        MIN_TEXT_CONTRAST,
      );
      expect(on("quadrantPointTextFill", `quadrant${i}Fill`)).toBeGreaterThanOrEqual(
        MIN_TEXT_CONTRAST,
      );
    }
    const xy = vars.xyChart as Record<string, string>;
    expect(xy.plotColorPalette.split(", ")).toEqual(palette.series.slice(0, 10));
    expect(contrastRatio(xy.xAxisLabelColor, palette.background)).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
    expect(er.fill).toBe(palette.primary);
    expect(sankey.linkColor).toBe(palette.line);
  });

  it("has readable labels on nodes, notes, actors, states, rows and tasks", () => {
    const pairs: [string, string][] = [
      ["primaryTextColor", "primaryColor"],
      ["nodeTextColor", "mainBkg"],
      ["secondaryTextColor", "secondaryColor"],
      ["tertiaryTextColor", "tertiaryColor"],
      ["titleColor", "clusterBkg"],
      ["textColor", "background"],
      ["textColor", "edgeLabelBackground"],
      ["noteTextColor", "noteBkgColor"],
      ["classText", "mainBkg"],
      ["actorTextColor", "actorBkg"],
      ["signalTextColor", "background"],
      ["labelTextColor", "labelBoxBkgColor"],
      ["stateLabelColor", "stateBkg"],
      ["transitionLabelColor", "background"],
      ["relationLabelColor", "relationLabelBackground"],
      ["nodeTextColor", "rowOdd"],
      ["nodeTextColor", "rowEven"],
      ["taskTextColor", "taskBkgColor"],
      ["taskTextDarkColor", "doneTaskBkgColor"],
      ["taskTextOutsideColor", "background"],
      ["taskTextDarkColor", "sectionBkgColor"],
    ];
    for (const [label, fill] of pairs) {
      expect([label, fill, on(label, fill) >= MIN_TEXT_CONTRAST]).toEqual([label, fill, true]);
    }
  });

  it("turns off gradients and drop shadows", () => {
    expect(vars.useGradient).toBe(false);
    expect(vars.dropShadow).toBe("none");
  });

  it("does not leak a default colour into the variables or the css", () => {
    const css = buildMermaidThemeCss("m1", palette).toLowerCase();
    const all = JSON.stringify(vars).toLowerCase() + css;
    // The gantt critical colour is a fixed amber on purpose.
    const allowed = [str(vars, "critBkgColor"), str(vars, "critBorderColor")];
    for (const leak of LEAKS) {
      if (allowed.includes(leak)) continue;
      // The architecture rule names the default blue in its selector to replace it.
      const cleaned = all.split('[style*="#087ebf"]').join("");
      expect([leak, cleaned.includes(leak)]).toEqual([leak, false]);
    }
  });

  it("only passes hex colours to Mermaid, which ignores every other format", () => {
    for (const [key, value] of Object.entries(vars)) {
      if (
        typeof value !== "string" ||
        !/(color|bkg|fill|background|^pie\d|^git\d|^cscale)/i.test(key)
      )
        continue;
      if (key === "pieOpacity") continue;
      expect([key, /^#[0-9a-f]{6}$/.test(value)]).toEqual([key, true]);
    }
  });
});

describe("palette fallbacks", () => {
  it("uses the app theme when there is no brand theme", () => {
    const palette = buildMermaidPalette(null, APP_DEFAULTS);
    expect(palette.primary).toBe("#4361ee");
    expect(palette.secondary).toBe("#8fa2f5");
    expect(palette.background).toBe("#13161e");
    expect(palette.isDark).toBe(true);
    expect(palette.text).toBe("#ffffff");
  });

  it("fills in only the colours the brand theme leaves out", () => {
    const palette = buildMermaidPalette({ primaryColor: "#1e3a8a" }, APP_DEFAULTS);
    expect(palette.primary).toBe("#1e3a8a");
    expect(palette.secondary).toBe("#8fa2f5");
  });

  it("drops a brand text colour that cannot be read on the background", () => {
    expect(buildMermaidPalette(THEMES.unreadableText, APP_DEFAULTS).text).toBe("#1a1a1a");
    const kept = buildMermaidPalette(
      { backgroundColor: "#ffffff", textColor: "#334155" },
      APP_DEFAULTS,
    );
    expect(kept.text).toBe("#334155");
  });

  it("separates the series when both brand colours are the same", () => {
    const { series } = buildMermaidPalette(THEMES.sameColours, APP_DEFAULTS);
    expect(contrastRatio(series[0], series[1])).toBeGreaterThan(1.15);
  });

  it("uses the brand body font and strips characters that could break the css", () => {
    expect(buildMermaidPalette({ bodyFont: "Poppins" }, APP_DEFAULTS).fontFamily).toBe(
      '"Poppins", "Inter", "Roboto", sans-serif',
    );
    expect(buildMermaidPalette({ bodyFont: 'x"; } body {' }, APP_DEFAULTS).fontFamily).toBe(
      '"x  body", "Inter", "Roboto", sans-serif',
    );
    expect(buildMermaidPalette(null, APP_DEFAULTS).fontFamily).toBe(
      '"Inter", "Roboto", sans-serif',
    );
  });
});

describe("residual css", () => {
  const { palette } = buildMermaidTheme(THEMES.darkPrimaryOnLight, APP_DEFAULTS);
  const css = buildMermaidThemeCss("m1", palette);

  it("repaints the architecture icon box with the primary colour", () => {
    expect(css).toContain(
      `#m1[aria-roledescription="architecture"] [style*="#087ebf"], #m1[aria-roledescription="architecture"] [style*="rgb(8, 126, 191)"] { fill: ${palette.primary} !important; }`,
    );
    expect(css).toContain(`[style*="stroke: #fff"]`);
  });

  it("sets a label colour per journey fill and per kanban column", () => {
    for (let i = 0; i < 8; i++) {
      expect(css).toContain(
        `#m1[aria-roledescription="journey"] rect.task-type-${i} ~ switch div { color: ${palette.seriesText[i]} !important; }`,
      );
    }
    // Kanban numbers its columns from 1.
    for (let i = 0; i < SERIES_SIZE; i++) {
      expect(css).toContain(
        `#m1[aria-roledescription="kanban"] .section-${i + 1} > rect { fill: ${palette.series[i]} !important;`,
      );
    }
  });

  it("writes block labels in the colour that reads on the primary fill", () => {
    expect(css).toContain(`#m1[aria-roledescription="block"] .node .label p`);
    expect(css).toContain(
      `{ color: ${palette.onPrimary} !important; fill: ${palette.onPrimary} !important; }`,
    );
  });

  it("has no gradient, shadow or comment", () => {
    expect(css).not.toMatch(/gradient|shadow|\/\*/);
  });

  it("is added right after the opening svg tag and survives the sanitiser", () => {
    const svg =
      '<svg id="m1" aria-roledescription="kanban" viewBox="0 0 10 10"><g class="section-1"><rect></rect></g></svg>';
    const themed = injectMermaidThemeStyles(svg, "m1", palette);
    expect(
      themed.startsWith('<svg id="m1" aria-roledescription="kanban" viewBox="0 0 10 10"><style>'),
    ).toBe(true);
    const clean = sanitizeMermaidSvg(themed);
    // The css is scoped with this attribute, so it must not be stripped.
    expect(clean).toContain('aria-roledescription="kanban"');
    expect(clean).toContain(`.section-1 > rect { fill: ${palette.series[0]} !important;`);
  });

  it("adds only the rules of the diagram type being rendered", () => {
    const themed = injectMermaidThemeStyles(
      '<svg id="m1" aria-roledescription="kanban"></svg>',
      "m1",
      palette,
    );
    expect(themed).toContain('[aria-roledescription="kanban"]');
    expect(themed).not.toContain('[aria-roledescription="journey"]');
    expect(themed).not.toContain('[aria-roledescription="architecture"]');
    // Rules that apply to every type stay.
    expect(themed).toContain("#m1 .edgeLabel");
    expect(themed.length).toBeLessThan(buildMermaidThemeCss("m1", palette).length);
  });
});

describe("diagram sizing", () => {
  const slide = { width: 800, height: 300 };

  it("reads the natural size from the viewBox or from pixel attributes", () => {
    expect(readSvgSize('<svg id="a" width="100%" viewBox="-5 -43 194 86"></svg>')).toEqual({
      width: 194,
      height: 86,
    });
    expect(readSvgSize('<svg width="640" height="480px"></svg>')).toEqual({
      width: 640,
      height: 480,
    });
    expect(readSvgSize('<svg width="100%"></svg>')).toBeNull();
    expect(readSvgSize("<div></div>")).toBeNull();
  });

  it("scales a diagram that is too tall down to the box height", () => {
    // The reported case: three stacked blocks, narrow and tall.
    expect(computeFitScale({ width: 110, height: 600 }, slide)).toBeCloseTo(0.5, 5);
  });

  it("scales a diagram that is too wide down to the box width", () => {
    expect(computeFitScale({ width: 1600, height: 200 }, slide)).toBeCloseTo(0.5, 5);
  });

  it("uses the tighter of the two limits", () => {
    expect(computeFitScale({ width: 1600, height: 1200 }, slide)).toBeCloseTo(0.25, 5);
  });

  it("does not enlarge a small diagram beyond the limit", () => {
    expect(computeFitScale({ width: 60, height: 40 }, slide)).toBe(MAX_DIAGRAM_UPSCALE);
    expect(computeFitScale({ width: 60, height: 40 }, slide, 1)).toBe(1);
  });

  it("ignores the height when the box has none", () => {
    expect(computeFitScale({ width: 400, height: 5000 }, { width: 800, height: null })).toBe(
      MAX_DIAGRAM_UPSCALE,
    );
    expect(computeFitScale({ width: 1600, height: 5000 }, { width: 800 })).toBeCloseTo(0.5, 5);
  });

  it("returns 1 when a size is missing", () => {
    expect(computeFitScale({ width: 0, height: 100 }, slide)).toBe(1);
    expect(computeFitScale({ width: 100, height: 100 }, { width: 0, height: 0 })).toBe(1);
  });

  it("writes an explicit size that fits the box and keeps the aspect ratio", () => {
    const svg =
      '<svg id="m1" width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width: 110px;" viewBox="0 0 110 600"><g></g></svg>';
    const fitted = fitSvgToBox(svg, slide);
    expect(fitted).toContain('width="55"');
    expect(fitted).toContain('height="300"');
    expect(fitted).toContain('viewBox="0 0 110 600"');
    expect(fitted).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(fitted).not.toContain("max-width: 110px");
    expect(fitted).not.toContain('width="100%"');
    expect(fitted.endsWith("<g></g></svg>")).toBe(true);
  });

  it("replaces an existing height and a different preserveAspectRatio (journey)", () => {
    const svg =
      '<svg id="m9" width="100%" style="max-width: 900px;" viewBox="0 -25 900 540" preserveAspectRatio="xMinYMin meet" height="565"></svg>';
    const fitted = fitSvgToBox(svg, slide);
    const size = readSvgSize(fitted);
    expect(fitted).toContain('width="500"');
    expect(fitted).toContain('height="300"');
    expect(fitted.match(/ height="/g)).toHaveLength(1);
    expect(fitted).not.toContain("xMinYMin");
    expect(size).toEqual({ width: 900, height: 540 });
  });

  it("adds a viewBox to an svg that only has a pixel size", () => {
    const fitted = fitSvgToBox('<svg width="1600" height="600"></svg>', slide);
    expect(fitted).toContain('viewBox="0 0 1600 600"');
    expect(fitted).toContain('width="800"');
    expect(fitted).toContain('height="300"');
  });

  it("never returns a size larger than the box", () => {
    const sizes = [
      [66, 114],
      [194, 86],
      [900, 540],
      [3000, 200],
      [200, 3000],
      [540, 450],
    ];
    for (const [width, height] of sizes) {
      const fitted = fitSvgToBox(`<svg viewBox="0 0 ${width} ${height}"></svg>`, slide);
      const w = Number(/ width="(\d+)"/.exec(fitted)?.[1]);
      const h = Number(/ height="(\d+)"/.exec(fitted)?.[1]);
      expect(w).toBeLessThanOrEqual(slide.width);
      expect(h).toBeLessThanOrEqual(slide.height);
      expect(w / h).toBeCloseTo(width / height, 0);
    }
  });

  it("leaves markup it cannot read unchanged", () => {
    expect(fitSvgToBox("", slide)).toBe("");
    expect(fitSvgToBox('<svg width="100%"></svg>', slide)).toBe('<svg width="100%"></svg>');
  });
});
