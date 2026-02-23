type BrandKey = "bbb" | "hos";

const resolveBrand = (): BrandKey => {
  if (typeof window === "undefined") {
    return "bbb";
  }

  const hostname = window.location.hostname.toLowerCase();
  if (hostname.endsWith("houseofstories.media")) {
    return "hos";
  }

  return "bbb";
};

export const useBrandIdentity = () => {
  const brand = resolveBrand();
  const isHouseOfStories = brand === "hos";
  const logoSrc = isHouseOfStories ? "/logos/house-of-stories.svg" : "/logos/bbb.png";
  const logoAlt = "Plan AI";

  return {
    brand,
    isHouseOfStories,
    logoSrc,
    logoAlt,
    productName: logoAlt,
  };
};
