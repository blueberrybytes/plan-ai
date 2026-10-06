/**
 * How many items of each list a slide can show without cutting a card in half.
 * Must stay in sync with SLIDE_LIST_CAPS in
 * backend/src/services/slideTypeRegistry.ts. New decks already come capped;
 * the renderers cut too because of decks made before the caps.
 */
export const SLIDE_LIST_CAPS = {
  stats: 4,
  split_kpi: 3,
  split_cards: 4,
  image_with_list: 4,
  three_columns: 3,
  team_grid: 4,
} as const;

/** The first items of `raw` up to the cap of the slide type. Empty if not a list. */
export const capList = (slideTypeKey: keyof typeof SLIDE_LIST_CAPS, raw: unknown): unknown[] =>
  Array.isArray(raw) ? raw.slice(0, SLIDE_LIST_CAPS[slideTypeKey]) : [];
