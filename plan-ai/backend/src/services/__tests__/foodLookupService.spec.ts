import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearFoodCache, lookupFood } from "../foodLookupService";

const fetchMock = vi.fn();

beforeEach(() => {
  clearFoodCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.USDA_FDC_API_KEY = "test-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.USDA_FDC_API_KEY;
});

const found = (foods: unknown[]) => ({ ok: true, json: async () => ({ foods }) });

describe("USDA lookup", () => {
  it("returns kcal per 100 g and sends the key in a header, not the URL", async () => {
    fetchMock.mockResolvedValue(
      found([
        {
          fdcId: 173424,
          description: "Egg, whole, cooked, hard-boiled",
          foodNutrients: [
            { nutrientId: 1062, unitName: "kJ", value: 649 },
            { nutrientId: 1008, unitName: "KCAL", value: 155 },
          ],
        },
      ]),
    );

    expect(await lookupFood("Egg boiled")).toEqual({
      fdcId: 173424,
      description: "Egg, whole, cooked, hard-boiled",
      kcalPer100g: 155,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain("test-key");
    expect(init.headers["X-Api-Key"]).toBe("test-key");
  });

  it("asks once per food", async () => {
    fetchMock.mockResolvedValue(found([]));
    await lookupFood("rice cooked");
    await lookupFood("  Rice   cooked ");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up quietly when the service fails or has no key", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    expect(await lookupFood("bread")).toBeNull();
    delete process.env.USDA_FDC_API_KEY;
    expect(await lookupFood("pasta")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
