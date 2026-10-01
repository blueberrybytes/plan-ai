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
  // Ids and primary colors of retired presets. A user who saved one of those
  // gets this preset instead, without touching the row in the database.
  legacyIds?: string[];
  legacyPrimaryColors?: string[];
}

// The recorder has a copy of this list in plan-ai-recorder/src/theme.ts.
// Keep both in sync.
export const APP_THEME_PRESETS: AppThemePreset[] = [
  {
    id: "blueberry",
    nameKey: "profile.themes.blueberry",
    primaryColor: "#4361EE",
    secondaryColor: "#8fa2f5",
    backgroundColor: "#0b0d11",
    surfaceColor: "#13161e",
    textPrimaryColor: "#f1f5f9",
    textSecondaryColor: "#8b9ab0",
    borderRadius: 12,
  },
  {
    id: "graphite",
    nameKey: "profile.themes.graphite",
    primaryColor: "#e4e4e7",
    secondaryColor: "#a1a1aa",
    backgroundColor: "#0a0a0b",
    surfaceColor: "#141416",
    textPrimaryColor: "#f4f4f5",
    textSecondaryColor: "#a1a1aa",
    borderRadius: 12,
    legacyIds: ["hacker"],
    legacyPrimaryColors: ["#00FF41"],
  },
  {
    id: "forest",
    nameKey: "profile.themes.forest",
    primaryColor: "#34996d",
    secondaryColor: "#86c5a6",
    backgroundColor: "#0a0f0d",
    surfaceColor: "#121a16",
    textPrimaryColor: "#eef4f0",
    textSecondaryColor: "#8fa39a",
    borderRadius: 12,
    legacyIds: ["emerald"],
    legacyPrimaryColors: ["#10B981"],
  },
  {
    id: "garnet",
    nameKey: "profile.themes.garnet",
    primaryColor: "#cf5a72",
    secondaryColor: "#e09aa8",
    backgroundColor: "#0f0b0c",
    surfaceColor: "#191315",
    textPrimaryColor: "#f6eef0",
    textSecondaryColor: "#a8959a",
    borderRadius: 12,
    legacyIds: ["crimson"],
    legacyPrimaryColors: ["#E11D48"],
  },
  {
    id: "cloud",
    nameKey: "profile.themes.cloud",
    // Sky 600. The old sky 500 did not reach 3:1 against white button text.
    primaryColor: "#0284C7",
    secondaryColor: "#38BDF8",
    backgroundColor: "#F1F5F9",
    surfaceColor: "#FFFFFF",
    textPrimaryColor: "#0F172A",
    textSecondaryColor: "#475569",
    borderRadius: 12,
    isLight: true,
    legacyPrimaryColors: ["#0EA5E9"],
  },
  {
    id: "sand",
    nameKey: "profile.themes.sand",
    primaryColor: "#b0562c",
    secondaryColor: "#c98a5e",
    backgroundColor: "#f4efe7",
    surfaceColor: "#fffcf7",
    textPrimaryColor: "#2a231d",
    textSecondaryColor: "#6e6257",
    borderRadius: 12,
    isLight: true,
    legacyIds: ["sunrise"],
    legacyPrimaryColors: ["#F97316"],
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

interface SavedAppTheme {
  primaryColor?: string | null;
  configJson?: unknown;
}

/**
 * Finds the preset behind a saved theme. The preset id in configJson wins.
 * Rows saved before the id was stored are matched by primary color.
 * Returns null for a theme that is not one of ours (fully custom colors).
 */
export const resolveAppThemePreset = (
  saved: SavedAppTheme | null | undefined,
  brandKey: BrandKey,
): AppThemePreset | null => {
  if (!saved) return null;
  const presets = getAppThemePresets(brandKey);

  const savedId = (saved.configJson as Record<string, unknown> | null | undefined)?.id;
  if (typeof savedId === "string") {
    const byId = presets.find((p) => p.id === savedId || p.legacyIds?.includes(savedId));
    if (byId) return byId;
  }

  const color = saved.primaryColor?.toLowerCase();
  if (!color) return null;
  return (
    presets.find(
      (p) =>
        p.primaryColor.toLowerCase() === color ||
        p.legacyPrimaryColors?.some((c) => c.toLowerCase() === color),
    ) ?? null
  );
};
