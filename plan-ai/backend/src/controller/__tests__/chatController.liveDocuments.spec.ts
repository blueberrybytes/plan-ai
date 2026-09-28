/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
  stepCountIs: vi.fn(),
}));
vi.mock("../../prisma/prismaClient", () => ({ default: {} }));
vi.mock("../../firebase/firebaseStorage", () => ({
  uploadChatAttachmentToFirebaseStorage: vi.fn(),
}));
vi.mock("../../firebase/privateStorage", () => ({
  DISPLAY_URL_TTL_MS: 0,
  signedUrlForPath: vi.fn(),
}));
vi.mock("../../services/chatAttachments", () => ({ toDisplayAttachments: vi.fn() }));
vi.mock("../../vector/contextFileVectorService", () => ({ queryContexts: vi.fn() }));
vi.mock("../../services/mcpClientService", () => ({ mcpClientService: {} }));
vi.mock("../../services/aiUsageService", () => ({
  aiUsageService: { logUsage: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../utils/aiModelUtils", () => ({
  getConfiguredModel: vi.fn(),
  getFallbackProviderOptions: vi.fn(),
  DEFAULT_AI_MODEL: "default",
  FAST_AI_MODEL: "fast",
}));

import { ChatController } from "../chatController";

const upload = (name: string, mimetype: string, content: string) =>
  ({
    originalname: name,
    mimetype,
    size: Buffer.byteLength(content),
    buffer: Buffer.from(content),
  }) as Express.Multer.File;

const makeController = () => {
  const controller = new ChatController();
  const access = { user: { id: "user-1" }, workspaceId: "ws-1" };
  vi.spyOn(controller as any, "getAuthorizedWorkspaceAccess").mockResolvedValue(access);
  vi.spyOn(controller as any, "getPaidLlmAccess").mockResolvedValue(access);
  vi.spyOn(controller as any, "resolveAndValidate").mockResolvedValue([]);
  return controller;
};

const systemPromptOfLastCall = (): string =>
  generateText.mock.calls.at(-1)?.[0].messages[0].content;

describe("ChatController live chat documents", () => {
  beforeEach(() => {
    generateText.mockReset();
    generateText.mockResolvedValue({ text: "answer", totalUsage: {} });
  });

  it("reads a markdown file the OS sent without a type", async () => {
    const res = await makeController().extractLiveChatDocument(
      {} as any,
      upload("notes.md", "application/octet-stream", "# Budget\nQ4 is 40k."),
    );

    expect(res.data).toEqual({
      name: "notes.md",
      mimeType: "text/markdown",
      size: 19,
      text: "# Budget\nQ4 is 40k.",
      truncated: false,
    });
  });

  it("rejects images", async () => {
    await expect(
      makeController().extractLiveChatDocument({} as any, upload("shot.png", "image/png", "x")),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a file with no text", async () => {
    await expect(
      makeController().extractLiveChatDocument({} as any, upload("empty.txt", "text/plain", "  ")),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("cuts a long file and says so", async () => {
    const res = await makeController().extractLiveChatDocument(
      {} as any,
      upload("big.txt", "text/plain", "a".repeat(60_000)),
    );

    expect(res.data?.truncated).toBe(true);
    expect(res.data?.text).toHaveLength(50_000);
  });

  it("puts the attached files in the live chat prompt", async () => {
    await makeController().sendMessageLive(
      {
        content: "What is the Q4 budget?",
        liveTranscript: "User: let's check the budget",
        documents: [{ name: "notes.md", text: "Q4 is 40k." }],
      },
      {} as any,
    );

    const prompt = systemPromptOfLastCall();
    expect(prompt).toContain("<meeting_documents>");
    expect(prompt).toContain('<document name="notes.md">\nQ4 is 40k.\n</document>');
  });

  it("leaves the prompt as before when nothing is attached", async () => {
    await makeController().sendMessageLive(
      { content: "Summary?", liveTranscript: "User: hi" },
      {} as any,
    );

    expect(systemPromptOfLastCall()).not.toContain("<meeting_documents>");
  });

  it("keeps all files together under 150,000 characters", async () => {
    await makeController().sendMessageLive(
      {
        content: "q",
        liveTranscript: "t",
        documents: ["a", "b", "c", "d"].map((n) => ({ name: `${n}.txt`, text: n.repeat(50_000) })),
      },
      {} as any,
    );

    const prompt = systemPromptOfLastCall();
    expect(prompt).toContain('<document name="c.txt">');
    expect(prompt).not.toContain('<document name="d.txt">');
  });
});
