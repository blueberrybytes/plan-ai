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
      "Opening or closing slide with a large title and optional subtitle. Best for section dividers or cover slides.",
    parametersSchema: z.object({
      title: z.string().max(50),
      subtitle: z.string().max(120).optional(),
    }),
  },
  {
    key: "text_block",
    name: "Text Block",
    description:
      "Full-width text content with a title and body paragraph. Best for explanations, introductions, or summaries.",
    parametersSchema: z.object({
      title: z.string().max(50),
      body: z.string().max(500),
    }),
  },
  {
    key: "text_image",
    name: "Text + Image",
    description:
      "Split layout with text on the left and an image on the right. Best for illustrating a concept with a visual.",
    parametersSchema: z.object({
      title: z.string().max(50),
      body: z.string().max(300),
      imageQuery: z.string().max(100).optional(),
    }),
  },
  {
    key: "bullet_list",
    name: "Bullet List",
    description:
      "Title with a list of bullet points. Best for enumerating features, steps, or key points.",
    parametersSchema: z.object({
      title: z.string().max(50),
      bullets: z.array(z.string().max(80)).max(8),
    }),
  },
  {
    key: "two_columns",
    name: "Two Columns",
    description:
      "Two-column layout with a title. Best for comparisons, pros/cons, or side-by-side information.",
    parametersSchema: z.object({
      title: z.string().max(50),
      leftTitle: z.string().max(40).optional(),
      leftBody: z.string().max(250),
      rightTitle: z.string().max(40).optional(),
      rightBody: z.string().max(250),
    }),
  },
  {
    key: "team_grid",
    name: "Team Members",
    description:
      "Grid of team member cards with name, role, and short bio. Best for showing 2 to 4 people.",
    parametersSchema: z.object({
      title: z.string().max(50),
      members: z
        .array(
          z.object({
            name: z.string().max(30),
            role: z.string().max(40),
            bio: z.string().max(120),
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
      title: z.string().max(50),
      imageQuery: z.string().max(100).optional(),
      caption: z.string().max(200),
    }),
  },
  {
    key: "stats",
    name: "Key Stats",
    description:
      "Display key metrics or statistics prominently. Best for numbers, KPIs, or data highlights.",
    parametersSchema: z.object({
      title: z.string().max(50),
      stats: z
        .array(
          z.object({
            label: z.string().max(40),
            value: z.string().max(20),
          }),
        )
        .max(6),
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
