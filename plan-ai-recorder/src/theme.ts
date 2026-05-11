import { createTheme, alpha } from "@mui/material/styles";

const isHouseGroup = import.meta.env.VITE_APP_PROTOCOL === "housegroup-recorder";

const mode: 'light' | 'dark' = isHouseGroup ? "light" : "dark";

const houseGroupPalette = {
  mode,
  primary: { main: "#161616" },
  secondary: { main: "#F2DA8E" },
  background: { default: "#ffffff", paper: "#ffffff" },
  text: { primary: "#1a1a1a", secondary: "#555" },
  error: { main: "#FF6B79" },
  success: { main: "#368548" },
  divider: "rgba(0, 0, 0, 0.08)",
};

const blueberryBytesPalette = {
  mode,
  primary: { main: "#4361EE", light: "#6b83f1", dark: "#2d46c9" },
  background: { default: "#0b0d11", paper: "#13161e" },
  text: { primary: "#f1f5f9", secondary: "#8b9ab0" },
  error: { main: "#ef4444" },
  success: { main: "#22c55e" },
  divider: "rgba(255, 255, 255, 0.07)",
};

const activePalette = Object.assign(
  {},
  isHouseGroup ? houseGroupPalette : blueberryBytesPalette
);

export const theme = createTheme({
  palette: activePalette,
  typography: {
    fontFamily: isHouseGroup ? "'Inter', 'Manrope', sans-serif" : "'Inter', sans-serif",
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: activePalette.background.default,
          color: activePalette.text.primary,
          scrollbarColor: isHouseGroup ? "rgba(0,0,0,0.1) transparent" : "rgba(255,255,255,0.1) transparent",
          "&::-webkit-scrollbar": {
            width: 8,
          },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: isHouseGroup ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)",
            borderRadius: 8,
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: "8px 20px",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          borderColor: activePalette.divider,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: activePalette.divider,
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: isHouseGroup ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.2)",
          },
        },
      },
    },
  },
});
