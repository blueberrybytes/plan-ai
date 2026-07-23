import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { logger } from "./logger";
import { svgText, stripUnrenderable } from "./textSanitize";

/**
 * Deterministic phone-screen mockup renderer.
 *
 * The LLM supplies a STRUCTURED SPEC, never markup. Free-form HTML/SVG from a
 * model is the tempting version of this feature and the wrong one: it produces
 * output that ranges from beautiful to broken with no way to tell which a
 * prospect will receive, and it would mean executing model-authored markup —
 * derived from a stranger's message — inside our own renderer.
 *
 * A fixed layout with model-supplied CONTENT is always presentable. It looks
 * like a design system, which is what a client should see from an agency.
 */

const WIDTH = 900;
const ROW_HEIGHT = 132;
const ROWS_TOP = 470;
const BUTTON_HEIGHT = 96;
const RASTER_TIMEOUT_MS = 20_000;

/**
 * Canvas height follows the row count. A fixed height left ~700px of dead white
 * space below the last row on a 4-row screen, which reads as an unfinished
 * design rather than a deliberate one.
 */
const canvasHeight = (rowCount: number): number =>
  ROWS_TOP + rowCount * ROW_HEIGHT + 40 + BUTTON_HEIGHT + 60;
const MAX_PNG_BYTES = 12 * 1024 * 1024;

export interface MockupPalette {
  name: string;
  accent: string;
  surface: string;
  ink: string;
  muted: string;
}

/** Two visibly different directions so the choice is a real one. */
export const MOCKUP_PALETTES: MockupPalette[] = [
  { name: "Claro", accent: "#4361EE", surface: "#FFFFFF", ink: "#0F172A", muted: "#64748B" },
  { name: "Oscuro", accent: "#A78BFA", surface: "#12151C", ink: "#F8FAFC", muted: "#94A3B8" },
];

export interface MockupRow {
  label: string;
  meta: string;
}

export interface MockupSpec {
  appName: string;
  screenTitle: string;
  /** 2–4 words describing the primary action, e.g. "Nueva comanda". */
  primaryAction: string;
  rows: MockupRow[];
  /** Three short KPI labels, e.g. ["Hoy", "Pendientes", "Servidas"]. */
  stats: string[];
}

const MAX_ROWS = 6;

/**
 * Builds the SVG. Every string goes through `svgText`, which sanitizes AND
 * escapes — no call site is allowed to interpolate raw text.
 */
export const buildMockupSvg = (spec: MockupSpec, palette: MockupPalette): string => {
  const rows = spec.rows.slice(0, MAX_ROWS);
  const isDark = palette.surface !== "#FFFFFF";
  const cardFill = isDark ? "#1B2029" : "#F8FAFC";
  const height = canvasHeight(rows.length);
  const buttonY = ROWS_TOP + rows.length * ROW_HEIGHT + 40;

  const rowMarkup = rows
    .map((row, index) => {
      const y = ROWS_TOP + index * ROW_HEIGHT;
      return `
    <rect x="60" y="${y}" width="${WIDTH - 120}" height="112" rx="18" fill="${cardFill}"/>
    <circle cx="126" cy="${y + 56}" r="26" fill="${palette.accent}" opacity="0.18"/>
    <circle cx="126" cy="${y + 56}" r="9" fill="${palette.accent}"/>
    <text x="176" y="${y + 48}" font-family="sans-serif" font-size="26" font-weight="600" fill="${palette.ink}">${svgText(row.label, 30)}</text>
    <text x="176" y="${y + 82}" font-family="sans-serif" font-size="21" fill="${palette.muted}">${svgText(row.meta, 34)}</text>`;
    })
    .join("");

  const statMarkup = spec.stats
    .slice(0, 3)
    .map((stat, index) => {
      const x = 60 + index * ((WIDTH - 120) / 3);
      const w = (WIDTH - 120) / 3 - 16;
      return `
    <rect x="${x}" y="300" width="${w}" height="120" rx="18" fill="${cardFill}"/>
    <text x="${x + 24}" y="352" font-family="sans-serif" font-size="34" font-weight="700" fill="${palette.accent}">${["24", "8", "16"][index]}</text>
    <text x="${x + 24}" y="390" font-family="sans-serif" font-size="19" fill="${palette.muted}">${svgText(stat, 14)}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  <rect width="${WIDTH}" height="${height}" fill="${palette.surface}"/>
  <rect x="0" y="0" width="${WIDTH}" height="210" fill="${palette.accent}"/>
  <text x="60" y="96" font-family="sans-serif" font-size="24" fill="#FFFFFF" opacity="0.75">${svgText(spec.appName, 28)}</text>
  <text x="60" y="156" font-family="sans-serif" font-size="42" font-weight="700" fill="#FFFFFF">${svgText(spec.screenTitle, 24)}</text>
  ${statMarkup}
  <text x="60" y="452" font-family="sans-serif" font-size="22" font-weight="600" fill="${palette.muted}">ACTIVIDAD</text>
  ${rowMarkup}
  <rect x="60" y="${buttonY}" width="${WIDTH - 120}" height="${BUTTON_HEIGHT}" rx="48" fill="${palette.accent}"/>
  <text x="${WIDTH / 2}" y="${buttonY + 62}" font-family="sans-serif" font-size="30" font-weight="600" fill="#FFFFFF" text-anchor="middle">${svgText(spec.primaryAction, 22)}</text>
</svg>`;
};

/**
 * Rasterizes in a CHILD PROCESS.
 *
 * A font-fallback failure inside librsvg aborts the process uncatchably (see
 * `textSanitize.ts`). Sanitizing removes the trigger we have identified; this
 * ensures that an unidentified one costs a mockup rather than the API server
 * and every BullMQ worker running inside it.
 */
export const rasterizeSvgIsolated = async (svg: string): Promise<Buffer | null> =>
  new Promise((resolve) => {
    // Production runs from `dist` (Dockerfile: `yarn build` -> tsc), but `yarn
    // dev` runs nodemon+ts-node straight from `src`, where only the .ts exists.
    // Resolving just the .js meant mockups silently failed for every developer.
    const compiled = path.join(__dirname, "svgRasterizer.worker.js");
    const args = fs.existsSync(compiled)
      ? [compiled]
      : ["-r", "ts-node/register/transpile-only", path.join(__dirname, "svgRasterizer.worker.ts")];

    const child = execFile(
      process.execPath,
      args,
      { timeout: RASTER_TIMEOUT_MS, maxBuffer: MAX_PNG_BYTES, encoding: "buffer" },
      (err, stdout, stderr) => {
        if (err) {
          const signal = (err as NodeJS.ErrnoException & { signal?: string }).signal;
          logger.warn(
            `[mockup] rasterizer failed (signal=${signal ?? "none"}): ${
              stderr?.toString().slice(0, 200) || err.message
            }`,
          );
          return resolve(null);
        }
        resolve(stdout?.length ? Buffer.from(stdout) : null);
      },
    );

    child.stdin?.end(svg);
  });

/** Renders one mockup end to end. Returns null rather than throwing. */
export const renderMockup = async (
  spec: MockupSpec,
  palette: MockupPalette,
): Promise<Buffer | null> => rasterizeSvgIsolated(buildMockupSvg(spec, palette));

/** Guards against a model returning empty strings that would render blank boxes. */
export const isRenderableSpec = (spec: MockupSpec): boolean =>
  Boolean(
    stripUnrenderable(spec.appName) &&
    stripUnrenderable(spec.screenTitle) &&
    stripUnrenderable(spec.primaryAction) &&
    spec.rows.some((row) => stripUnrenderable(row.label)),
  );
