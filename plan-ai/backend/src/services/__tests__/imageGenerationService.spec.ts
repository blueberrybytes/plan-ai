import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  provider: vi.fn(() => "openrouter"),
  findUnique: vi.fn(),
  upload: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("../../utils/localAi", () => ({ getLlmProvider: mocks.provider }));
vi.mock("../../prisma/prismaClient", () => ({
  default: { presentation: { findUnique: mocks.findUnique } },
}));
vi.mock("../../utils/aiModelUtils", () => ({
  privacyProviderPrefs: () => ({}),
  resolveWorkspaceApiKey: vi.fn().mockResolvedValue("key"),
}));
vi.mock("../../firebase/privateStorage", () => ({ uploadPrivateFile: mocks.upload }));
vi.mock("../aiUsageService", () => ({
  aiUsageService: { logUsage: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { imageGenerationService } from "../imageGenerationService";

const imageAnswer = {
  ok: true,
  json: async () => ({
    choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,AAAA" } }] } }],
  }),
};
const errorAnswer = { ok: false, status: 429 };

describe("generateAndStoreImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.provider.mockReturnValue("openrouter");
    mocks.findUnique.mockResolvedValue({ workspaceId: "ws" });
    mocks.upload.mockResolvedValue("gs://bucket/presentations/u/p/a.png");
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("retries a failed image once and returns the stored reference", async () => {
    mocks.fetch.mockResolvedValueOnce(errorAnswer).mockResolvedValueOnce(imageAnswer);

    const ref = await imageGenerationService.generateAndStoreImage("an office", "u", "p");

    expect(ref).toBe("gs://bucket/presentations/u/p/a.png");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after the second failure", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(errorAnswer);

    expect(await imageGenerationService.generateAndStoreImage("an office", "u", "p")).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not ask twice when the first answer is good", async () => {
    mocks.fetch.mockResolvedValue(imageAnswer);

    await imageGenerationService.generateAndStoreImage("an office", "u", "p");

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("sends nothing on a self-hosted deployment", async () => {
    mocks.provider.mockReturnValue("local");

    expect(await imageGenerationService.generateAndStoreImage("an office", "u", "p")).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
