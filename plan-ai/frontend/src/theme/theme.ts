/* eslint-disable @typescript-eslint/no-unused-vars */
import { alpha, createTheme, ThemeOptions, darken, lighten } from "@mui/material/styles";

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

export const baseThemeOptions: ThemeOptions = {
  palette: {
    mode: "dark",
    primary: {
      main: "#4361EE", // Vibrant blue - represents technology and innovation
      light: "#6e85f2",
      dark: "#2d4cdd",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#a78bfa", // Lavendar/Purple - AI flavor
      light: "#c4b5fd",
      dark: "#7c3aed",
    },
    secondary50: {
      main: alpha("#a78bfa", 0.5),
    },
    background: {
      default: "#000000", // Pure black for max contrast
      paper: "#18181B", // Zinc-900 panel
    },
    text: {
      primary: "#f8fafc",
      secondary: "#94a3b8",
    },
    divider: "rgba(255, 255, 255, 0.05)",
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
    fontFamily: "'Inter', 'Roboto', 'Arial', sans-serif",
    h1: {
      fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
      fontSize: "3rem",
      fontWeight: 700,
      letterSpacing: "-0.02em",
      lineHeight: 1.2,
    },
    h2: {
      fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
      fontSize: "2.25rem",
      fontWeight: 700,
      letterSpacing: "-0.02em",
      lineHeight: 1.3,
    },
    h3: {
      fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
      fontSize: "1.75rem",
      fontWeight: 600,
    },
    h4: {
      fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
      fontSize: "1.375rem",
      fontWeight: 600,
    },
    h5: {
      fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
      fontSize: "1.125rem",
      fontWeight: 600,
    },
    h6: {
      fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
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
    borderRadius: 16,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#000000",
          color: "#f8fafc",
          scrollbarColor: "rgba(255, 255, 255, 0.1) transparent",
          "&::-webkit-scrollbar": {
            width: 8,
          },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "rgba(255, 255, 255, 0.1)",
            borderRadius: 8,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "#18181B",
          border: "1px solid rgba(255, 255, 255, 0.05)",
        },
        elevation1: {
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: "#000000",
          borderRight: "1px solid rgba(255, 255, 255, 0.05)",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: "100px",
          padding: "8px 20px",
          fontWeight: 600,
          transition: "all 0.2s ease",
        }),
        containedPrimary: ({ theme }) => ({
          backgroundColor: theme.palette.primary.main,
          "&:hover": {
            backgroundColor: lighten(theme.palette.primary.main, 0.1),
          },
        }),
        outlined: {
          borderColor: "rgba(255, 255, 255, 0.15)",
          "&:hover": {
            borderColor: "rgba(255, 255, 255, 0.3)",
            backgroundColor: "rgba(255, 255, 255, 0.05)",
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: "20px",
          backgroundColor: "#18181B",
          border: "1px solid rgba(255, 255, 255, 0.05)",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
          transition: "all 0.2s ease",
          "&:hover": {
            borderColor: "rgba(255, 255, 255, 0.1)",
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: "all 0.2s ease",
          "&:hover": {
            backgroundColor: "rgba(255, 255, 255, 0.06)",
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: "12px",
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            transition: "all 0.2s ease",
            "&:hover": {
              backgroundColor: "rgba(255, 255, 255, 0.05)",
            },
            "&.Mui-focused": {
              backgroundColor: "rgba(255, 255, 255, 0.02)",
            },
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: "10px",
          margin: "4px 8px",
          transition: "all 0.2s ease",
          "&.Mui-selected": {
            backgroundColor: alpha("#4361EE", 0.15),
            color: "#4361EE",
            "& .MuiListItemIcon-root": {
              color: "#4361EE",
            },
            "&:hover": {
              backgroundColor: alpha("#4361EE", 0.2),
            },
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: "24px",
          backgroundColor: "#18181B",
          backgroundImage: "none",
          border: "1px solid rgba(255, 255, 255, 0.05)",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.5)",
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: "rgba(255, 255, 255, 0.05)",
        },
      },
    },
  },
};

const theme = createTheme(baseThemeOptions);

export default theme;
