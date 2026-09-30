import { formFromPreset, formProblem, formToInput } from "./trackerForm";
import { TRACKER_PRESETS } from "./trackerPresets";

const preset = (id: string) => {
  const found = TRACKER_PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`No preset ${id}`);
  return found;
};

describe("tracker form", () => {
  it("sends the kind only on create", () => {
    const form = formFromPreset(preset("steps"), "Steps");
    expect(formToInput(form, true)).toMatchObject({
      name: "Steps",
      kind: "NUMBER",
      unit: "steps",
      aggregation: "SUM",
      goalValue: 10000,
      goalDirection: "AT_LEAST",
      goalPeriod: "DAY",
    });
    expect(formToInput(form, false)).not.toHaveProperty("kind");
  });

  it("leaves unit and aggregation to the server for CHECK and CALORIES", () => {
    const gym = formToInput(formFromPreset(preset("gym"), "Gym"), true);
    expect(gym).not.toHaveProperty("unit");
    expect(gym).toMatchObject({ kind: "CHECK", goalValue: 3, goalPeriod: "WEEK" });
    const calories = formToInput(formFromPreset(preset("calories"), "Calories"), true);
    expect(calories).not.toHaveProperty("aggregation");
    expect(calories).toMatchObject({ goalValue: 2000, goalDirection: "AT_MOST" });
  });

  it("sends nulls to remove the goal", () => {
    const form = { ...formFromPreset(preset("weight"), "Weight"), goal: "NONE" as const };
    expect(formToInput(form, false)).toMatchObject({
      goalValue: null,
      goalDirection: null,
      goalPeriod: null,
    });
  });

  it("needs a name and a positive goal", () => {
    const form = formFromPreset(preset("water"), "Water");
    expect(formProblem(form)).toBeNull();
    expect(formProblem({ ...form, name: " " })).toBe("trackers.form.errors.name");
    expect(formProblem({ ...form, goalValue: "0" })).toBe("trackers.form.errors.goal");
    expect(formProblem({ ...form, goal: "NONE", goalValue: "" })).toBeNull();
  });
});
