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
    error50: PaletteOptions["primary"];
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
    primary: {
      main: "#4361EE", // Vibrant blue - represents technology and innovation
      light: "#6B87FF",
      dark: "#2D4CDD",
    },
    secondary: {
      main: "#FF6B6B", // Coral - energetic and creative
      light: "#FF9E9E",
      dark: "#E54B4B",
    },
    secondary50: {
      main: "#FF6B6B80", // Semi-transparent version
    },
    background: {
      default: "#F8FAFC", // Light blue-gray for a clean, modern feel
      paper: "#FFFFFF",
    },
    text: {
      primary: "#1E293B", // Dark blue-gray for better readability
      secondary: "#64748B", // Medium blue-gray for secondary text
    },
    success: {
      main: "#10B981", // Vibrant teal green
      light: "#34D399",
      dark: "#059669",
    },
    success50: {
      main: "#10B98180", // Semi-transparent version
    },
    info: {
      main: "#3B82F6", // Bright blue
      light: "#60A5FA",
      dark: "#2563EB",
    },
    info50: {
      main: "#3B82F680", // Semi-transparent version
    },
    error: {
      main: "#EF4444", // Bright red
      light: "#F87171",
      dark: "#DC2626",
    },
    error50: {
      main: "#EF444480", // Semi-transparent version
    },
    warning: {
      main: "#F59E0B", // Amber
      light: "#FBBF24",
      dark: "#D97706",
    },
    neutral: {
      main: "#FFFFFF",
      "100": "#F1F5F9", // Lightest blue-gray
      "200": "#E2E8F0",
      "300": "#CBD5E1",
      "400": "#94A3B8",
      "500": "#64748B",
      "600": "#475569",
    },
  },
  typography: {
    fontFamily: "'Inter', 'Roboto', 'Arial', sans-serif",
    h1: {
      fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
      fontSize: "3rem", // 48px
      fontWeight: 700,
      letterSpacing: "-0.01em",
      lineHeight: 1.2,
    },
    h2: {
      fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
      fontSize: "2.25rem", // 36px
      fontWeight: 700,
      letterSpacing: "-0.01em",
      lineHeight: 1.3,
    },
    h3: {
      fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
      fontSize: "1.75rem", // 28px
      fontWeight: 600,
      letterSpacing: "-0.01em",
      lineHeight: 1.4,
    },
    h4: {
      fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
      fontSize: "1.375rem", // 22px
      fontWeight: 600,
      letterSpacing: "-0.01em",
      lineHeight: 1.4,
    },
    h5: {
      fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
      fontSize: "1.125rem", // 18px
      fontWeight: 600,
      letterSpacing: "-0.01em",
      lineHeight: 1.5,
    },
    h6: {
      fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
      fontSize: "1rem", // 16px
      fontWeight: 600,
      letterSpacing: "-0.01em",
      lineHeight: 1.5,
    },
    body1: {
      fontFamily: "'Inter', sans-serif",
      fontSize: "1rem", // 16px
      lineHeight: 1.6,
      letterSpacing: "0.01em",
    },
    body2: {
      fontFamily: "'Inter', sans-serif",
      fontSize: "0.875rem", // 14px
      lineHeight: 1.6,
      letterSpacing: "0.01em",
    },
    button: {
      fontFamily: "'Inter', sans-serif",
      fontWeight: 600,
      fontSize: "0.9375rem", // 15px
      letterSpacing: "0.02em",
      textTransform: "none",
    },
    caption: {
      fontFamily: "'Inter', sans-serif",
      fontSize: "0.75rem", // 12px
      letterSpacing: "0.02em",
      lineHeight: 1.5,
    },
    overline: {
      fontFamily: "'Inter', sans-serif",
      fontSize: "0.75rem", // 12px
      fontWeight: 600,
      letterSpacing: "0.05em",
      lineHeight: 1.5,
      textTransform: "uppercase",
    },
    // Custom variants
    pLarge: {
      fontFamily: "'Inter', sans-serif",
      fontSize: "1.125rem", // 18px
      fontWeight: 400,
      lineHeight: 1.6,
      letterSpacing: "0.01em",
    },
    pMedium: {
      fontFamily: "'Inter', sans-serif",
      fontSize: "1rem", // 16px
      fontWeight: 400,
      lineHeight: 1.6,
      letterSpacing: "0.01em",
    },
    pSmall: {
      fontFamily: "'Inter', sans-serif",
      fontSize: "0.875rem", // 14px
      fontWeight: 400,
      lineHeight: 1.6,
      letterSpacing: "0.01em",
    },
    pSmallest: {
      fontFamily: "'Inter', sans-serif",
      fontSize: "0.75rem", // 12px
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: "0.01em",
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: (themeParam) => ({
        body: {
          backgroundColor: themeParam.palette.background.default,
          color: themeParam.palette.text.primary,
        },
        "@font-face": [
          {
            fontFamily: "Inter",
            fontStyle: "normal",
            fontDisplay: "swap",
            fontWeight: 400,
            src: `url(https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap)`,
          },
          {
            fontFamily: "Plus Jakarta Sans",
            fontStyle: "normal",
            fontDisplay: "swap",
            fontWeight: 600,
            src: `url(https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700&display=swap)`,
          },
        ],
      }),
    },
    MuiInputBase: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: "8px",
          transition: "all 0.2s ease-in-out",
          "&.Mui-focused": {
            boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.15)}`,
          },
        }),
        input: ({ theme }) => ({
          ...theme.typography.pMedium,
          padding: "12px 16px",
        }),
      },
    },
    MuiButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: "8px",
          textTransform: "none",
          fontSize: "15px",
          fontFamily: theme.typography.button?.fontFamily ?? theme.typography.fontFamily,
          fontWeight: 600,
          padding: "10px 20px",
          boxShadow: "none",
          transition: "all 0.2s ease-in-out",
          "&:hover": {
            boxShadow: `0 4px 8px ${alpha(theme.palette.common.black, 0.1)}`,
            transform: "translateY(-1px)",
          },
          "&:active": {
            boxShadow: "none",
            transform: "translateY(0)",
          },
        }),
        contained: ({ theme }) => ({
          "&.MuiButton-containedPrimary": {
            background: `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark ?? darken(theme.palette.primary.main, 0.1)} 100%)`,
          },
          "&.MuiButton-containedSecondary": {
            background: `linear-gradient(90deg, ${theme.palette.secondary.main} 0%, ${theme.palette.secondary.dark ?? darken(theme.palette.secondary.main, 0.1)} 100%)`,
          },
        }),
        outlined: {
          borderWidth: "2px",
          "&:hover": {
            borderWidth: "2px",
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: "8px",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.palette.divider,
            transition: "all 0.2s ease-in-out",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: lighten(theme.palette.divider, 0.16),
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.palette.primary.main,
            borderWidth: "2px",
          },
        }),
        input: {
          padding: "12px 16px",
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          borderRadius: "8px",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: "12px",
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.08)",
          overflow: "hidden",
          transition: "transform 0.3s ease, box-shadow 0.3s ease",
          "&:hover": {
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.08)",
        },
        elevation1: {
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
        },
        elevation2: {
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: "6px",
          fontWeight: 500,
        },
        filled: ({ theme }) => ({
          "&.MuiChip-colorPrimary": {
            backgroundColor: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
          },
          "&.MuiChip-colorSecondary": {
            backgroundColor: theme.palette.secondary.main,
            color: theme.palette.secondary.contrastText,
          },
          "&.MuiChip-colorSuccess": {
            backgroundColor: theme.palette.success.main,
            color: theme.palette.success.contrastText,
          },
          "&.MuiChip-colorInfo": {
            backgroundColor: theme.palette.info.main,
            color: theme.palette.info.contrastText,
          },
          "&.MuiChip-colorWarning": {
            backgroundColor: theme.palette.warning.main,
            color: theme.palette.warning.contrastText,
          },
          "&.MuiChip-colorError": {
            backgroundColor: theme.palette.error.main,
            color: theme.palette.error.contrastText,
          },
        }),
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: "12px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: ({ theme }) => ({
          fontSize: "1.375rem",
          fontWeight: 600,
          fontFamily: theme.typography.h5?.fontFamily ?? theme.typography.fontFamily,
        }),
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: "16px 24px",
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: "16px 24px",
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          fontSize: "0.9375rem",
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: "8px",
        },
      },
    },
  },
};

const theme = createTheme(baseThemeOptions);

export default theme;
