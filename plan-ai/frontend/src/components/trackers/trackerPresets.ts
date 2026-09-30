import type { TrackerInput } from "../../store/apis/trackersApi";

export type TrackerPresetId =
  | "calories"
  | "steps"
  | "weight"
  | "sleep"
  | "gym"
  | "water"
  | "custom";

export interface TrackerPreset {
  id: TrackerPresetId;
  /** i18n key of the preset name, also used as the tracker's default name. */
  labelKey: string;
  input: Omit<TrackerInput, "name">;
}

const NO_GOAL = { goalValue: null, goalDirection: null, goalPeriod: null } as const;

export const TRACKER_PRESETS: TrackerPreset[] = [
  {
    id: "calories",
    labelKey: "trackers.presets.calories",
    input: {
      kind: "CALORIES",
      unit: "kcal",
      aggregation: "SUM",
      goalValue: 2000,
      goalDirection: "AT_MOST",
      goalPeriod: "DAY",
    },
  },
  {
    id: "steps",
    labelKey: "trackers.presets.steps",
    input: {
      kind: "NUMBER",
      unit: "steps",
      aggregation: "SUM",
      goalValue: 10000,
      goalDirection: "AT_LEAST",
      goalPeriod: "DAY",
    },
  },
  {
    id: "weight",
    labelKey: "trackers.presets.weight",
    input: { kind: "NUMBER", unit: "kg", aggregation: "LAST", ...NO_GOAL },
  },
  {
    id: "sleep",
    labelKey: "trackers.presets.sleep",
    input: {
      kind: "NUMBER",
      unit: "h",
      aggregation: "SUM",
      goalValue: 7,
      goalDirection: "AT_LEAST",
      goalPeriod: "DAY",
    },
  },
  {
    id: "gym",
    labelKey: "trackers.presets.gym",
    input: {
      kind: "CHECK",
      unit: null,
      aggregation: "SUM",
      goalValue: 3,
      goalDirection: "AT_LEAST",
      goalPeriod: "WEEK",
    },
  },
  {
    id: "water",
    labelKey: "trackers.presets.water",
    input: {
      kind: "NUMBER",
      unit: "l",
      aggregation: "SUM",
      goalValue: 2,
      goalDirection: "AT_LEAST",
      goalPeriod: "DAY",
    },
  },
  {
    id: "custom",
    labelKey: "trackers.presets.custom",
    input: { kind: "NUMBER", unit: "", aggregation: "SUM", ...NO_GOAL },
  },
];
