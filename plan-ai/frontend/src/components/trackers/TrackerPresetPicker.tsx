import React from "react";
import { Chip, Stack } from "@mui/material";
import { useTranslation } from "react-i18next";
import { TRACKER_PRESETS, type TrackerPreset, type TrackerPresetId } from "./trackerPresets";

interface TrackerPresetPickerProps {
  selected?: TrackerPresetId | null;
  onPick: (preset: TrackerPreset) => void;
}

/** Calories, Steps, Weight... A preset fills the tracker form. */
const TrackerPresetPicker: React.FC<TrackerPresetPickerProps> = ({ selected, onPick }) => {
  const { t } = useTranslation();
  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
      {TRACKER_PRESETS.map((preset) => (
        <Chip
          key={preset.id}
          label={t(preset.labelKey)}
          color={selected === preset.id ? "primary" : "default"}
          variant={selected === preset.id ? "filled" : "outlined"}
          onClick={() => onPick(preset)}
        />
      ))}
    </Stack>
  );
};

export default TrackerPresetPicker;
