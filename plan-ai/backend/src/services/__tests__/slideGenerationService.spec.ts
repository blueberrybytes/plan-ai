/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    presentation: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    transcript: { findMany: vi.fn() },
  } as any,
  generateText: vi.fn(),
  generateImage: vi.fn(),
}));
vi.mock("../../prisma/prismaClient", () => ({ default: mocks.db }));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
}));
vi.mock("../../utils/aiModelUtils", () => ({
  getConfiguredModel: () => "model",
  getStructuredProviderOptions: () => ({}),
  SLIDE_MODEL: "slide-model",
}));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../vector/contextFileVectorService", () => ({ queryContexts: vi.fn() }));
vi.mock("../slideTemplateService", () => ({ slideTemplateService: { getTemplateById: vi.fn() } }));
vi.mock("../imageGenerationService", () => ({
  imageGenerationService: { generateAndStoreImage: mocks.generateImage },
}));
vi.mock("../aiUsageService", () => ({
  aiUsageService: { logUsage: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../personaService", () => ({ getPersonaInstructions: vi.fn().mockResolvedValue("") }));
vi.mock("../brandThemeAccess", () => ({ assertThemeInWorkspace: vi.fn() }));
vi.mock("../auditLogService", () => ({ recordAudit: vi.fn() }));
vi.mock("../../utils/slideImages", () => ({ unsignSlideImages: vi.fn() }));
vi.mock("../../utils/shareToken", () => ({ publicLinkWhere: vi.fn(), shareTokenUpdate: vi.fn() }));

import { slideGenerationService, SlideOutlineSchema } from "../slideGenerationService";
import { applySlideCaps, SLIDE_ICON_NAMES, getSlideTypeDefinition } from "../slideTypeRegistry";

const { db } = mocks;

type Outline = { slideTypeKey: string; intent: string }[];

// Answers the outline call with `outline` and each slide call with `fill`.
const answerWith = (outline: Outline, fill: (slideNumber: number) => unknown) => {
  mocks.generateText.mockImplementation(async ({ prompt }: { prompt: string }) => {
    if (prompt.startsWith("You are a presentation architect")) {
      return { output: { title: "Deck", slides: outline } };
    }
    const slideNumber = Number(prompt.match(/slide #(\d+)/)?.[1]);
    return { output: fill(slideNumber) };
  });
};

const generate = () =>
  slideGenerationService.startPresentationGeneration("u", "ws", undefined, undefined, [], [], "x");

// The slides of the last write to the presentation.
const savedSlides = (): { slideTypeKey: string; parameters: Record<string, unknown> }[] =>
  db.presentation.update.mock.calls.at(-1)[0].data.slidesJson;

const slidePrompts = (): string[] =>
  mocks.generateText.mock.calls
    .map((c: any[]) => c[0].prompt as string)
    .filter((p: string) => p.includes("slide #"));

describe("slide generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.presentation.create.mockResolvedValue({ id: "p1", theme: null });
    db.presentation.update.mockResolvedValue({});
    db.presentation.findFirst.mockResolvedValue({ id: "p1" });
    mocks.generateImage.mockResolvedValue(null);
  });

  it("rejects a slide type key that is not registered", () => {
    const outline = (slideTypeKey: string) => ({
      title: "Deck",
      slides: [{ slideTypeKey, intent: "x" }],
    });

    expect(SlideOutlineSchema.safeParse(outline("title_only")).success).toBe(true);
    expect(SlideOutlineSchema.safeParse(outline("title_slide")).success).toBe(false);
    expect(SlideOutlineSchema.safeParse(outline("bullet-list")).success).toBe(false);
  });

  it("only accepts the icons the renderer can draw", () => {
    const schema = getSlideTypeDefinition("title_only")!.parametersSchema;
    const slide = (iconName: string | null) => ({
      badge: null,
      iconName,
      title: "Hello",
      subtitle: null,
    });

    expect(schema.safeParse(slide(SLIDE_ICON_NAMES[0])).success).toBe(true);
    expect(schema.safeParse(slide(null)).success).toBe(true);
    expect(schema.safeParse(slide("RocketLaunch")).success).toBe(false);
  });

  it("drops a slide that fails twice and keeps the rest", async () => {
    answerWith(
      [
        { slideTypeKey: "title_only", intent: "cover" },
        { slideTypeKey: "text_block", intent: "intro" },
        { slideTypeKey: "title_only", intent: "closing" },
      ],
      (n) => {
        if (n === 2) throw new Error("bad json");
        return { badge: null, iconName: null, title: `Slide ${n}`, subtitle: null };
      },
    );

    await generate();

    expect(savedSlides().map((s) => s.parameters.title)).toEqual(["Slide 1", "Slide 3"]);
    expect(slidePrompts().filter((p) => p.includes("slide #2"))).toHaveLength(2);
  });

  it("fails the deck when no slide could be filled", async () => {
    answerWith(
      [
        { slideTypeKey: "title_only", intent: "cover" },
        { slideTypeKey: "text_block", intent: "intro" },
      ],
      () => {
        throw new Error("bad json");
      },
    );

    await expect(generate()).rejects.toThrow();

    // The outline kept for the live preview is cleared, then the deck is marked failed.
    const writes = db.presentation.update.mock.calls.map((c: any[]) => c[0].data);
    expect(writes.at(-2)).toEqual({ slidesJson: [] });
    expect(writes.at(-1)).toEqual({ status: "FAILED" });
  });

  it("cuts a list to what the slide can show", async () => {
    answerWith([{ slideTypeKey: "bullet_list", intent: "points" }], () => ({
      badge: null,
      title: "Points",
      subtitle: null,
      bullets: Array.from({ length: 11 }, (_, i) => `- Point ${i + 1}`),
    }));

    await generate();

    const bullets = savedSlides()[0].parameters.bullets as string[];
    expect(bullets).toHaveLength(8);
    expect(bullets[0]).toBe("Point 1");
  });

  it("applies the cap of each slide type", () => {
    const five = [1, 2, 3, 4, 5].map((n) => ({ n }));
    const sizeOf = (key: string, field: string) =>
      (applySlideCaps(key, { [field]: five })[field] as unknown[]).length;

    expect(sizeOf("stats", "stats")).toBe(4);
    expect(sizeOf("split_kpi", "kpis")).toBe(3);
    expect(sizeOf("split_cards", "cards")).toBe(4);
    expect(sizeOf("image_with_list", "features")).toBe(4);
    expect(sizeOf("three_columns", "columns")).toBe(3);
    expect(sizeOf("team_grid", "members")).toBe(4);
    // No list on this type: nothing changes.
    expect(applySlideCaps("title_only", { title: "Hi" })).toEqual({ title: "Hi" });
  });

  it("gives the model the description of the slide type and the rules", async () => {
    answerWith([{ slideTypeKey: "bullet_list", intent: "points" }], () => ({
      badge: null,
      title: "Points",
      subtitle: null,
      bullets: ["One"],
    }));

    await generate();

    const prompt = slidePrompts()[0];
    expect(prompt).toContain(getSlideTypeDefinition("bullet_list")!.description);
    expect(prompt).toContain("no markdown");
    expect(prompt).toContain('"bullets" has at most 8 items');
  });

  it("asks for at most 4 images at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    mocks.generateImage.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((res) => setTimeout(res, 5));
      inFlight--;
      return "gs://bucket/a.png";
    });
    answerWith(
      Array.from({ length: 10 }, () => ({ slideTypeKey: "text_image", intent: "x" })),
      () => ({ badge: null, title: "T", body: "B", imageQuery: "an office" }),
    );

    await generate();

    expect(mocks.generateImage).toHaveBeenCalledTimes(10);
    expect(peak).toBe(4);
    expect(savedSlides().every((s) => s.parameters.imageUrl === "gs://bucket/a.png")).toBe(true);
  });
});
