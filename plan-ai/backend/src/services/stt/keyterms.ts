import prisma from "../../prisma/prismaClient";

/**
 * The project vocabulary (names, products, acronyms) stored on the contexts a
 * recording belongs to. The live stream sends it to Deepgram as `keyterm`;
 * the Whisper passes send it as their prompt.
 */
export const collectContextKeyterms = async (
  contextIds: string[],
  limit = 100,
): Promise<string[]> => {
  if (contextIds.length === 0) return [];
  const contexts = await prisma.context.findMany({
    where: { id: { in: contextIds } },
    select: { keywords: true },
  });
  const all = new Set<string>();
  for (const c of contexts) {
    if (Array.isArray(c.keywords)) c.keywords.forEach((k) => all.add(k));
  }
  return Array.from(all).slice(0, limit);
};
