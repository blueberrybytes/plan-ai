import { createTheme, alpha, Theme } from "@mui/material/styles";

const isHouseGroup = import.meta.env.VITE_APP_PROTOCOL === "housegroup-recorder";

export interface ThemePreset {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  isLight?: boolean;
}

// Same list as the web app (plan-ai/frontend/src/utils/appThemes.ts).
// Keep both in sync.
const blueberryBytesPresets: ThemePreset[] = [
  {
    id: "blueberry",
    name: "Blueberry",
    primary: "#4361EE",
    secondary: "#8fa2f5",
    background: "#0b0d11",
    surface: "#13161e",
    textPrimary: "#f1f5f9",
    textSecondary: "#8b9ab0",
  },
  {
    id: "graphite",
    name: "Graphite",
    primary: "#e4e4e7",
    secondary: "#a1a1aa",
    background: "#0a0a0b",
    surface: "#141416",
    textPrimary: "#f4f4f5",
    textSecondary: "#a1a1aa",
  },
  {
    id: "forest",
    name: "Forest",
    primary: "#34996d",
    secondary: "#86c5a6",
    background: "#0a0f0d",
    surface: "#121a16",
    textPrimary: "#eef4f0",
    textSecondary: "#8fa39a",
  },
  {
    id: "garnet",
    name: "Garnet",
    primary: "#cf5a72",
    secondary: "#e09aa8",
    background: "#0f0b0c",
    surface: "#191315",
    textPrimary: "#f6eef0",
    textSecondary: "#a8959a",
  },
  {
    id: "cloud",
    name: "Cloud",
    primary: "#0284C7",
    secondary: "#38BDF8",
    background: "#F1F5F9",
    surface: "#FFFFFF",
    textPrimary: "#0F172A",
    textSecondary: "#475569",
    isLight: true,
  },
  {
    id: "sand",
    name: "Sand",
    primary: "#b0562c",
    secondary: "#c98a5e",
    background: "#f4efe7",
    surface: "#fffcf7",
    textPrimary: "#2a231d",
    textSecondary: "#6e6257",
    isLight: true,
  },
];

const houseGroupPresets: ThemePreset[] = [
  {
    id: "housegroup",
    name: "HouseGroup",
    primary: "#161616",
    secondary: "#F2DA8E",
    background: "#ffffff",
    surface: "#ffffff",
    textPrimary: "#1a1a1a",
    textSecondary: "#555555",
    isLight: true,
  },
  {
    id: "elegant-dark",
    name: "Elegant dark",
    primary: "#F2DA8E",
    secondary: "#E0C070",
    background: "#404040",
    surface: "#4A4A4A",
    textPrimary: "#ffffff",
    textSecondary: "#D0D0D0",
  },
  {
    id: "mocha",
    name: "Mocha",
    primary: "#4A3B32",
    secondary: "#D4A373",
    background: "#FAEDCD",
    surface: "#FEFAE0",
    textPrimary: "#332211",
    textSecondary: "#665544",
    isLight: true,
  },
];

export const THEME_PRESETS: ThemePreset[] = isHouseGroup ? houseGroupPresets : blueberryBytesPresets;

export const DEFAULT_THEME_ID = THEME_PRESETS[0].id;

const THEME_STORAGE_KEY = "planai_theme";

export const getStoredThemeId = (): string => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && THEME_PRESETS.some((p) => p.id === stored)) return stored;
  } catch {
    /* localStorage unavailable */
  }
  return DEFAULT_THEME_ID;
};

export const storeThemeId = (id: string): void => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    /* localStorage unavailable */
  }
};

export const buildTheme = (presetId: string): Theme => {
  const preset = THEME_PRESETS.find((p) => p.id === presetId) ?? THEME_PRESETS[0];
  const divider = preset.isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.07)";
  const scrollbar = alpha(preset.textPrimary, 0.12);

  return createTheme({
    palette: {
      mode: preset.isLight ? "light" : "dark",
      primary: { main: preset.primary },
      secondary: { main: preset.secondary },
      background: { default: preset.background, paper: preset.surface },
      text: { primary: preset.textPrimary, secondary: preset.textSecondary },
      error: { main: isHouseGroup ? "#FF6B79" : "#ef4444" },
      success: { main: isHouseGroup ? "#368548" : "#22c55e" },
      divider,
    },
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
            backgroundColor: preset.background,
            color: preset.textPrimary,
            scrollbarColor: `${scrollbar} transparent`,
            "&::-webkit-scrollbar": {
              width: 8,
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: scrollbar,
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
            borderColor: divider,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: divider,
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: alpha(preset.textPrimary, 0.2),
            },
          },
        },
      },
    },
  });
};
