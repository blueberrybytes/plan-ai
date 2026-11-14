import {
  HttpError,
  TrackerApiError,
  type Tracker,
  type TrackerInput,
} from "../../services/planAiApi";
import { parseTypedNumber } from "../../utils/trackerFormat";

// Same presets, fields and checks as the web tracker form.

type Kind = Tracker["kind"];
type Aggregation = Tracker["aggregation"];
type GoalDirection = NonNullable<Tracker["goalDirection"]>;
type Period = NonNullable<Tracker["goalPeriod"]>;

/** What the form edits. Numbers stay as typed until saved. */
export interface TrackerFormState {
  name: string;
  kind: Kind;
  unit: string;
  aggregation: Aggregation;
  goal: GoalDirection | "NONE";
  goalValue: string;
  goalPeriod: Period;
  instructions: string;
}

export type TrackerPresetId = "calories" | "steps" | "weight" | "sleep" | "gym" | "water" | "custom";

export interface TrackerPreset {
  id: TrackerPresetId;
  label: string;
  input: Omit<TrackerInput, "name">;
}

const NO_GOAL = { goalValue: null, goalDirection: null, goalPeriod: null } as const;

export const TRACKER_PRESETS: TrackerPreset[] = [
  {
    id: "calories",
    label: "Calories",
    input: { kind: "CALORIES", unit: "kcal", aggregation: "SUM", goalValue: 2000, goalDirection: "AT_MOST", goalPeriod: "DAY" },
  },
  {
    id: "steps",
    label: "Steps",
    input: { kind: "NUMBER", unit: "steps", aggregation: "SUM", goalValue: 10000, goalDirection: "AT_LEAST", goalPeriod: "DAY" },
  },
  { id: "weight", label: "Weight", input: { kind: "NUMBER", unit: "kg", aggregation: "LAST", ...NO_GOAL } },
  {
    id: "sleep",
    label: "Sleep",
    input: { kind: "NUMBER", unit: "h", aggregation: "SUM", goalValue: 7, goalDirection: "AT_LEAST", goalPeriod: "DAY" },
  },
  {
    id: "gym",
    label: "Gym",
    input: { kind: "CHECK", unit: null, aggregation: "SUM", goalValue: 3, goalDirection: "AT_LEAST", goalPeriod: "WEEK" },
  },
  {
    id: "water",
    label: "Water",
    input: { kind: "NUMBER", unit: "l", aggregation: "SUM", goalValue: 2, goalDirection: "AT_LEAST", goalPeriod: "DAY" },
  },
  { id: "custom", label: "Custom", input: { kind: "NUMBER", unit: "", aggregation: "SUM", ...NO_GOAL } },
];

export const KIND_LABELS: Record<Kind, string> = {
  NUMBER: "Number",
  CHECK: "Done or not done",
  CALORIES: "Calories",
};

export const KIND_HELP: Record<Kind, string> = {
  NUMBER: "A number you log, like steps, weight or hours.",
  CHECK: "Something you do or not, like going to the gym.",
  CALORIES: "The AI estimates kcal from what you ate. Always in kcal.",
};

export const AGGREGATION_LABELS: Record<Aggregation, string> = {
  SUM: "Add up the values",
  LAST: "Keep the last value",
  AVERAGE: "Average of the values",
};

export const GOAL_LABELS: Record<TrackerFormState["goal"], string> = {
  NONE: "No goal",
  AT_LEAST: "At least",
  AT_MOST: "At most",
};

export const PERIOD_LABELS: Record<Period, string> = { DAY: "Day", WEEK: "Week" };

export const formFromPreset = (preset: TrackerPreset): TrackerFormState => ({
  // The custom preset starts with an empty name.
  name: preset.id === "custom" ? "" : preset.label,
  kind: preset.input.kind ?? "NUMBER",
  unit: preset.input.unit ?? "",
  aggregation: preset.input.aggregation ?? "SUM",
  goal: preset.input.goalDirection ?? "NONE",
  goalValue: preset.input.goalValue != null ? String(preset.input.goalValue) : "",
  goalPeriod: preset.input.goalPeriod ?? "DAY",
  instructions: "",
});

export const formFromTracker = (tracker: Tracker): TrackerFormState => ({
  name: tracker.name,
  kind: tracker.kind,
  unit: tracker.unit ?? "",
  aggregation: tracker.aggregation,
  goal: tracker.goalValue !== null && tracker.goalDirection ? tracker.goalDirection : "NONE",
  goalValue: tracker.goalValue !== null ? String(tracker.goalValue) : "",
  goalPeriod: tracker.goalPeriod ?? "DAY",
  instructions: tracker.instructions ?? "",
});

/** Null when the form can be saved, else the first problem in words. */
export const formProblem = (form: TrackerFormState): string | null => {
  if (!form.name.trim()) return "Give the tracker a name.";
  if (form.goal !== "NONE") {
    const goal = parseTypedNumber(form.goalValue);
    if (goal === null || goal <= 0) return "The goal must be a number above 0.";
  }
  return null;
};

/**
 * The request body. Kind is sent only on create, because it cannot change.
 * The server fixes unit and aggregation for CALORIES and CHECK trackers.
 */
export const formToInput = (form: TrackerFormState, creating: boolean): TrackerInput => {
  const goal =
    form.goal === "NONE"
      ? { goalValue: null, goalDirection: null, goalPeriod: null }
      : {
          goalValue: parseTypedNumber(form.goalValue),
          goalDirection: form.goal,
          goalPeriod: form.goalPeriod,
        };
  return {
    name: form.name.trim(),
    ...(creating ? { kind: form.kind } : {}),
    ...(form.kind === "NUMBER" ? { unit: form.unit.trim() || null, aggregation: form.aggregation } : {}),
    ...goal,
    instructions: form.instructions.trim() || null,
  };
};

/** Words for a failed setup call. Never the request body. */
export function setupErrorText(err: unknown, fallback = "Something went wrong. Try again."): string {
  if (err instanceof HttpError && err.status === undefined) {
    return "No connection. This needs the network. Try again when you are online.";
  }
  if (err instanceof TrackerApiError && err.status !== undefined && err.status < 500 && err.message) {
    return err.message;
  }
  return fallback;
}
