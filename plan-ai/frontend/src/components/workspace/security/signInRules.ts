/** Firebase provider ids the backend accepts, plus "custom" for SAML/OIDC ids. */
export const PROVIDER_OPTIONS = [
  { value: "none", labelKey: "none" },
  { value: "google.com", labelKey: "google" },
  { value: "microsoft.com", labelKey: "microsoft" },
  { value: "apple.com", labelKey: "apple" },
  { value: "password", labelKey: "password" },
  { value: "custom", labelKey: "custom" },
] as const;

const KNOWN_PROVIDERS = new Set(["google.com", "microsoft.com", "apple.com", "password"]);

const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "@Acme.com " becomes "acme.com". */
export const normaliseDomain = (value: string): string =>
  value.trim().toLowerCase().replace(/^@/, "");

export const isValidDomain = (value: string): boolean => DOMAIN_PATTERN.test(value);

/** Select value for a saved provider: a known id, "custom" for SSO ids, or "none". */
export const providerChoiceOf = (provider: string | null | undefined): string => {
  if (!provider) return "none";
  return KNOWN_PROVIDERS.has(provider) ? provider : "custom";
};

/** The custom SSO id to prefill, or "" when the saved provider is a known one. */
export const customProviderOf = (provider: string | null | undefined): string =>
  provider && !KNOWN_PROVIDERS.has(provider) ? provider : "";

/** Value sent to the backend: null removes the rule. */
export const requiredProviderValue = (choice: string, customProvider: string): string | null => {
  if (choice === "none") return null;
  if (choice === "custom") return customProvider.trim() || null;
  return choice;
};
