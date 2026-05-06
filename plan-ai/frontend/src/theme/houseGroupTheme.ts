import { ThemeOptions, alpha } from "@mui/material/styles";

export const houseGroupThemeOptions: ThemeOptions = {
  palette: {
    mode: "light",
    primary: {
      main: "#161616",
    },
    secondary: {
      main: "#F2DA8E",
    },
    secondary50: {
      main: alpha("#F2DA8E", 0.5),
    },
    background: {
      default: "#ffffff",
      paper: "#ffffff",
    },
    text: {
      primary: "#1a1a1a",
      secondary: "#555",
    },
    divider: "rgba(0, 0, 0, 0.08)",
    success: {
      main: "#368548",
    },
    success50: {
      main: alpha("#368548", 0.5),
    },
    info: {
      main: "#6579FC",
    },
    info50: {
      main: alpha("#6579FC", 0.3),
    },
    error: {
      main: "#FF6B79",
    },
    error50: {
      main: alpha("#FF6B79", 0.5),
    },
    warning: {
      main: "#F0CD55",
    },
    neutral: {
      main: "#FFFFFF",
      "100": "#EFEFF2",
      "200": "#EAEBF0",
      "300": "#D6D8E4",
      "400": "#CCCFDF",
      "500": "#B5BAD3",
      "600": "#7179A3",
    },
  },
  typography: {
    fontFamily: "'Inter', 'Manrope', sans-serif",
    h1: { fontFamily: "'Outfit'", fontSize: "40px", fontWeight: "bold" },
    h2: { fontFamily: "'Outfit'", fontSize: "32px", fontWeight: "bold" },
    h3: { fontFamily: "'Outfit'", fontSize: "24px", fontWeight: "bold" },
    h4: { fontFamily: "'Outfit'", fontSize: "20px", fontWeight: "bold" },

    body1: { fontFamily: "'Inter'", fontSize: "1rem", lineHeight: 1.6 },
    body2: { fontFamily: "'Inter'", fontSize: "0.875rem", lineHeight: 1.5 },

    // Keep the pLarge / pMedium etc which were in your custom theme
    pLarge: { fontFamily: "'Inter'", fontSize: "18px", fontWeight: 400 },
    pMedium: { fontFamily: "'Inter'", fontSize: "16px", fontWeight: 400 },
    pSmall: { fontFamily: "'Inter'", fontSize: "14px", fontWeight: 400 },
    pSmallest: { fontFamily: "'Inter'", fontSize: "12px", fontWeight: 400 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#FFFFFF",
          color: "#1a1a1a",
          scrollbarColor: "rgba(0, 0, 0, 0.1) transparent",
          "&::-webkit-scrollbar": {
            width: 8,
          },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "rgba(0, 0, 0, 0.1)",
            borderRadius: 8,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: "none !important",
          border: "1px solid rgba(0,0,0,0.08)",
          backgroundImage: "none",
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          borderRadius: "50px",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: "50px",
          textTransform: "none",
          fontSize: "16px",
          fontFamily: "'Inter'",
          fontWeight: 600,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: "50px",
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: "50px",
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: "16px",
          backgroundColor: "#ffffff",
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
          "&:hover": {
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.08)",
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: "20px",
          backgroundColor: "#ffffff",
          border: "1px solid rgba(0, 0, 0, 0.08)",
          boxShadow: "0 12px 48px rgba(0, 0, 0, 0.15)",
        },
      },
    },
  },
};
