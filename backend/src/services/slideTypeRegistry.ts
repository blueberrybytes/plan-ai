import { z, ZodObject, ZodRawShape } from "zod";

/**
 * Built-in slide type definitions.
 * Each type defines its structure, constraints, and a Zod schema for validation.
 * The AI uses the descriptions + parameter constraints to pick the right type.
 */

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
      badge: z.string().optional(),
      iconName: z.string().optional(),
      title: z.string(),
      subtitle: z.string().optional(),
    }),
  },
  {
    key: "text_block",
    name: "Text Block",
    description:
      "Full-width text content with a title, optional subtitle, optional icon, and body paragraph. Best for explanations, introductions, or summaries.",
    parametersSchema: z.object({
      badge: z.string().optional(),
      iconName: z.string().optional(),
      title: z.string(),
      subtitle: z.string().optional(),
      body: z.string(),
    }),
  },
  {
    key: "text_image",
    name: "Text + Image",
    description:
      "Split layout with text on the left and an image on the right. Best for illustrating a concept with a visual.",
    parametersSchema: z.object({
      badge: z.string().optional(),
      title: z.string(),
      body: z.string(),
      imageQuery: z.string().optional(),
    }),
  },
  {
    key: "bullet_list",
    name: "Bullet List",
    description:
      "Title with an optional subtitle and a list of bullet points. Best for enumerating features, steps, or key points.",
    parametersSchema: z.object({
      badge: z.string().optional(),
      title: z.string(),
      subtitle: z.string().optional(),
      bullets: z.array(z.string()).max(8),
    }),
  },
  {
    key: "two_columns",
    name: "Two Columns",
    description:
      "Two-column layout with a title. Best for comparisons, pros/cons, or side-by-side information.",
    parametersSchema: z.object({
      badge: z.string().optional(),
      title: z.string(),
      leftTitle: z.string().optional(),
      leftBody: z.string(),
      rightTitle: z.string().optional(),
      rightBody: z.string(),
    }),
  },
  {
    key: "team_grid",
    name: "Team Members",
    description:
      "Grid of team member cards with name, role, and short bio. Best for showing 2 to 4 people.",
    parametersSchema: z.object({
      badge: z.string().optional(),
      title: z.string(),
      members: z
        .array(
          z.object({
            name: z.string(),
            role: z.string(),
            bio: z.string(),
          }),
        )
        .max(4),
    }),
  },
  {
    key: "showcase",
    name: "Showcase",
    description:
      "Large image with a title and caption. Best for product screenshots, demos, or hero visuals.",
    parametersSchema: z.object({
      badge: z.string().optional(),
      title: z.string(),
      imageQuery: z.string().optional(),
      caption: z.string(),
    }),
  },
  {
    key: "stats",
    name: "Key Stats",
    description:
      "Display key metrics or statistics prominently. Best for numbers, KPIs, or data highlights.",
    parametersSchema: z.object({
      badge: z.string().optional(),
      title: z.string(),
      stats: z
        .array(
          z.object({
            label: z.string(),
            value: z.string(),
          }),
        )
        .max(6),
    }),
  },
  {
    key: "split_kpi",
    name: "Split KPI",
    description:
      "Split layout with a full vertical image on the left, and a title, descriptions, and multiple large KPIs on the right. Best for high-impact metric presentations.",
    parametersSchema: z.object({
      badge: z.string().optional(),
      title: z.string(),
      imageQuery: z.string().optional(),
      kpis: z
        .array(
          z.object({
            value: z.string(),
            label: z.string(),
            description: z.string().optional(),
          }),
        )
        .max(3),
    }),
  },
  {
    key: "split_cards",
    name: "Split Cards",
    description:
      "Split layout with a full vertical image on the left, and a title followed by a stack or grid of descriptive cards on the right.",
    parametersSchema: z.object({
      badge: z.string().optional(),
      title: z.string(),
      imageQuery: z.string().optional(),
      cards: z
        .array(
          z.object({
            title: z.string(),
            body: z.string(),
            iconName: z.string().optional(), // mapped to material ui icon
          }),
        )
        .max(4),
    }),
  },
  {
    key: "image_with_list",
    name: "Image with List",
    description:
      "Medium image on the left, and a distinct feature list stack on the right. Better for features, workflows, and benefits.",
    parametersSchema: z.object({
      badge: z.string().optional(),
      title: z.string(),
      body: z.string().optional(),
      imageQuery: z.string().optional(),
      features: z
        .array(
          z.object({
            title: z.string(),
            description: z.string().optional(),
            iconName: z.string().optional(),
          }),
        )
        .max(4),
    }),
  },
  {
    key: "three_columns",
    name: "Three Columns",
    description:
      "Centered top header with three distinct equal columns below containing titles and descriptions. Great for pricing, tiers, or three-step processes.",
    parametersSchema: z.object({
      badge: z.string().optional(),
      title: z.string(),
      subtitle: z.string().optional(),
      columns: z
        .array(
          z.object({
            title: z.string(),
            body: z.string(),
            iconName: z.string().optional(),
          }),
        )
        .max(3),
    }),
  },
  {
    key: "quote_showcase",
    name: "Quote Showcase",
    description:
      "High impact split layout containing a massive quote or statement on one side, and a full-bleed visual on the other.",
    parametersSchema: z.object({
      badge: z.string().optional(),
      statement: z.string(),
      author: z.string().optional(),
      imageQuery: z.string().optional(),
    }),
  },
  {
    key: "diagram_slide",
    name: "System Diagram",
    description:
      "A large Mermaid.js diagram. Best for visualizing processes, systems, architectures, or sequences. Always output strictly valid Mermaid syntax.",
    parametersSchema: z.object({
      badge: z.string().optional(),
      title: z.string(),
      mermaidCode: z.string(),
    }),
  },
];

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
