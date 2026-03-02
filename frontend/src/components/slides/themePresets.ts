/**
 * 10 curated theme presets with colors and typography pairings.
 */
export interface ThemePreset {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  headingFont: string;
  bodyFont: string;
  backgroundStyle: "solid" | "gradient" | "mesh" | "minimal";
  cardStyle: "flat" | "glass" | "outline";
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    name: "Indigo Night",
    primaryColor: "#6366f1",
    secondaryColor: "#a78bfa",
    backgroundColor: "#0f172a",
    headingFont: "Inter",
    bodyFont: "Inter",
    backgroundStyle: "mesh",
    cardStyle: "glass",
  },
  {
    name: "Ocean Breeze",
    primaryColor: "#0ea5e9",
    secondaryColor: "#38bdf8",
    backgroundColor: "#0c1222",
    headingFont: "Poppins",
    bodyFont: "Inter",
    backgroundStyle: "gradient",
    cardStyle: "glass",
  },
  {
    name: "Emerald Forest",
    primaryColor: "#10b981",
    secondaryColor: "#34d399",
    backgroundColor: "#0a1a14",
    headingFont: "Outfit",
    bodyFont: "Source Sans 3",
    backgroundStyle: "solid",
    cardStyle: "flat",
  },
  {
    name: "Sunset Glow",
    primaryColor: "#f59e0b",
    secondaryColor: "#fbbf24",
    backgroundColor: "#1a1008",
    headingFont: "Roboto",
    bodyFont: "Roboto",
    backgroundStyle: "gradient",
    cardStyle: "flat",
  },
  {
    name: "Rose Quartz",
    primaryColor: "#f43f5e",
    secondaryColor: "#fb7185",
    backgroundColor: "#1a0a10",
    headingFont: "Playfair Display",
    bodyFont: "Lato",
    backgroundStyle: "mesh",
    cardStyle: "glass",
  },
  {
    name: "Arctic Blue",
    primaryColor: "#3b82f6",
    secondaryColor: "#60a5fa",
    backgroundColor: "#ffffff",
    headingFont: "Inter",
    bodyFont: "Inter",
    backgroundStyle: "gradient",
    cardStyle: "outline",
  },
  {
    name: "Corporate Clean",
    primaryColor: "#1e40af",
    secondaryColor: "#3b82f6",
    backgroundColor: "#f8fafc",
    headingFont: "Roboto",
    bodyFont: "Open Sans",
    backgroundStyle: "minimal",
    cardStyle: "outline",
  },
  {
    name: "Warm Earth",
    primaryColor: "#d97706",
    secondaryColor: "#92400e",
    backgroundColor: "#fefce8",
    headingFont: "Merriweather",
    bodyFont: "Source Sans 3",
    backgroundStyle: "solid",
    cardStyle: "flat",
  },
  {
    name: "Neon Cyber",
    primaryColor: "#06b6d4",
    secondaryColor: "#8b5cf6",
    backgroundColor: "#020617",
    headingFont: "Space Grotesk",
    bodyFont: "JetBrains Mono",
    backgroundStyle: "mesh",
    cardStyle: "outline",
  },
  {
    name: "Minimal Mono",
    primaryColor: "#18181b",
    secondaryColor: "#71717a",
    backgroundColor: "#fafafa",
    headingFont: "DM Sans",
    bodyFont: "DM Sans",
    backgroundStyle: "minimal",
    cardStyle: "flat",
  },
];

export const FONT_OPTIONS: string[] = [
  "Inter",
  "Roboto",
  "Poppins",
  "Open Sans",
  "Lato",
  "Outfit",
  "DM Sans",
  "Source Sans 3",
  "Playfair Display",
  "Merriweather",
  "Space Grotesk",
  "JetBrains Mono",
  "Montserrat",
  "Nunito",
  "Raleway",
];
