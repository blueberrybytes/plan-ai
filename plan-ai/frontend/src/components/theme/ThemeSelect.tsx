import React from "react";
import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  type SelectChangeEvent,
  Stack,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useGetBrandThemesQuery } from "../../store/apis/brandThemeApi";

const NONE_VALUE = "__none__";

export interface ThemeSelectProps {
  /** Currently selected theme id, or null/undefined for "none". */
  value: string | null | undefined;
  /** Called with the new theme id, or null when "None" is chosen. */
  onChange: (themeId: string | null) => void;
  label?: string;
  helperText?: string;
  disabled?: boolean;
  size?: "small" | "medium";
  fullWidth?: boolean;
}

/** Small color swatch preview for a theme (primary + secondary). */
const Swatch: React.FC<{ primary?: string; secondary?: string }> = ({ primary, secondary }) => (
  <Box
    sx={{
      width: 16,
      height: 16,
      borderRadius: "4px",
      flexShrink: 0,
      border: "1px solid rgba(0,0,0,0.12)",
      background: `linear-gradient(135deg, ${primary || "#4361EE"} 0%, ${primary || "#4361EE"} 50%, ${secondary || "#a78bfa"} 50%, ${secondary || "#a78bfa"} 100%)`,
    }}
  />
);

/**
 * Reusable brand-theme picker backed by the workspace's BrandThemes.
 * Emits `null` for the "None" option. Used for the project default theme and
 * the workspace-wide default theme.
 */
const ThemeSelect: React.FC<ThemeSelectProps> = ({
  value,
  onChange,
  label,
  helperText,
  disabled,
  size = "small",
  fullWidth = true,
}) => {
  const { t } = useTranslation();
  const { data: themes, isLoading } = useGetBrandThemesQuery();

  const handleChange = (e: SelectChangeEvent<string>) => {
    const v = e.target.value;
    onChange(v === NONE_VALUE ? null : v);
  };

  const resolvedLabel = label ?? t("themeSelect.label", "Brand theme");

  return (
    <FormControl fullWidth={fullWidth} size={size} disabled={disabled || isLoading}>
      <InputLabel id="theme-select-label">{resolvedLabel}</InputLabel>
      <Select
        labelId="theme-select-label"
        label={resolvedLabel}
        value={value ?? NONE_VALUE}
        onChange={handleChange}
        renderValue={(selected) => {
          if (selected === NONE_VALUE) {
            return (
              <Typography variant="body2" color="text.secondary">
                {t("themeSelect.none", "None")}
              </Typography>
            );
          }
          const theme = themes?.find((th) => th.id === selected);
          return (
            <Stack direction="row" spacing={1} alignItems="center">
              <Swatch primary={theme?.primaryColor} secondary={theme?.secondaryColor} />
              <Typography variant="body2">{theme?.name ?? selected}</Typography>
            </Stack>
          );
        }}
      >
        <MenuItem value={NONE_VALUE}>
          <Typography variant="body2" color="text.secondary">
            {t("themeSelect.none", "None")}
          </Typography>
        </MenuItem>
        {themes?.map((theme) => (
          <MenuItem key={theme.id} value={theme.id}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Swatch primary={theme.primaryColor} secondary={theme.secondaryColor} />
              <Typography variant="body2">{theme.name}</Typography>
            </Stack>
          </MenuItem>
        ))}
      </Select>
      {helperText && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
          {helperText}
        </Typography>
      )}
    </FormControl>
  );
};

export default ThemeSelect;
