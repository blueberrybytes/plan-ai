import prisma from "../prisma/prismaClient";

/**
 * A document, deck or diagram can only use a theme of its own workspace.
 * Without this check a known theme id from another workspace could be
 * attached, and its logo and colours read back through the item.
 * Null or undefined (no theme, or no change) passes.
 */
export async function assertThemeInWorkspace(
  themeId: string | null | undefined,
  workspaceId: string,
): Promise<void> {
  if (!themeId) return;
  const theme = await prisma.brandTheme.findFirst({
    where: { id: themeId, workspaceId },
    select: { id: true },
  });
  if (!theme) throw { status: 400, message: "Theme not found in this workspace" };
}
