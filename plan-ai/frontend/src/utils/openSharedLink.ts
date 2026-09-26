/**
 * Documents and presentations are private until someone shares them. The
 * "public link" buttons make the item public and then open its link.
 *
 * The tab opens on the click itself, before the request, so popup blockers
 * allow it; it's closed again if sharing fails.
 */
export const openSharedLink = async (
  path: string,
  share: () => Promise<unknown>,
): Promise<void> => {
  const tab = window.open("", "_blank");
  try {
    await share();
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
