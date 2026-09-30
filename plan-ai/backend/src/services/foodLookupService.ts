import { logger } from "../utils/logger";

/**
 * Calories per 100 g from USDA FoodData Central, a free public database.
 * The AI only names the food and guesses the grams; the energy comes from
 * here, which is far more accurate than asking the model for kcal.
 *
 * Needs USDA_FDC_API_KEY (free at https://api.data.gov/signup). Without it,
 * or when a food is not found, the caller keeps the AI's own estimate and
 * marks it as such.
 */

const SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const TIMEOUT_MS = 5000;
const CACHE_LIMIT = 2000;
/** FoodData Central nutrient id for energy in kcal. */
const ENERGY_KCAL = 1008;
const ENERGY_KCAL_ATWATER = [2047, 2048];

export interface FoodMatch {
  fdcId: number;
  description: string;
  kcalPer100g: number;
}

interface FdcNutrient {
  nutrientId?: number;
  unitName?: string;
  value?: number;
}

interface FdcFood {
  fdcId: number;
  description: string;
  foodNutrients?: FdcNutrient[];
}

const cache = new Map<string, FoodMatch | null>();

export const foodLookupConfigured = (): boolean => !!process.env.USDA_FDC_API_KEY;

function energyOf(food: FdcFood): number | null {
  const nutrients = food.foodNutrients ?? [];
  const kcal =
    nutrients.find((n) => n.nutrientId === ENERGY_KCAL && n.unitName?.toUpperCase() === "KCAL") ??
    nutrients.find(
      (n) =>
        ENERGY_KCAL_ATWATER.includes(n.nutrientId ?? -1) && n.unitName?.toUpperCase() === "KCAL",
    );
  return typeof kcal?.value === "number" && kcal.value >= 0 ? kcal.value : null;
}

/**
 * Best match for an English food name, or null. Never throws: a slow or
 * failing database must not block logging a meal.
 */
export async function lookupFood(query: string): Promise<FoodMatch | null> {
  const key = process.env.USDA_FDC_API_KEY;
  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 100);
  if (!key || !normalized) return null;
  if (cache.has(normalized)) return cache.get(normalized) ?? null;

  const params = new URLSearchParams({
    query: normalized,
    // Generic foods first; branded products are noisy for home cooking.
    dataType: "Survey (FNDDS),SR Legacy,Foundation",
    pageSize: "5",
  });
  let match: FoodMatch | null = null;
  try {
    const res = await fetch(`${SEARCH_URL}?${params.toString()}`, {
      headers: { "X-Api-Key": key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn(`[foodLookup] FoodData Central answered ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { foods?: FdcFood[] };
    for (const food of body.foods ?? []) {
      const kcal = energyOf(food);
      if (kcal !== null) {
        match = { fdcId: food.fdcId, description: food.description, kcalPer100g: kcal };
        break;
      }
    }
  } catch (err) {
    logger.warn(`[foodLookup] FoodData Central failed: ${(err as Error)?.message}`);
    return null;
  }

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(normalized, match);
  return match;
}

/** Test hook. */
export const clearFoodCache = () => cache.clear();
