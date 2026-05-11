import { BrandKey } from "../hooks/useBrandIdentity";

export interface AppThemePreset {
  id: string;
  nameKey: string;
  primaryColor: string;
  secondaryColor?: string;
  backgroundColor: string;
  surfaceColor: string;
  textPrimaryColor?: string;
  textSecondaryColor?: string;
  borderRadius?: number;
  isLight?: boolean;
}

export const APP_THEME_PRESETS: AppThemePreset[] = [
  {
    id: "blueberry",
    nameKey: "profile.themes.blueberry", // Blueberry Bytes Default
    primaryColor: "#4361EE",
    secondaryColor: "#a78bfa",
    backgroundColor: "#0b0d11",
    surfaceColor: "#161920",
    borderRadius: 12,
  },
  {
    id: "crimson",
    nameKey: "profile.themes.crimson", // Crimson Executive
    primaryColor: "#E11D48",
    secondaryColor: "#F43F5E",
    backgroundColor: "#0c0a09", // Warm deep black
    surfaceColor: "#1c1917", // Warm dark gray
    borderRadius: 8,
  },
  {
    id: "emerald",
    nameKey: "profile.themes.emerald", // Emerald Growth
    primaryColor: "#10B981",
    secondaryColor: "#059669",
    backgroundColor: "#0f172a", // Sleek dark slate
    surfaceColor: "#1e293b", // Slate gray surface
    borderRadius: 16,
  },
  {
    id: "hacker",
    nameKey: "profile.themes.hacker", // Terminal Hacker
    primaryColor: "#00FF41",
    secondaryColor: "#008F11",
    backgroundColor: "#000000",
    surfaceColor: "#0a0a0a",
    borderRadius: 0,
  },
  {
    id: "cloud",
    nameKey: "profile.themes.cloud", // Cloud Workspace (Light)
    primaryColor: "#0EA5E9", // Sky Blue
    secondaryColor: "#38BDF8",
    backgroundColor: "#F1F5F9", // Slate 100
    surfaceColor: "#FFFFFF", // Pure white
    textPrimaryColor: "#0F172A",
    textSecondaryColor: "#475569",
    borderRadius: 12,
    isLight: true,
  },
  {
    id: "sunrise",
    nameKey: "profile.themes.sunrise", // Sunrise Ivory (Light)
    primaryColor: "#F97316", // Orange
    secondaryColor: "#FB923C",
    backgroundColor: "#FFF7ED", // Orange 50
    surfaceColor: "#FFFFFF",
    textPrimaryColor: "#431407",
    textSecondaryColor: "#7C2D12",
    borderRadius: 16,
    isLight: true,
  },
];

export const HOUSEGROUP_THEME_PRESETS: AppThemePreset[] = [
  {
    id: "housegroup",
    nameKey: "profile.themes.housegroup.default",
    primaryColor: "#161616",
    secondaryColor: "#F2DA8E",
    backgroundColor: "#ffffff",
    surfaceColor: "#ffffff",
    textPrimaryColor: "#1a1a1a",
    textSecondaryColor: "#555555",
    borderRadius: 8,
    isLight: true,
  },
  {
    id: "elegant-dark",
    nameKey: "profile.themes.housegroup.dark",
    primaryColor: "#F2DA8E",
    secondaryColor: "#E0C070",
    backgroundColor: "#404040",
    surfaceColor: "#4A4A4A",
    textPrimaryColor: "#ffffff",
    textSecondaryColor: "#D0D0D0",
    borderRadius: 8,
    isLight: false,
  },
  {
    id: "mocha",
    nameKey: "profile.themes.housegroup.mocha",
    primaryColor: "#4A3B32",
    secondaryColor: "#D4A373",
    backgroundColor: "#FAEDCD",
    surfaceColor: "#FEFAE0",
    textPrimaryColor: "#332211",
    textSecondaryColor: "#665544",
    borderRadius: 12,
    isLight: true,
  },
];

export const getAppThemePresets = (brandKey: BrandKey): AppThemePreset[] => {
  if (brandKey === "housegroup") {
    return HOUSEGROUP_THEME_PRESETS;
  }
  return APP_THEME_PRESETS;
};
