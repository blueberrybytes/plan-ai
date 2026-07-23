import { generateText, Output } from "ai";
import { z } from "zod";
import { getWorkspaceModel, getStructuredProviderOptions, DOC_MODEL } from "../utils/aiModelUtils";
import { logger } from "../utils/logger";
import type { MockupSpec } from "../utils/mockupRender";

/**
 * Turns a prospect's brief into a structured screen spec for `mockupRender`.
 *
 * The model supplies CONTENT ONLY — never markup, never colours, never layout.
 * That is the whole safety and quality argument: model-authored markup rendered
 * server-side is both an injection surface and a lottery on what the client
 * sees, whereas model-authored content in a fixed layout is always presentable.
 */

// `.nullable()` rather than `.optional()`: strict structured-output providers
// require every property to appear in `required`, and reject schemas where it
// does not. Same convention as `aiTaskCoachService`.
const MockupSpecSchema = z.object({
  appName: z.string().describe("Short product name, 1-3 words, in the client's language"),
  screenTitle: z.string().describe("The main screen's title, 1-3 words"),
  primaryAction: z.string().describe("Label for the primary button, 2-4 words"),
  rows: z
    .array(
      z.object({
        label: z.string().describe("Item name as it would really appear, max 30 chars"),
        meta: z.string().describe("Secondary line: status, time, price. Max 34 chars"),
      }),
    )
    .describe("4-6 realistic list rows using the CLIENT'S OWN domain vocabulary"),
  stats: z.array(z.string()).describe("Exactly 3 short KPI labels, 1-2 words each"),
});

const SYSTEM = `You design realistic mobile app screens for client proposals.

You return CONTENT for a fixed layout — never markup, never colours, never sizes.

Rules:
- Write in the SAME LANGUAGE as the client's brief.
- Use the client's real domain vocabulary. For a restaurant say "Mesa 4 · 2 entrantes",
  not "Item 1". The whole point is that the client recognises their own business.
- Rows must look like real data from a working day, not placeholders.
- No emoji, no icons, no decorative symbols — the renderer draws its own.
- Keep every string within the stated character limits; longer text is truncated
  and looks broken in front of a client.`;

/**
 * Generates one spec. Kept deliberately fast and low-temperature: this runs
 * while a prospect watches a "typing…" indicator.
 */
export const buildMockupSpec = async (
  brief: string,
  workspaceId: string,
): Promise<MockupSpec | null> => {
  try {
    const model = await getWorkspaceModel(workspaceId, DOC_MODEL);

    const response = await generateText({
      model,
      providerOptions: getStructuredProviderOptions(DOC_MODEL),
      output: Output.object({
        name: "MockupSpec",
        description: "Content for a single mobile app screen mockup.",
        schema: MockupSpecSchema,
      }),
      system: SYSTEM,
      prompt: `Client brief:\n\n${brief}\n\nDesign the main screen of the app they are describing.`,
      temperature: 0.4,
      abortSignal: AbortSignal.timeout(25_000),
    });

    const spec = response.output as MockupSpec;
    return spec?.rows?.length ? spec : null;
  } catch (err) {
    // A missing mockup costs a nice-to-have; it must never fail the proposal.
    logger.warn("[mockup] spec generation failed", err);
    return null;
  }
};
