import React, { useMemo } from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { createTheme, ThemeOptions, alpha, darken, lighten } from "@mui/material/styles";

import { useGetCustomThemeQuery } from "../store/apis/accountApi";
import { useSelector } from "react-redux";
import { selectUser } from "../store/slices/auth/authSelector";

import { useBrandIdentity } from "../hooks/useBrandIdentity";

interface CustomThemeProviderProps {
  children: React.ReactNode;
}

const CustomThemeProvider: React.FC<CustomThemeProviderProps> = ({ children }) => {
  const user = useSelector(selectUser);
  const { data } = useGetCustomThemeQuery(undefined, { skip: !user });
  const customTheme = data?.data;

  const { themeOptions: brandThemeOptions } = useBrandIdentity();

  const memoizedTheme = useMemo(() => {
    if (!customTheme) {
      return createTheme(brandThemeOptions);
    }

    const overrides: ThemeOptions = {
      ...brandThemeOptions,
      components: { ...brandThemeOptions.components },
    };

    const configJson = customTheme.configJson as Record<string, unknown> | null;
    const isLightMode = configJson?.isLight === true;
    const dividerColor = isLightMode ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)";
    const scrollbarColor = isLightMode ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.1)";
    const textColor = customTheme.textPrimaryColor || (isLightMode ? "#0F172A" : "#f8fafc");
    const textSecColor = customTheme.textSecondaryColor || (isLightMode ? "#475569" : "#94a3b8");

    // Deep override palette
    if (
      customTheme.primaryColor ||
      customTheme.secondaryColor ||
      customTheme.backgroundColor ||
      customTheme.surfaceColor ||
      isLightMode
    ) {
      overrides.palette = {
        ...brandThemeOptions.palette,
        mode: isLightMode ? "light" : "dark",
        divider: dividerColor,
        text: {
          primary: textColor,
          secondary: textSecColor,
        },
      };

      if (customTheme.primaryColor && overrides.palette?.primary) {
        overrides.palette.primary = {
          ...overrides.palette.primary,
          main: customTheme.primaryColor,
          light: lighten(customTheme.primaryColor, 0.2),
          dark: darken(customTheme.primaryColor, 0.2),
        };
      }

      if (customTheme.secondaryColor && overrides.palette?.secondary) {
        overrides.palette.secondary = {
          ...overrides.palette.secondary,
          main: customTheme.secondaryColor,
          light: lighten(customTheme.secondaryColor, 0.2),
          dark: darken(customTheme.secondaryColor, 0.2),
        };
        overrides.palette.secondary50 = {
          main: alpha(customTheme.secondaryColor, 0.5),
        };
      }

      if (customTheme.backgroundColor && overrides.palette?.background) {
        overrides.palette.background = {
          ...overrides.palette.background,
          default: customTheme.backgroundColor,
        };
      }

      if (customTheme.surfaceColor && overrides.palette?.background) {
        overrides.palette.background.paper = customTheme.surfaceColor;
      }
    }

    // Shapes override
    if (customTheme.borderRadius !== undefined && customTheme.borderRadius !== null) {
      overrides.shape = {
        ...brandThemeOptions.shape,
        borderRadius: customTheme.borderRadius,
      };
    }

    if (overrides.components) {
      if (customTheme.backgroundColor || isLightMode) {
        if (overrides.components.MuiCssBaseline) {
          overrides.components.MuiCssBaseline = {
            ...overrides.components.MuiCssBaseline,
            styleOverrides: {
              body: {
                backgroundColor:
                  customTheme.backgroundColor || overrides.palette?.background?.default,
                color: textColor,
                scrollbarColor: `${scrollbarColor} transparent`,
                "&::-webkit-scrollbar": {
                  width: 8,
                },
                "&::-webkit-scrollbar-thumb": {
                  backgroundColor: scrollbarColor,
                  borderRadius: 8,
                },
              },
            },
          };
        }

        if (overrides.components.MuiDrawer) {
          const currentDrawerOverrides = overrides.components.MuiDrawer.styleOverrides?.paper as
            | Record<string, unknown>
            | undefined;
          overrides.components.MuiDrawer = {
            ...overrides.components.MuiDrawer,
            styleOverrides: {
              ...overrides.components.MuiDrawer.styleOverrides,
              paper: {
                ...currentDrawerOverrides,
                backgroundColor:
                  customTheme.backgroundColor || overrides.palette?.background?.default,
                borderRight: `1px solid ${dividerColor}`,
              },
            },
          };
        }
      }

      if (customTheme.surfaceColor || isLightMode) {
        if (overrides.components.MuiPaper) {
          const currentPaperOverrides = overrides.components.MuiPaper.styleOverrides?.root as
            | Record<string, unknown>
            | undefined;
          overrides.components.MuiPaper = {
            ...overrides.components.MuiPaper,
            styleOverrides: {
              ...overrides.components.MuiPaper.styleOverrides,
              root: {
                ...currentPaperOverrides,
                backgroundColor: customTheme.surfaceColor || overrides.palette?.background?.paper,
                backgroundImage: "none",
                border: `1px solid ${dividerColor}`,
              },
            },
          };
        }

        if (overrides.components.MuiDialog) {
          const currentDialogOverrides = overrides.components.MuiDialog.styleOverrides?.paper as
            | Record<string, unknown>
            | undefined;
          overrides.components.MuiDialog = {
            ...overrides.components.MuiDialog,
            styleOverrides: {
              ...overrides.components.MuiDialog.styleOverrides,
              paper: {
                ...currentDialogOverrides,
                backgroundColor: customTheme.surfaceColor || overrides.palette?.background?.paper,
                backgroundImage: "none",
                border: `1px solid ${dividerColor}`,
                boxShadow: isLightMode
                  ? "0 12px 48px rgba(0, 0, 0, 0.15)"
                  : "0 24px 64px rgba(0, 0, 0, 0.5)",
              },
            },
          };
        }

        if (overrides.components.MuiCard) {
          const currentCardOverrides = overrides.components.MuiCard.styleOverrides?.root as
            | Record<string, unknown>
            | undefined;
          overrides.components.MuiCard = {
            ...overrides.components.MuiCard,
            styleOverrides: {
              ...overrides.components.MuiCard.styleOverrides,
              root: {
                ...currentCardOverrides,
                backgroundColor: isLightMode ? "rgba(255, 255, 255, 0.8)" : "rgba(22, 25, 32, 0.7)",
                border: `1px solid ${dividerColor}`,
                boxShadow: isLightMode
                  ? "0 4px 12px rgba(0, 0, 0, 0.05)"
                  : "0 8px 32px rgba(0, 0, 0, 0.2)",
                "&:hover": {
                  borderColor: dividerColor,
                  transform: "scale(1.01)",
                  boxShadow: isLightMode
                    ? "0 8px 24px rgba(0, 0, 0, 0.1)"
                    : "0 12px 48px rgba(0, 0, 0, 0.3)",
                },
              },
            },
          };
        }
      }

      const primaryToUse = customTheme.primaryColor || "#4361EE";
      if (overrides.components.MuiButton) {
        overrides.components.MuiButton = {
          ...overrides.components.MuiButton,
          styleOverrides: {
            ...overrides.components.MuiButton.styleOverrides,
            containedPrimary: {
              background: `linear-gradient(135deg, ${primaryToUse} 0%, ${darken(primaryToUse, 0.2)} 100%)`,
              "&:hover": {
                background: `linear-gradient(135deg, ${lighten(primaryToUse, 0.1)} 0%, ${primaryToUse} 100%)`,
              },
            },
            outlined: {
              borderColor: isLightMode ? "rgba(0, 0, 0, 0.15)" : "rgba(255, 255, 255, 0.15)",
              "&:hover": {
                borderColor: isLightMode ? "rgba(0, 0, 0, 0.3)" : "rgba(255, 255, 255, 0.3)",
                backgroundColor: isLightMode ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)",
              },
            },
          },
        };
      }
    }

    const builtTheme = createTheme(overrides);
    console.log(
      "CustomThemeProvider - Built Theme complete with palette:",
      builtTheme.palette.background,
    );

    return builtTheme;
  }, [customTheme, brandThemeOptions]);

  return (
    <ThemeProvider theme={memoizedTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
};

export default CustomThemeProvider;
