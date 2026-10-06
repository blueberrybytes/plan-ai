import { z, ZodObject, ZodRawShape } from "zod";

/**
 * Built-in slide type definitions.
 * Each type defines its structure, constraints, and a Zod schema for validation.
 * The AI uses the descriptions + parameter constraints to pick the right type.
 *
 * NOTE: parameter fields use `.nullable()` rather than `.optional()`. These
 * schemas are sent to the LLM as `response_format: json_schema`, and OpenAI /
 * Azure *strict* structured-output mode requires every property (including
 * nested object properties) to appear in `required`. `.optional()` omits the
 * field from `required` and those providers reject the schema with a 400. The
 * portable pattern is required-but-nullable; the renderer treats a missing field
 * and a `null` field identically (falsy checks), so this is behavior-preserving.
 */

/**
 * Icon names the slide renderer can draw. Must stay in sync with `iconMap` in
 * frontend/src/components/slides/components/DynamicIcon.tsx. Any other name
 * falls back to a generic icon there, so the model only gets these.
 */
export const SLIDE_ICON_NAMES = [
  "AutoAwesome",
  "TextFields",
  "Download",
  "Lightbulb",
  "Psychology",
  "Settings",
  "CheckCircle",
] as const;

/**
 * How many items of each list a slide can show. The web renderers and the PPTX
 * exporter cut at these numbers. Must stay in sync with
 * frontend/src/components/slides/slideCaps.ts.
 *
 * The caps are not `.max()` in the schemas: strict json_schema providers do not
 * all accept maxItems or maxLength, and a model that returns one item too many
 * would fail the whole slide. They go in `.describe()` and applySlideCaps cuts
 * the lists after parsing.
 */
export const SLIDE_LIST_CAPS: Record<string, { field: string; max: number }> = {
  bullet_list: { field: "bullets", max: 8 },
  team_grid: { field: "members", max: 4 },
  stats: { field: "stats", max: 4 },
  split_kpi: { field: "kpis", max: 3 },
  split_cards: { field: "cards", max: 4 },
  image_with_list: { field: "features", max: 4 },
  three_columns: { field: "columns", max: 3 },
};

const iconName = () =>
  z.enum(SLIDE_ICON_NAMES).nullable().describe("Icon that fits the content, or null.");
const badge = () =>
  z.string().nullable().describe("Short label above the title, 1 to 3 words, or null.");
const title = () => z.string().describe("Slide title, plain text, under 60 characters.");
const imageQuery = () =>
  z
    .string()
    .nullable()
    .describe("Short description of the picture to generate for this slide, or null.");

export interface SlideTypeDefinition {
  key: string;
  name: string;
  description: string;
  parametersSchema: ZodObject<ZodRawShape>;
}

export const SLIDE_TYPE_DEFINITIONS: SlideTypeDefinition[] = [
  {
    key: "title_only",
    name: "Title Slide",
    description:
      "Opening or closing slide with a large title, optional subtitle, optional badge, and optional iconName. Best for section dividers or cover slides.",
    parametersSchema: z.object({
      badge: badge(),
      iconName: iconName(),
      title: title(),
      subtitle: z
        .string()
        .nullable()
        .describe("One line under the title, under 100 characters, or null."),
    }),
  },
  {
    key: "text_block",
    name: "Text Block",
    description:
      "Full-width text content with a title, optional subtitle, optional icon, and body paragraph. Best for explanations, introductions, or summaries.",
    parametersSchema: z.object({
      badge: badge(),
      iconName: iconName(),
      title: title(),
      subtitle: z
        .string()
        .nullable()
        .describe("One line under the title, under 100 characters, or null."),
      body: z.string().describe("One short paragraph of plain text, under 450 characters."),
    }),
  },
  {
    key: "text_image",
    name: "Text + Image",
    description:
      "Split layout with text on the left and an image on the right. Best for illustrating a concept with a visual.",
    parametersSchema: z.object({
      badge: badge(),
      title: title(),
      body: z.string().describe("One short paragraph of plain text, under 350 characters."),
      imageQuery: imageQuery(),
    }),
  },
  {
    key: "bullet_list",
    name: "Bullet List",
    description:
      "Title with an optional subtitle and a list of up to 8 bullet points. Best for enumerating features, steps, or key points.",
    parametersSchema: z.object({
      badge: badge(),
      title: title(),
      subtitle: z
        .string()
        .nullable()
        .describe("One line under the title, under 100 characters, or null."),
      bullets: z
        .array(z.string())
        .describe(
          "3 to 8 bullets. Each one is a plain sentence under 110 characters, without a leading dash or bullet mark.",
        ),
    }),
  },
  {
    key: "two_columns",
    name: "Two Columns",
    description:
      "Two-column layout with a title. Best for comparisons, pros/cons, or side-by-side information.",
    parametersSchema: z.object({
      badge: badge(),
      title: title(),
      leftTitle: z.string().nullable().describe("Column heading, under 30 characters, or null."),
      leftBody: z.string().describe("Plain text for this column, under 300 characters."),
      rightTitle: z.string().nullable().describe("Column heading, under 30 characters, or null."),
      rightBody: z.string().describe("Plain text for this column, under 300 characters."),
    }),
  },
  {
    key: "team_grid",
    name: "Team Members",
    description:
      "Grid of team member cards with name, role, and short bio. Best for showing 2 to 4 people.",
    parametersSchema: z.object({
      badge: badge(),
      title: title(),
      members: z
        .array(
          z.object({
            name: z.string().describe("Full name."),
            role: z.string().describe("Job title, under 40 characters."),
            bio: z.string().describe("One sentence, under 100 characters."),
          }),
        )
        .describe("2 to 4 people. Never more than 4."),
    }),
  },
  {
    key: "showcase",
    name: "Showcase",
    description:
      "Large image with a title and caption. Best for product screenshots, demos, or hero visuals.",
    parametersSchema: z.object({
      badge: badge(),
      title: title(),
      imageQuery: imageQuery(),
      caption: z.string().describe("One sentence under the image, under 140 characters."),
    }),
  },
  {
    key: "stats",
    name: "Key Stats",
    description:
      "Display up to 4 key metrics or statistics prominently. Best for numbers, KPIs, or data highlights.",
    parametersSchema: z.object({
      badge: badge(),
      title: title(),
      stats: z
        .array(
          z.object({
            label: z.string().describe("What the number measures, under 30 characters."),
            value: z
              .string()
              .describe("The number with its unit, under 10 characters, like 42% or 3.5M."),
          }),
        )
        .describe("2 to 4 stats. Never more than 4."),
    }),
  },
  {
    key: "split_kpi",
    name: "Split KPI",
    description:
      "Split layout with a full vertical image on the left, and a title, descriptions, and up to 3 large KPIs on the right. Best for high-impact metric presentations.",
    parametersSchema: z.object({
      badge: badge(),
      title: title(),
      imageQuery: imageQuery(),
      kpis: z
        .array(
          z.object({
            value: z.string().describe("The number with its unit, under 8 characters."),
            label: z.string().describe("What the number measures, under 30 characters."),
            description: z
              .string()
              .nullable()
              .describe("One sentence, under 80 characters, or null."),
          }),
        )
        .describe("2 or 3 KPIs. Never more than 3."),
    }),
  },
  {
    key: "split_cards",
    name: "Split Cards",
    description:
      "Split layout with a full vertical image on the left, and a title followed by a stack of up to 4 descriptive cards on the right.",
    parametersSchema: z.object({
      badge: badge(),
      title: title(),
      imageQuery: imageQuery(),
      cards: z
        .array(
          z.object({
            title: z.string().describe("Card title, under 40 characters."),
            body: z.string().describe("One or two sentences, under 120 characters."),
            iconName: iconName(),
          }),
        )
        .describe("2 to 4 cards. Never more than 4."),
    }),
  },
  {
    key: "image_with_list",
    name: "Image with List",
    description:
      "Medium image on the left, and a list of up to 4 features on the right. Better for features, workflows, and benefits.",
    parametersSchema: z.object({
      badge: badge(),
      title: title(),
      body: z
        .string()
        .nullable()
        .describe("One sentence under the title, under 140 characters, or null."),
      imageQuery: imageQuery(),
      features: z
        .array(
          z.object({
            title: z.string().describe("Feature name, under 40 characters."),
            description: z
              .string()
              .nullable()
              .describe("One sentence, under 100 characters, or null."),
            iconName: iconName(),
          }),
        )
        .describe("2 to 4 features. Never more than 4."),
    }),
  },
  {
    key: "three_columns",
    name: "Three Columns",
    description:
      "Centered top header with three distinct equal columns below containing titles and descriptions. Great for pricing, tiers, or three-step processes.",
    parametersSchema: z.object({
      badge: badge(),
      title: title(),
      subtitle: z
        .string()
        .nullable()
        .describe("One line under the title, under 100 characters, or null."),
      columns: z
        .array(
          z.object({
            title: z.string().describe("Column heading, under 30 characters."),
            body: z.string().describe("Plain text for this column, under 160 characters."),
            iconName: iconName(),
          }),
        )
        .describe("Exactly 3 columns."),
    }),
  },
  {
    key: "quote_showcase",
    name: "Quote Showcase",
    description:
      "High impact split layout containing a massive quote or statement on one side, and a full-bleed visual on the other.",
    parametersSchema: z.object({
      badge: badge(),
      statement: z
        .string()
        .describe(
          "The quote or statement, plain text without quotation marks, under 180 characters.",
        ),
      author: z.string().nullable().describe("Who said it, or null."),
      imageQuery: imageQuery(),
    }),
  },
  {
    key: "diagram_slide",
    name: "System Diagram",
    description:
      "A large generative Mermaid.js diagram. Best for visualizing Roadmaps (Timeline), User Journeys, Effort/Impact matrices (Quadrant), flowcharts, architectures, pie charts, Sankey cash-flows, and Kanban boards. Always output strictly valid Mermaid syntax for the chosen type.",
    parametersSchema: z.object({
      badge: badge(),
      title: title(),
      mermaidCode: z.string(),
    }),
  },
];

/** Keys of every registered slide type, for a z.enum in the outline schema. */
export const SLIDE_TYPE_KEYS = SLIDE_TYPE_DEFINITIONS.map((d) => d.key) as [string, ...string[]];

/**
 * Cuts the list of a slide to what the slide can show and removes a leading
 * dash or bullet mark from bullets. Returns a new object.
 */
export function applySlideCaps(
  slideTypeKey: string,
  parameters: Record<string, unknown>,
): Record<string, unknown> {
  const cap = SLIDE_LIST_CAPS[slideTypeKey];
  if (!cap) return parameters;
  const list = parameters[cap.field];
  if (!Array.isArray(list)) return parameters;
  const cut = list
    .slice(0, cap.max)
    .map((item) => (typeof item === "string" ? item.replace(/^\s*[-*\u2022]\s+/, "") : item));
  return { ...parameters, [cap.field]: cut };
}

/**
 * Lookup a slide type definition by key.
 */
export function getSlideTypeDefinition(key: string): SlideTypeDefinition | undefined {
  return SLIDE_TYPE_DEFINITIONS.find((d) => d.key === key);
}

/**
 * Build a catalog string for the AI system prompt.
 * Lists all available slide types with descriptions and parameter constraints.
 */
export function buildSlideTypeCatalog(enabledTypes?: string[]): string {
  const types = enabledTypes
    ? SLIDE_TYPE_DEFINITIONS.filter((d) => enabledTypes.includes(d.key))
    : SLIDE_TYPE_DEFINITIONS;

  return types
    .map((def) => {
      const shape = def.parametersSchema.shape;
      const params = Object.entries(shape)
        .map(([key]) => `    - ${key}`)
        .join("\n");
      return `- **${def.key}** ("${def.name}"): ${def.description}\n  Parameters:\n${params}`;
    })
    .join("\n\n");
}
