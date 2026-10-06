/**
 * Brand theming and sizing for Mermaid diagrams.
 *
 * One entry point, buildMermaidTheme, turns the brand colours into everything
 * Mermaid needs: the themeVariables, a few per diagram config values and the
 * residual CSS for the parts Mermaid does not expose as variables.
 *
 * Every variable name used here was checked against the installed Mermaid
 * source (node_modules/mermaid/dist/chunks/mermaid.core, version 11.16).
 */

// ─── Colour helpers ──────────────────────────────────────────────────────────

type Rgb = [number, number, number];

const WHITE = "#ffffff";
const INK = "#1a1a1a";
const BLACK = "#000000";

const toHex = ([r, g, b]: Rgb): string =>
  `#${[r, g, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/**
 * Returns the colour as a lowercase #rrggbb string, or null when it cannot be
 * read. Mermaid's theme engine only takes hex, so rgb() and rgba() values
 * (MUI returns those) are converted and the alpha channel is dropped.
 */
export const normalizeHex = (color?: string | null): string | null => {
  if (!color) return null;
  const value = color.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  if (/^#[0-9a-f]{8}$/.test(value)) return value.slice(0, 7);
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/.exec(value);
  if (rgb) return toHex([Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]);
  return null;
};

const toRgb = (hex: string): Rgb => {
  const value = normalizeHex(hex) ?? BLACK;
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
};

/** Blends two colours. t = 0 returns a, t = 1 returns b. */
export const mixHex = (a: string, b: string, t: number): string => {
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return toHex([r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k]);
};

/** WCAG 2.x relative luminance, from 0 (black) to 1 (white). */
export const relativeLuminance = (color: string): number => {
  const [r, g, b] = toRgb(color).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio between two colours, from 1 to 21. */
export const contrastRatio = (a: string, b: string): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** Minimum contrast for label text (WCAG AA for normal text). */
export const MIN_TEXT_CONTRAST = 4.5;

/**
 * Picks a text colour that reads on the given fill. The preferred colour wins
 * when it already has enough contrast. Otherwise white or dark ink, whichever
 * contrasts more. Pure black is the last resort for mid tone fills, where
 * neither white nor ink reaches 4.5.
 */
export const readableTextOn = (fill: string, preferred?: string | null): string => {
  const wanted = normalizeHex(preferred);
  if (wanted && contrastRatio(wanted, fill) >= MIN_TEXT_CONTRAST) return wanted;
  const best = contrastRatio(WHITE, fill) >= contrastRatio(INK, fill) ? WHITE : INK;
  return contrastRatio(best, fill) >= MIN_TEXT_CONTRAST ? best : BLACK;
};

/**
 * Moves a colour towards `toward` in small steps until it reaches the wanted
 * contrast against `against`. Returns the colour unchanged if it already does.
 */
export const ensureContrast = (
  color: string,
  against: string,
  minimum: number,
  toward: string,
): string => {
  let current = normalizeHex(color) ?? BLACK;
  for (let step = 1; step <= 10 && contrastRatio(current, against) < minimum; step++) {
    current = mixHex(color, toward, step / 10);
  }
  return current;
};

// ─── Palette ─────────────────────────────────────────────────────────────────

/** The brand colours a caller can pass. All fields are optional. */
export interface MermaidBrandTheme {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  headingFont?: string | null;
  bodyFont?: string | null;
}

/** Colours of the app theme, used for whatever the brand theme leaves out. */
export interface MermaidThemeDefaults {
  primary: string;
  secondary: string;
  background: string;
}

export const SERIES_SIZE = 12;

export interface MermaidPalette {
  background: string;
  primary: string;
  secondary: string;
  /** Text painted on the background. Always readable on it. */
  text: string;
  /** True when the background is dark, so text on it is light. */
  isDark: boolean;
  onPrimary: string;
  onSecondary: string;
  /** Edges, arrows, axes and grid lines. A neutral tone taken from the text. */
  line: string;
  /** Outline of primary filled shapes. */
  border: string;
  /** Faint panel colour for groups and bands. Text stays readable on it. */
  surface: string;
  /** Fills for multi series diagrams: primary, secondary and their tints. */
  series: string[];
  /** Label colour for each series fill, picked by contrast. */
  seriesText: string[];
  fontFamily: string;
}

const FALLBACK_FONTS = '"Inter", "Roboto", sans-serif';

const fontStack = (font?: string | null): string => {
  const name = font?.replace(/["';{}<>]/g, "").trim();
  return name ? `"${name}", ${FALLBACK_FONTS}` : FALLBACK_FONTS;
};

export const buildMermaidPalette = (
  theme: MermaidBrandTheme | null | undefined,
  defaults: MermaidThemeDefaults,
): MermaidPalette => {
  const background =
    normalizeHex(theme?.backgroundColor) ?? normalizeHex(defaults.background) ?? WHITE;
  const primary = normalizeHex(theme?.primaryColor) ?? normalizeHex(defaults.primary) ?? "#3b82f6";
  const secondary =
    normalizeHex(theme?.secondaryColor) ?? normalizeHex(defaults.secondary) ?? "#64748b";

  // A theme can carry a text colour that does not read on its own background.
  // readableTextOn keeps it only when it does.
  const text = readableTextOn(background, theme?.textColor);
  const isDark = contrastRatio(WHITE, background) >= contrastRatio(INK, background);

  // A fill that is almost the background colour would be invisible, so it is
  // pushed towards the text colour until it stands out a little.
  const visible = (color: string) => ensureContrast(color, background, 1.25, text);

  // When the two brand colours are nearly the same, the second series colour
  // is taken from a shade of the primary so two series can still be told apart.
  const second = contrastRatio(primary, secondary) < 1.15 ? mixHex(primary, text, 0.45) : secondary;
  const blend = mixHex(primary, second, 0.5);

  const series = [
    primary,
    second,
    mixHex(primary, background, 0.35),
    mixHex(second, background, 0.35),
    mixHex(primary, text, 0.3),
    mixHex(second, text, 0.3),
    mixHex(primary, background, 0.6),
    mixHex(second, background, 0.6),
    blend,
    mixHex(blend, background, 0.4),
    mixHex(primary, text, 0.55),
    mixHex(second, text, 0.55),
  ].map(visible);

  return {
    background,
    primary,
    secondary,
    text,
    isDark,
    onPrimary: readableTextOn(primary),
    onSecondary: readableTextOn(secondary),
    line: ensureContrast(mixHex(text, background, 0.35), background, 3, text),
    border: ensureContrast(mixHex(primary, text, 0.35), background, 2, text),
    surface: mixHex(background, text, 0.06),
    series,
    seriesText: series.map((fill) => readableTextOn(fill)),
    fontFamily: fontStack(theme?.bodyFont),
  };
};

// ─── Theme variables ─────────────────────────────────────────────────────────

export type MermaidThemeVariables = Record<string, string | boolean | Record<string, string>>;

export interface MermaidTheme {
  palette: MermaidPalette;
  themeVariables: MermaidThemeVariables;
  /** Colours that Mermaid reads from the diagram config, not from the theme. */
  er: { fill: string; stroke: string };
  sankey: { linkColor: string };
}

const numbered = (prefix: string, values: string[], count: number, from = 0) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`${prefix}${from + i}`, values[i % values.length]]),
  );

export const buildMermaidTheme = (
  theme: MermaidBrandTheme | null | undefined,
  defaults: MermaidThemeDefaults,
): MermaidTheme => {
  const palette = buildMermaidPalette(theme, defaults);
  const {
    background,
    primary,
    secondary,
    text,
    isDark,
    onPrimary,
    onSecondary,
    line,
    border,
    surface,
    series,
    seriesText,
    fontFamily,
  } = palette;

  // Gantt. Done tasks are a tint of the primary. Mermaid writes their label
  // with taskTextDarkColor, which is the canvas text here, so the tint is moved
  // towards the background until that text reads on it.
  const ganttDone = ensureContrast(
    mixHex(primary, background, isDark ? 0.5 : 0.42),
    text,
    MIN_TEXT_CONTRAST,
    background,
  );
  const ganttBand = mixHex(primary, background, isDark ? 0.85 : 0.95);
  // Critical tasks keep a fixed amber. It is a status colour, not a brand one.
  const ganttCrit = "#f59e0b";

  // Quadrant backgrounds are faint tints so the canvas text reads on all four.
  const quadrantFills = [0.8, 0.86, 0.9, 0.94].map((t) =>
    ensureContrast(mixHex(primary, background, t), text, MIN_TEXT_CONTRAST, background),
  );

  const themeVariables: MermaidThemeVariables = {
    darkMode: isDark,
    background,
    fontFamily,
    fontSize: "14px",
    // The base theme turns these on. The product style has no gradients and
    // no drop shadows.
    useGradient: false,
    dropShadow: "none",

    // Core: flowchart, state, class and block nodes, edges, clusters, text.
    primaryColor: primary,
    primaryTextColor: onPrimary,
    primaryBorderColor: border,
    secondaryColor: secondary,
    secondaryBorderColor: border,
    secondaryTextColor: onSecondary,
    tertiaryColor: surface,
    tertiaryBorderColor: line,
    tertiaryTextColor: text,
    mainBkg: primary,
    nodeBkg: primary,
    nodeBorder: border,
    nodeTextColor: onPrimary,
    clusterBkg: surface,
    clusterBorder: line,
    border2: line,
    lineColor: line,
    defaultLinkColor: line,
    arrowheadColor: line,
    textColor: text,
    titleColor: text,
    edgeLabelBackground: background,
    labelBackgroundColor: background,
    noteBkgColor: secondary,
    noteTextColor: onSecondary,
    noteBorderColor: border,
    classText: onPrimary,

    // Sequence.
    actorBkg: primary,
    actorBorder: border,
    actorTextColor: onPrimary,
    actorLineColor: line,
    signalColor: line,
    signalTextColor: text,
    labelBoxBkgColor: background,
    labelBoxBorderColor: line,
    labelTextColor: text,
    loopTextColor: text,
    activationBkgColor: primary,
    activationBorderColor: border,
    sequenceNumberColor: readableTextOn(line),

    // State.
    stateBkg: primary,
    stateLabelColor: onPrimary,
    labelColor: onPrimary,
    altBackground: surface,
    compositeBackground: background,
    compositeBorder: line,
    compositeTitleBackground: surface,
    transitionColor: line,
    transitionLabelColor: text,
    specialStateColor: line,
    innerEndBackground: line,

    // ER. The entity boxes also read er.fill and er.stroke from the config.
    attributeBackgroundColorOdd: primary,
    attributeBackgroundColorEven: primary,
    // Attribute rows share the label colour of the entity header, so both row
    // fills stay close to the primary. The default would turn one of them white.
    rowOdd: primary,
    rowEven: ensureContrast(mixHex(primary, text, 0.12), onPrimary, MIN_TEXT_CONTRAST, primary),
    relationColor: line,
    relationLabelBackground: background,
    relationLabelColor: text,

    // Gantt.
    sectionBkgColor: ganttBand,
    sectionBkgColor2: background,
    altSectionBkgColor: background,
    excludeBkgColor: surface,
    taskBkgColor: primary,
    taskBorderColor: border,
    taskTextColor: onPrimary,
    taskTextLightColor: text,
    taskTextDarkColor: text,
    taskTextOutsideColor: text,
    taskTextClickableColor: text,
    activeTaskBkgColor: primary,
    activeTaskBorderColor: border,
    doneTaskBkgColor: ganttDone,
    doneTaskBorderColor: mixHex(primary, background, 0.3),
    critBkgColor: ganttCrit,
    critBorderColor: mixHex(ganttCrit, BLACK, 0.2),
    gridColor: mixHex(text, background, 0.78),
    todayLineColor: secondary,
    vertLineColor: line,

    // Quadrant.
    quadrant1Fill: quadrantFills[0],
    quadrant2Fill: quadrantFills[1],
    quadrant3Fill: quadrantFills[2],
    quadrant4Fill: quadrantFills[3],
    quadrant1TextFill: text,
    quadrant2TextFill: text,
    quadrant3TextFill: text,
    quadrant4TextFill: text,
    quadrantPointFill: ensureContrast(primary, quadrantFills[0], 3, text),
    quadrantPointTextFill: text,
    quadrantTitleFill: text,
    quadrantXAxisTextFill: text,
    quadrantYAxisTextFill: text,
    quadrantInternalBorderStrokeFill: line,
    quadrantExternalBorderStrokeFill: line,

    // Architecture. Icon boxes and labels have no variables, see the CSS below.
    archEdgeColor: line,
    archEdgeArrowColor: line,
    archEdgeWidth: "2",
    archGroupBorderColor: line,
    archGroupBorderWidth: "1.5px",

    // Pie. Slices are opaque so the label contrast holds.
    ...numbered("pie", series, SERIES_SIZE, 1),
    pieTitleTextSize: "16px",
    pieTitleTextColor: text,
    pieSectionTextSize: "12px",
    pieSectionTextColor: seriesText[0],
    pieLegendTextSize: "14px",
    pieLegendTextColor: text,
    pieStrokeColor: background,
    pieStrokeWidth: "2px",
    pieOuterStrokeWidth: "2px",
    pieOuterStrokeColor: background,
    pieOpacity: "1",

    // Journey. Sections and tasks use fillType, actors use actor.
    ...numbered("fillType", series, 8),
    ...numbered("actor", [series[1], series[4], series[2], series[5], series[3], series[0]], 6),
    faceColor: background,

    // Kanban, timeline and mindmap share the cScale colours.
    ...numbered("cScale", series, SERIES_SIZE),
    ...numbered("cScaleLabel", seriesText, SERIES_SIZE),
    ...numbered("cScaleInv", seriesText, SERIES_SIZE),
    ...numbered(
      "cScalePeer",
      series.map((fill) => mixHex(fill, text, 0.2)),
      SERIES_SIZE,
    ),
    scaleLabelColor: text,

    // Git graph.
    ...numbered("git", series, 8),
    ...numbered("gitInv", seriesText, 8),
    ...numbered("gitBranchLabel", seriesText, 8),
    branchLabelColor: seriesText[0],
    commitLabelColor: text,
    commitLabelBackground: background,
    tagLabelColor: onSecondary,
    tagLabelBackground: secondary,
    tagLabelBorder: border,

    // XY chart. Colours go in this object, sizes in the xyChart config.
    xyChart: {
      backgroundColor: "transparent",
      titleColor: text,
      dataLabelColor: text,
      xAxisLabelColor: text,
      xAxisTitleColor: text,
      xAxisTickColor: line,
      xAxisLineColor: line,
      yAxisLabelColor: text,
      yAxisTitleColor: text,
      yAxisTickColor: line,
      yAxisLineColor: line,
      plotColorPalette: series.slice(0, 10).join(", "),
    },
  };

  return {
    palette,
    themeVariables,
    er: { fill: primary, stroke: border },
    sankey: { linkColor: line },
  };
};

// ─── Residual CSS ────────────────────────────────────────────────────────────

/**
 * CSS for what Mermaid cannot express with theme variables: colours written
 * inline by the renderer (architecture icons, sankey nodes, journey faces) and
 * labels whose colour does not follow their fill (journey, kanban, block, pie).
 *
 * Each block is scoped to one diagram type through the aria-roledescription
 * that Mermaid sets on the root svg, so a rule never leaks into another type.
 * Pass the type to get only the rules for that diagram.
 */
export const buildMermaidThemeCss = (
  id: string,
  palette: MermaidPalette,
  type?: string | null,
): string => {
  const { background, primary, text, onPrimary, line, border, series, seriesText } = palette;
  const scope = (type: string) => `#${id}[aria-roledescription="${type}"]`;
  const each = (count: number, rule: (i: number) => string) =>
    Array.from({ length: count }, (_, i) => rule(i)).join("\n");

  const arch = scope("architecture");
  const journey = scope("journey");
  const kanban = scope("kanban");
  const block = scope("block");
  const sankey = scope("sankey");
  const pie = scope("pie");
  const timeline = scope("timeline");
  const mindmap = scope("mindmap");

  const css = `
    /* XY chart: transparent is not a hex value, so it cannot be a variable. */
    #${id} [class*="xychart-bg"] { fill: transparent !important; }

    /* Edge labels sit on the background, but Mermaid colours every span with
       the node text colour, which is made to read on the primary fill. */
    #${id} .edgeLabel,
    #${id} .edgeLabel span,
    #${id} .edgeLabel p { color: ${text} !important; }
    #${id} .edgeLabel text { fill: ${text} !important; }

    /* Architecture: the icon box is a rect with an inline blue fill and white
       strokes. Labels carry no colour class. Never fill .node-bkg, it is the
       group outline. */
    ${arch} .architecture-services text,
    ${arch} .architecture-services tspan,
    ${arch} .architecture-groups text,
    ${arch} .architecture-groups tspan {
      fill: ${text} !important;
      color: ${text} !important;
    }
    ${arch} [style*="#087ebf"],
    ${arch} [style*="rgb(8, 126, 191)"] { fill: ${primary} !important; }
    ${arch} [style*="stroke: #fff"],
    ${arch} [style*="stroke: rgb(255, 255, 255)"] { stroke: ${onPrimary} !important; }
    ${arch} [style*="fill: #fff"],
    ${arch} [style*="fill: rgb(255, 255, 255)"] { fill: ${onPrimary} !important; }
    ${arch} .node-icon-text > div { color: ${onPrimary} !important; }

    /* Journey: a task label is a sibling of its rect, so its colour is set per
       fill type. Faces, guide lines and actor dots have inline colours. */
    ${each(
      8,
      (i) => `
    ${journey} div.section-type-${i},
    ${journey} div.section-type-${i} .label,
    ${journey} rect.task-type-${i} ~ switch div { color: ${seriesText[i]} !important; }
    ${journey} text.section-type-${i},
    ${journey} rect.section-type-${i} ~ text,
    ${journey} rect.task-type-${i} ~ switch text,
    ${journey} rect.task-type-${i} ~ text { fill: ${seriesText[i]} !important; }`,
    )}
    ${journey} rect.journey-section,
    ${journey} rect.task { stroke: none !important; }
    ${journey} .task-line { stroke: ${line} !important; }
    ${journey} .face { fill: ${background} !important; stroke: ${line} !important; }
    ${journey} .mouth { stroke: ${text} !important; }
    ${journey} circle[fill="#666"] { fill: ${text} !important; stroke: ${text} !important; }
    ${journey} circle[class^="actor-"] { stroke: ${text} !important; }
    ${journey} marker path { fill: ${text} !important; stroke: ${text} !important; }

    /* Kanban: Mermaid shifts each column fill by 10% and writes every column
       title in the canvas text colour. Columns get the exact series colour and
       a title that reads on it. Cards keep the background colour. */
    ${each(
      SERIES_SIZE,
      (i) => `
    ${kanban} .section-${i + 1} > rect { fill: ${series[i]} !important; stroke: ${series[i]} !important; }
    ${kanban} .section-${i + 1} .cluster-label,
    ${kanban} .section-${i + 1} .cluster-label span,
    ${kanban} .section-${i + 1} .cluster-label p { color: ${seriesText[i]} !important; fill: ${seriesText[i]} !important; }`,
    )}
    ${kanban} .node > rect { fill: ${background} !important; stroke: ${border} !important; }
    ${kanban} .node .label,
    ${kanban} .node .label span,
    ${kanban} .node .label p { color: ${text} !important; fill: ${text} !important; }

    /* Block: Mermaid's own CSS sets every p to the title colour, which is the
       canvas text, so labels on filled blocks need the on primary colour. */
    ${block} .node .label,
    ${block} .node .label span,
    ${block} .node .label p,
    ${block} .node .label text { color: ${onPrimary} !important; fill: ${onPrimary} !important; }

    /* Sankey: node fills come from a fixed d3 palette and links use a blend
       mode that hides them on dark backgrounds. */
    ${each(
      SERIES_SIZE,
      (i) =>
        `${sankey} .nodes .node:nth-child(${SERIES_SIZE}n+${i + 1}) rect { fill: ${series[i]} !important; }`,
    )}
    ${sankey} .node-labels text { fill: ${text} !important; }
    ${sankey} .link { mix-blend-mode: normal !important; }
    ${sankey} .link path { stroke: ${line} !important; stroke-opacity: 0.45 !important; }

    /* Pie: one label colour for all slices is not enough, each slice needs
       the colour that reads on its own fill. */
    ${each(
      SERIES_SIZE,
      (i) =>
        `${pie} text.slice:nth-of-type(${SERIES_SIZE}n+${i + 1}) { fill: ${seriesText[i]} !important; }`,
    )}

    /* Timeline: the axis takes the last label colour and events get a
       brightness filter that shifts the fills. */
    ${timeline} .lineWrapper line { stroke: ${line} !important; }
    ${timeline} .eventWrapper { filter: none !important; }
    ${timeline} marker path { fill: ${line} !important; stroke: ${line} !important; }

    /* Mindmap: the root node label has no colour rule for html labels. */
    ${mindmap} .section-root span,
    ${mindmap} .section-root p { color: ${seriesText[0]} !important; }
    ${mindmap} .section-root text { fill: ${seriesText[0]} !important; }
  `;
  // The comments above are for the reader of this file, not for the svg.
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+\{[^{}]*\}/g) ?? [];
  const marker = '[aria-roledescription="';
  return rules
    .filter((rule) => !type || !rule.includes(marker) || rule.includes(`${marker}${type}"]`))
    .map((rule) => rule.replace(/\s+/g, " ").trim())
    .join(" ");
};

const rootTag = (svg: string): string | null => /<svg\b[^>]*>/i.exec(svg)?.[0] ?? null;

const readAttr = (tag: string, name: string): string | null =>
  new RegExp(`\\s${name}="([^"]*)"`, "i").exec(tag)?.[1] ?? null;

/**
 * Adds the residual theme CSS as the first child of the rendered svg. Only the
 * rules for the diagram type of that svg are added.
 */
export const injectMermaidThemeStyles = (
  svg: string,
  id: string,
  palette: MermaidPalette,
): string => {
  const tag = rootTag(svg);
  if (!tag) return svg;
  const type = readAttr(tag, "aria-roledescription");
  return svg.replace(tag, `${tag}<style>${buildMermaidThemeCss(id, palette, type)}</style>`);
};

// ─── Sizing ──────────────────────────────────────────────────────────────────

export interface DiagramSize {
  width: number;
  height: number;
}

/** Space the diagram may use. A null height means the height is not limited. */
export interface DiagramBox {
  width: number;
  height?: number | null;
}

/**
 * A small diagram is not enlarged beyond this factor. Without a limit a narrow
 * diagram (three stacked blocks) grows until it no longer fits in height.
 */
export const MAX_DIAGRAM_UPSCALE = 1.5;

/**
 * Scale that makes the content fit the box in width, and in height too when the
 * box has one. Never above maxUpscale. Returns 1 when a size is missing.
 */
export const computeFitScale = (
  content: DiagramSize,
  box: DiagramBox,
  maxUpscale: number = MAX_DIAGRAM_UPSCALE,
): number => {
  if (!(content.width > 0) || !(content.height > 0) || !(box.width > 0)) return 1;
  const byWidth = box.width / content.width;
  const byHeight = box.height && box.height > 0 ? box.height / content.height : Infinity;
  return Math.min(byWidth, byHeight, maxUpscale);
};

/**
 * Natural size of a Mermaid svg, in px. Mermaid normally writes a viewBox and
 * width="100%". With useMaxWidth off it writes pixel width and height instead,
 * so both forms are read.
 */
export const readSvgSize = (svg: string): DiagramSize | null => {
  const tag = rootTag(svg);
  if (!tag) return null;
  const viewBox = readAttr(tag, "viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (viewBox && viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
    return { width: viewBox[2], height: viewBox[3] };
  }
  const width = Number(readAttr(tag, "width")?.replace(/px$/, ""));
  const height = Number(readAttr(tag, "height")?.replace(/px$/, ""));
  return width > 0 && height > 0 ? { width, height } : null;
};

const setAttr = (tag: string, name: string, value: string): string => {
  const pattern = new RegExp(`\\s${name}="[^"]*"`, "i");
  const attr = ` ${name}="${value}"`;
  return pattern.test(tag) ? tag.replace(pattern, attr) : tag.replace(/^<svg\b/i, `<svg${attr}`);
};

/**
 * Gives the svg an explicit pixel size that fits the box, keeping its aspect
 * ratio. The svg is returned unchanged when its size cannot be read.
 */
export const fitSvgToBox = (
  svg: string,
  box: DiagramBox,
  maxUpscale: number = MAX_DIAGRAM_UPSCALE,
): string => {
  const tag = rootTag(svg);
  const size = readSvgSize(svg);
  if (!tag || !size) return svg;

  const scale = computeFitScale(size, box, maxUpscale);
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));

  let next = tag;
  if (!readAttr(next, "viewBox")) {
    next = setAttr(next, "viewBox", `0 0 ${size.width} ${size.height}`);
  }
  next = setAttr(next, "width", String(width));
  next = setAttr(next, "height", String(height));
  next = setAttr(next, "preserveAspectRatio", "xMidYMid meet");
  // Mermaid caps the width with an inline max-width. The explicit size replaces it.
  const style = (readAttr(next, "style") ?? "").replace(/max-width:[^;]*;?/gi, "").trim();
  next = setAttr(
    next,
    "style",
    `${style}${style && !style.endsWith(";") ? ";" : ""}max-width: none;`,
  );

  return svg.replace(tag, next);
};
