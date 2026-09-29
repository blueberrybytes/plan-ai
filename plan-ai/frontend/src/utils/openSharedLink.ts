/**
 * Documents, presentations and diagrams are private until someone shares them.
 * The "public link" buttons make the item public and then open its link.
 *
 * A public link carries a random share token, not the record id. The backend
 * creates a new token each time sharing goes from off to on. Items shared before
 * tokens existed have no token and keep working with their id.
 */

export interface ShareableItem {
  id: string;
  isPublic?: boolean;
  shareToken?: string | null;
}

/** Path segment of a public link: the share token, or the id for old shared items. */
export const publicLinkKey = (item: { id: string; shareToken?: string | null }): string =>
  item.shareToken ?? item.id;

/**
 * Returns the link key of an item, sharing it first when it is private.
 * `enableSharing` must turn sharing on and resolve with the updated item,
 * so the new share token is used.
 */
export const shareAndGetLinkKey = async (
  item: ShareableItem,
  enableSharing: () => Promise<ShareableItem>,
): Promise<string> => {
  if (item.isPublic) return publicLinkKey(item);
  const updated = await enableSharing();
  return publicLinkKey(updated);
};

/**
 * Opens the public link of an item in a new tab.
 *
 * The tab opens on the click itself, before the request, so popup blockers
 * allow it; it is closed again if sharing fails.
 *
 * @param buildPath builds the public path from the link key
 * @param getLinkKey shares the item if needed and resolves with its link key
 */
export const openSharedLink = async (
  buildPath: (linkKey: string) => string,
  getLinkKey: () => Promise<string>,
): Promise<void> => {
  const tab = window.open("", "_blank");
  try {
    const path = buildPath(await getLinkKey());
    if (tab) {
      tab.opener = null;
      tab.location.href = path;
    } else {
      window.location.href = path;
    }
  } catch (err) {
    tab?.close();
    throw err;
  }
};
