import { alpha, createTheme, ThemeOptions, lighten } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface Palette {
    secondary50: Palette["primary"];
    success50: Palette["primary"];
    info50: Palette["primary"];
    error50: Palette["primary"];
    neutral: {
      main: string;
      100: string;
      200: string;
      300: string;
      400: string;
      500: string;
      600: string;
    };
  }

  interface PaletteOptions {
    secondary50?: PaletteOptions["primary"];
    success50?: PaletteOptions["primary"];
    info50?: PaletteOptions["primary"];
    error50?: PaletteOptions["primary"];
    neutral?: {
      main?: string;
      100?: string;
      200?: string;
      300?: string;
      400?: string;
      500?: string;
      600?: string;
    };
  }

  interface TypographyVariants {
    pLarge: React.CSSProperties;
    pMedium: React.CSSProperties;
    pSmall: React.CSSProperties;
    pSmallest: React.CSSProperties;
  }

  // Allow usage of pLarge in variant prop
  interface TypographyVariantsOptions {
    pLarge?: React.CSSProperties;
    pMedium?: React.CSSProperties;
    pSmall?: React.CSSProperties;
    pSmallest?: React.CSSProperties;
  }
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    pLarge: true;
    pMedium: true;
    pSmall: true;
    pSmallest: true;
  }
}

// Component styles read colors from the palette, never from literals. That way
// a preset only has to swap the palette and every component follows, in dark
// and in light mode.
export const baseThemeOptions: ThemeOptions = {
  palette: {
    mode: "dark",
    primary: {
      main: "#4361EE",
    },
    secondary: {
      main: "#8fa2f5",
    },
    secondary50: {
      main: alpha("#8fa2f5", 0.5),
    },
    background: {
      default: "#0b0d11",
      paper: "#13161e",
    },
    text: {
      primary: "#f1f5f9",
      secondary: "#8b9ab0",
    },
    divider: "rgba(255, 255, 255, 0.07)",
    success: {
      main: "#10B981",
      light: "#34D399",
      dark: "#059669",
    },
    success50: {
      main: alpha("#10B981", 0.5),
    },
    info: {
      main: "#3B82F6",
    },
    info50: {
      main: alpha("#3B82F6", 0.5),
    },
    error: {
      main: "#EF4444",
    },
    error50: {
      main: alpha("#EF4444", 0.5),
    },
    warning: {
      main: "#F59E0B",
    },
    neutral: {
      main: "#1e293b",
      "100": "#0f172a",
      "200": "#1e293b",
      "300": "#334155",
      "400": "#475569",
      "500": "#64748b",
      "600": "#94a3b8",
    },
  },
  typography: {
    fontFamily: "'Inter', 'Helvetica Neue', 'Arial', sans-serif",
    h1: {
      fontSize: "3rem",
      fontWeight: 700,
      letterSpacing: "-0.02em",
      lineHeight: 1.2,
    },
    h2: {
      fontSize: "2.25rem",
      fontWeight: 700,
      letterSpacing: "-0.02em",
      lineHeight: 1.3,
    },
    h3: {
      fontSize: "1.75rem",
      fontWeight: 600,
      letterSpacing: "-0.01em",
    },
    h4: {
      fontSize: "1.375rem",
      fontWeight: 600,
      letterSpacing: "-0.01em",
    },
    h5: {
      fontSize: "1.125rem",
      fontWeight: 600,
    },
    h6: {
      fontSize: "1rem",
      fontWeight: 600,
    },
    body1: {
      fontSize: "1rem",
      lineHeight: 1.6,
    },
    body2: {
      fontSize: "0.875rem",
      lineHeight: 1.6,
    },
    button: {
      fontWeight: 600,
      textTransform: "none",
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: (theme) => {
        const thumb = alpha(theme.palette.text.primary, 0.12);
        return {
          body: {
            backgroundColor: theme.palette.background.default,
            color: theme.palette.text.primary,
            scrollbarColor: `${thumb} transparent`,
            "&::-webkit-scrollbar": {
              width: 8,
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: thumb,
              borderRadius: 8,
            },
          },
        };
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundImage: "none",
          border: `1px solid ${theme.palette.divider}`,
        }),
        elevation1: {
          boxShadow: "none",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: ({ theme }) => ({
          backgroundColor: theme.palette.background.default,
          borderRight: `1px solid ${theme.palette.divider}`,
        }),
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: "8px 20px",
          fontWeight: 600,
        },
        containedPrimary: ({ theme }) => ({
          backgroundColor: theme.palette.primary.main,
          "&:hover": {
            backgroundColor: lighten(theme.palette.primary.main, 0.1),
          },
        }),
        outlined: ({ theme }) => ({
          borderColor: alpha(theme.palette.text.primary, 0.15),
          "&:hover": {
            borderColor: alpha(theme.palette.text.primary, 0.3),
            backgroundColor: alpha(theme.palette.text.primary, 0.05),
          },
        }),
      },
    },
    MuiCard: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 14,
          backgroundColor: theme.palette.background.paper,
          border: `1px solid ${theme.palette.divider}`,
          boxShadow: "none",
        }),
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: ({ theme }) => ({
          "& .MuiOutlinedInput-root": {
            borderRadius: 10,
            backgroundColor: alpha(theme.palette.text.primary, 0.03),
          },
        }),
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: alpha(theme.palette.text.primary, 0.12),
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: alpha(theme.palette.text.primary, 0.25),
          },
        }),
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 8,
          margin: "4px 8px",
          "&.Mui-selected": {
            backgroundColor: alpha(theme.palette.primary.main, 0.15),
            color: theme.palette.primary.main,
            "& .MuiListItemIcon-root": {
              color: theme.palette.primary.main,
            },
            "&:hover": {
              backgroundColor: alpha(theme.palette.primary.main, 0.2),
            },
          },
        }),
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: 16,
          backgroundColor: theme.palette.background.paper,
          backgroundImage: "none",
          border: `1px solid ${theme.palette.divider}`,
          boxShadow:
            theme.palette.mode === "light"
              ? "0 12px 48px rgba(0, 0, 0, 0.15)"
              : "0 24px 64px rgba(0, 0, 0, 0.5)",
        }),
      },
    },
  },
};

const theme = createTheme(baseThemeOptions);

export default theme;
