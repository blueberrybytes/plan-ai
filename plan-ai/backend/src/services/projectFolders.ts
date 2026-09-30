import { Prisma, type IntegrationProvider } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";

/**
 * Meeting exports go into one subfolder per project inside the folder the
 * user picked in Google Drive or OneDrive. The folder id of each project is
 * kept in the integration's metadata (`projectFolders`), so renaming the
 * project renames the folder instead of making a second one, and a folder
 * deleted by hand is made again on the next export.
 */

/** What a storage provider has to offer for its folders. */
export interface FolderApi {
  /** The folder's current name, or null when it is gone (deleted or in the trash). */
  nameOf(folderId: string): Promise<string | null>;
  rename(folderId: string, name: string): Promise<void>;
  /** Creates the folder inside the picked folder (or the root) and returns its id. */
  create(name: string): Promise<string>;
}

export interface ProjectFolderRef {
  projectId: string;
  projectTitle: string;
}

// Characters Drive or OneDrive refuse in a name, and control characters.
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\\/:*?"<>|#%\x00-\x1f]/g;

/** A folder name both providers accept. */
export function projectFolderName(title: string): string {
  const clean = title.replace(FORBIDDEN, " ").replace(/\s+/g, " ").trim();
  // OneDrive refuses names that end in a dot or a space.
  const trimmed = clean.slice(0, 100).replace(/[. ]+$/, "");
  return trimmed || "Project";
}

/**
 * The id of the project's folder, made or renamed as needed. `known` is the
 * id stored for this project, if any. Returns the id and whether it changed.
 */
export async function ensureProjectFolder(
  api: FolderApi,
  known: string | undefined,
  title: string,
): Promise<{ folderId: string; changed: boolean }> {
  const name = projectFolderName(title);
  if (known) {
    const current = await api.nameOf(known);
    if (current !== null) {
      if (current !== name) await api.rename(known, name);
      return { folderId: known, changed: false };
    }
  }
  return { folderId: await api.create(name), changed: true };
}

/** The stored map of project id to folder id for an integration. */
export function storedProjectFolders(metadata: unknown): Record<string, string> {
  const map = (metadata as { projectFolders?: unknown } | null)?.projectFolders;
  if (!map || typeof map !== "object" || Array.isArray(map)) return {};
  return Object.fromEntries(
    Object.entries(map as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/**
 * Remembers a project's folder. Reads the metadata again right before the
 * write, so a folder saved meanwhile by another export is kept.
 */
export async function rememberProjectFolder(
  workspaceId: string,
  provider: IntegrationProvider,
  projectId: string,
  folderId: string,
): Promise<void> {
  const key = { workspaceId_provider: { workspaceId, provider } };
  const row = await prisma.workspaceIntegration.findUnique({
    where: key,
    select: { metadata: true },
  });
  const metadata = (row?.metadata ?? {}) as Prisma.JsonObject;
  await prisma.workspaceIntegration.update({
    where: key,
    data: {
      metadata: {
        ...metadata,
        projectFolders: { ...storedProjectFolders(metadata), [projectId]: folderId },
      },
    },
  });
}

/**
 * The folder a meeting of this project goes into, or null to use the picked
 * folder as before. Never throws: a folder problem must not lose the export.
 */
export async function resolveProjectFolder(
  workspaceId: string,
  provider: IntegrationProvider,
  metadata: unknown,
  project: ProjectFolderRef | undefined,
  api: FolderApi,
): Promise<string | null> {
  if (!project) return null;
  try {
    const known = storedProjectFolders(metadata)[project.projectId];
    const { folderId, changed } = await ensureProjectFolder(api, known, project.projectTitle);
    if (changed) {
      await rememberProjectFolder(workspaceId, provider, project.projectId, folderId);
    }
    return folderId;
  } catch (err) {
    logger.error(
      `[projectFolders] ${provider} folder for project ${project.projectId} failed, using the picked folder`,
      err,
    );
    return null;
  }
}
