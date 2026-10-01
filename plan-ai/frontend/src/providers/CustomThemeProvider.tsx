import React, { useMemo } from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { createTheme, ThemeOptions, alpha } from "@mui/material/styles";

import { useGetCustomThemeQuery } from "../store/apis/accountApi";
import { useSelector } from "react-redux";
import { selectUser } from "../store/slices/auth/authSelector";

import { useBrandIdentity } from "../hooks/useBrandIdentity";
import { resolveAppThemePreset } from "../utils/appThemes";

interface CustomThemeProviderProps {
  children: React.ReactNode;
}

const CustomThemeProvider: React.FC<CustomThemeProviderProps> = ({ children }) => {
  const user = useSelector(selectUser);
  const { data } = useGetCustomThemeQuery(undefined, { skip: !user });
  const customTheme = data?.data;

  const { themeOptions: brandThemeOptions, brandKey } = useBrandIdentity();

  const memoizedTheme = useMemo(() => {
    if (!customTheme) {
      return createTheme(brandThemeOptions);
    }

    // A saved preset takes its colors from the code, not from the database, so
    // a preset we improve reaches the users who already picked it.
    const preset = resolveAppThemePreset(customTheme, brandKey);
    const configJson = customTheme.configJson as Record<string, unknown> | null;

    const isLightMode = preset ? preset.isLight === true : configJson?.isLight === true;
    const primaryColor = preset?.primaryColor ?? customTheme.primaryColor;
    const secondaryColor = preset ? preset.secondaryColor : customTheme.secondaryColor;
    const backgroundColor = preset?.backgroundColor ?? customTheme.backgroundColor;
    const surfaceColor = preset?.surfaceColor ?? customTheme.surfaceColor;
    const textColor =
      (preset ? preset.textPrimaryColor : customTheme.textPrimaryColor) ||
      (isLightMode ? "#0F172A" : "#f1f5f9");
    const textSecColor =
      (preset ? preset.textSecondaryColor : customTheme.textSecondaryColor) ||
      (isLightMode ? "#475569" : "#8b9ab0");
    const borderRadius = preset ? preset.borderRadius : customTheme.borderRadius;

    const brandPalette = brandThemeOptions.palette ?? {};

    // Component styles in the brand themes read from the palette, so swapping
    // the palette and the radius is all a preset needs.
    const overrides: ThemeOptions = {
      ...brandThemeOptions,
      palette: {
        ...brandPalette,
        mode: isLightMode ? "light" : "dark",
        divider: isLightMode ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.07)",
        text: {
          primary: textColor,
          secondary: textSecColor,
        },
        // Only `main`: light, dark and contrastText are derived from it.
        ...(primaryColor ? { primary: { main: primaryColor } } : {}),
        ...(secondaryColor
          ? {
              secondary: { main: secondaryColor },
              secondary50: { main: alpha(secondaryColor, 0.5) },
            }
          : {}),
        background: {
          ...brandPalette.background,
          ...(backgroundColor ? { default: backgroundColor } : {}),
          ...(surfaceColor ? { paper: surfaceColor } : {}),
        },
      },
      ...(borderRadius !== undefined && borderRadius !== null
        ? { shape: { ...brandThemeOptions.shape, borderRadius } }
        : {}),
    };

    return createTheme(overrides);
  }, [customTheme, brandThemeOptions, brandKey]);

  return (
    <ThemeProvider theme={memoizedTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
};

export default CustomThemeProvider;
