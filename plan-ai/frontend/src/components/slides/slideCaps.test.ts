import { capList, SLIDE_LIST_CAPS } from "./slideCaps";

describe("capList", () => {
  const six = [1, 2, 3, 4, 5, 6];

  it("cuts each list to what its slide can show", () => {
    expect(capList("stats", six)).toEqual([1, 2, 3, 4]);
    expect(capList("split_kpi", six)).toEqual([1, 2, 3]);
    expect(capList("split_cards", six)).toEqual([1, 2, 3, 4]);
    expect(capList("image_with_list", six)).toEqual([1, 2, 3, 4]);
    expect(capList("three_columns", six)).toEqual([1, 2, 3]);
    expect(capList("team_grid", six)).toEqual([1, 2, 3, 4]);
  });

  it("leaves a short list alone and does not change the original", () => {
    expect(capList("stats", [1, 2])).toEqual([1, 2]);
    capList("split_kpi", six);
    expect(six).toHaveLength(6);
  });

  it("gives an empty list for anything that is not a list", () => {
    expect(capList("stats", undefined)).toEqual([]);
    expect(capList("stats", null)).toEqual([]);
    expect(capList("stats", "a\nb")).toEqual([]);
  });

  it("has the caps the backend registry uses", () => {
    expect(SLIDE_LIST_CAPS).toEqual({
      stats: 4,
      split_kpi: 3,
      split_cards: 4,
      image_with_list: 4,
      three_columns: 3,
      team_grid: 4,
    });
  });
});
