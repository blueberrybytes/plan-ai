import type {
  Tracker,
  TrackerAggregation,
  TrackerGoalDirection,
  TrackerInput,
  TrackerKind,
  TrackerPeriod,
} from "../../store/apis/trackersApi";
import type { TrackerPreset } from "./trackerPresets";
import { parseAmount } from "./trackerUtils";

/** What the tracker dialog edits. Numbers stay as typed until saved. */
export interface TrackerFormState {
  name: string;
  kind: TrackerKind;
  unit: string;
  aggregation: TrackerAggregation;
  goal: TrackerGoalDirection | "NONE";
  goalValue: string;
  goalPeriod: TrackerPeriod;
  instructions: string;
}

export const formFromPreset = (preset: TrackerPreset, name: string): TrackerFormState => ({
  name,
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

/** Null when the form can be saved, else the i18n key of the first problem. */
export const formProblem = (form: TrackerFormState): string | null => {
  if (!form.name.trim()) return "trackers.form.errors.name";
  if (form.goal !== "NONE") {
    const goal = parseAmount(form.goalValue);
    if (goal === null || goal <= 0) return "trackers.form.errors.goal";
  }
  return null;
};

/**
 * The request body. Kind is sent only on create (it cannot change). The
 * server fixes unit and aggregation for CALORIES and CHECK trackers.
 */
export const formToInput = (form: TrackerFormState, creating: boolean): TrackerInput => {
  const goal =
    form.goal === "NONE"
      ? { goalValue: null, goalDirection: null, goalPeriod: null }
      : {
          goalValue: parseAmount(form.goalValue),
          goalDirection: form.goal,
          goalPeriod: form.goalPeriod,
        };
  return {
    name: form.name.trim(),
    ...(creating ? { kind: form.kind } : {}),
    ...(form.kind === "NUMBER"
      ? { unit: form.unit.trim() || null, aggregation: form.aggregation }
      : {}),
    ...goal,
    instructions: form.instructions.trim() || null,
  };
};
