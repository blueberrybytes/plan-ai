import React from "react";
import { MenuItem, TextField, alpha, type Theme } from "@mui/material";
import {
  TRANSLATION_LANGUAGES,
  TRANSLATION_OFF,
} from "../utils/liveTranslation";

interface TranslationLanguageSelectProps {
  /** Target language code. "" is off. */
  value: string;
  onChange: (code: string) => void;
  /** Small version without label, for the header of the Recording screen. */
  compact?: boolean;
}

const OFF_VALUE = "off";

const languageName = (code: string): string =>
  TRANSLATION_LANGUAGES.find((l) => l.code === code)?.name ?? code;

/** Target language of the live translation, with Off as the first option. */
const TranslationLanguageSelect: React.FC<TranslationLanguageSelectProps> = ({
  value,
  onChange,
  compact = false,
}) => (
  <TextField
    select
    size="small"
    fullWidth={!compact}
    label={compact ? undefined : "Translate to"}
    value={value || OFF_VALUE}
    onChange={(e) =>
      onChange(e.target.value === OFF_VALUE ? TRANSLATION_OFF : e.target.value)
    }
    SelectProps={{
      // The compact version has no label, so the value says what it is.
      renderValue: (selected) =>
        selected === OFF_VALUE
          ? compact
            ? "Translation: Off"
            : "Off"
          : compact
            ? `Translate to ${languageName(String(selected))}`
            : languageName(String(selected)),
      MenuProps: { PaperProps: { sx: { maxHeight: 250 } } },
      inputProps: { "aria-label": "Live translation language" },
    }}
    sx={{
      bgcolor: (theme: Theme) => alpha(theme.palette.text.primary, 0.05),
      ...(compact && {
        minWidth: 160,
        "& .MuiInputBase-root": { height: 32, fontSize: "0.8rem" },
      }),
    }}
  >
    <MenuItem value={OFF_VALUE} sx={{ fontSize: "0.8rem" }}>
      Off
    </MenuItem>
    {TRANSLATION_LANGUAGES.map((l) => (
      <MenuItem key={l.code} value={l.code} sx={{ fontSize: "0.8rem" }}>
        {l.name}
      </MenuItem>
    ))}
  </TextField>
);

export default TranslationLanguageSelect;
