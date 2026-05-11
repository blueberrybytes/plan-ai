import { ThemeOptions } from "@mui/material/styles";
import { baseThemeOptions } from "../theme/theme";
import { houseGroupThemeOptions } from "../theme/houseGroupTheme";

export type BrandKey = "plan-ai" | "housegroup";

export type BrandConfig = {
  productName: string;
  companyName: string;
  tagline: string;
  shortDescription: string;
  logoSrc: string;
  logoAlt: string;
  deepLinkScheme: string;
  themeOptions: ThemeOptions;
  features: {
    showStripePricing: boolean;
    allowSelfSignup: boolean;
  };
};

const brandConfigs: Record<BrandKey, BrandConfig> = {
  "plan-ai": {
    productName: "Plan AI",
    companyName: "BLUEBERRYBYTES SERVICES - FZCO",
    tagline: "Turn meeting transcripts into structured tasks automatically.",
    shortDescription:
      "Plan AI helps product teams turn meeting transcripts into structured tasks, boards, and timelines powered by intelligent automation.",
    logoSrc: "/logos/android-chrome-192x192.png", // The original default
    logoAlt: "BlueberryBytes Logo",
    deepLinkScheme: "blueberrybytes-recorder",
    themeOptions: baseThemeOptions,
    features: {
      showStripePricing: true,
      allowSelfSignup: true,
    },
  },
  housegroup: {
    productName: "Plan AI",
    companyName: "House Group Media",
    tagline: "AI transcription and data analysis specifically for HouseGroup agencies.",
    shortDescription:
      "Transform your marketing meetings and interviews into organized data seamlessly integrated into the HouseGroup workflow.",
    logoSrc: "/logos/housegroup/logo.svg",
    logoAlt: "HouseGroup Logo",
    deepLinkScheme: "housegroup-recorder",
    themeOptions: houseGroupThemeOptions,
    features: {
      showStripePricing: false, // Internal tools usually don't show pricing
      allowSelfSignup: false,
    },
  },
};

export const resolveBrand = (): BrandKey => {
  if (typeof window === "undefined") {
    return "plan-ai";
  }

  const hostname = window.location.hostname.toLowerCase();

  if (hostname.includes("housegroup")) {
    return "housegroup";
  }

  return "plan-ai";
};

export const useBrandIdentity = () => {
  //const brandKey: BrandKey = "housegroup";
  const brandKey = resolveBrand();
  const config = brandConfigs[brandKey];

  return {
    brandKey,
    ...config,
  };
};
