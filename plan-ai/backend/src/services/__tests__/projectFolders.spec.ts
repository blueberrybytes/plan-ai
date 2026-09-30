import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  workspaceIntegration: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock("../../prisma/prismaClient", () => ({ default: db }));

import {
  ensureProjectFolder,
  projectFolderName,
  resolveProjectFolder,
  type FolderApi,
} from "../projectFolders";

const fakeApi = (folders: Record<string, string> = {}): FolderApi & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    nameOf: async (id) => folders[id] ?? null,
    rename: async (id, name) => {
      calls.push(`rename ${id} ${name}`);
      folders[id] = name;
    },
    create: async (name) => {
      calls.push(`create ${name}`);
      return "new-folder";
    },
  };
};

beforeEach(() => vi.resetAllMocks());

describe("folder names", () => {
  it("drops characters Drive or OneDrive refuse", () => {
    expect(projectFolderName('Q3: "Acme" / Globex?')).toBe("Q3 Acme Globex");
    expect(projectFolderName("Launch plan. ")).toBe("Launch plan");
    expect(projectFolderName("   ")).toBe("Project");
  });
});

describe("project folder", () => {
  it("reuses the stored folder", async () => {
    const api = fakeApi({ f1: "Acme" });
    expect(await ensureProjectFolder(api, "f1", "Acme")).toEqual({
      folderId: "f1",
      changed: false,
    });
    expect(api.calls).toEqual([]);
  });

  it("renames the folder when the project was renamed", async () => {
    const api = fakeApi({ f1: "Acme" });
    await ensureProjectFolder(api, "f1", "Acme Corp");
    expect(api.calls).toEqual(["rename f1 Acme Corp"]);
  });

  it("makes it again when it was deleted by hand", async () => {
    const api = fakeApi({});
    expect(await ensureProjectFolder(api, "gone", "Acme")).toEqual({
      folderId: "new-folder",
      changed: true,
    });
  });

  it("stores a new folder and keeps the other projects' folders", async () => {
    db.workspaceIntegration.findUnique.mockResolvedValue({
      metadata: { defaultFolderId: "root", projectFolders: { other: "f9" } },
    });
    const id = await resolveProjectFolder(
      "ws1",
      "GOOGLE_DRIVE",
      { defaultFolderId: "root" },
      { projectId: "p1", projectTitle: "Acme" },
      fakeApi(),
    );
    expect(id).toBe("new-folder");
    expect(db.workspaceIntegration.update.mock.calls[0][0].data.metadata).toEqual({
      defaultFolderId: "root",
      projectFolders: { other: "f9", p1: "new-folder" },
    });
  });

  it("falls back to the picked folder when the provider fails", async () => {
    const api = fakeApi();
    api.create = async () => {
      throw new Error("403");
    };
    const id = await resolveProjectFolder(
      "ws1",
      "ONEDRIVE",
      {},
      { projectId: "p1", projectTitle: "Acme" },
      api,
    );
    expect(id).toBeNull();
  });

  it("uses the picked folder for a meeting with no project", async () => {
    expect(await resolveProjectFolder("ws1", "ONEDRIVE", {}, undefined, fakeApi())).toBeNull();
  });
});
