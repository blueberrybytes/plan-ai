import React from "react";
import {
  Box,
  Button,
  Chip,
  Container,
  Grid,
  Stack,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import {
  ArrowForward as ArrowForwardIcon,
  CheckCircleOutline as CheckIcon,
  Bolt as BoltIcon,
  Key as KeyIcon,
} from "@mui/icons-material";
import { Link as RouterLink } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface PricingTier {
  key: string;
  /** Track this tier belongs to: BYOK or Managed. Solo and Enterprise are shown on both columns. */
  track: "byok" | "managed" | "both";
  /** Stripe Payment Link or null for the free tier (goes to /signup) / "contact" tiers (mailto). */
  href: string | null;
  ctaKey: "ctaStart" | "ctaBuy" | "ctaContact";
  highlight?: boolean;
}

// NOTE: replace the placeholder Stripe Payment Link URLs once they're created
// in the Stripe dashboard. The structure is intentionally minimal so a non-
// developer can swap a URL string.
const TIERS: PricingTier[] = [
  { key: "proByok", track: "byok", href: "https://buy.stripe.com/REPLACE_PRO_BYOK", ctaKey: "ctaBuy" },
  { key: "proManaged", track: "managed", href: "https://buy.stripe.com/REPLACE_PRO_MANAGED", ctaKey: "ctaBuy", highlight: true },
  { key: "businessByok", track: "byok", href: "https://buy.stripe.com/REPLACE_BUSINESS_BYOK", ctaKey: "ctaBuy" },
  { key: "businessManaged", track: "managed", href: "https://buy.stripe.com/REPLACE_BUSINESS_MANAGED", ctaKey: "ctaBuy" },
  { key: "enterprise", track: "both", href: "mailto:hello@blueberrybytes.com?subject=Plan%20AI%20Enterprise", ctaKey: "ctaContact" },
];

/**
 * Pricing section for the landing page. Two visible tracks — BYOK and Managed —
 * with the Pro Managed tier flagged "Most teams pick this" as the default
 * anchor. Solo and Enterprise span both tracks. CTAs lead to Stripe Payment
 * Links (replace URLs above) or to /signup for the free tier.
 */
const PricingSection: React.FC = () => {
  const { t } = useTranslation();
  const theme = useTheme();

  const renderTierCard = (tier: PricingTier) => {
    const featuresRaw = t(`landingPage.pricing.tiers.${tier.key}.features`, {
      returnObjects: true,
    }) as unknown;
    const features: string[] = Array.isArray(featuresRaw) ? (featuresRaw as string[]) : [];
    const name = t(`landingPage.pricing.tiers.${tier.key}.name`);
    const price = t(`landingPage.pricing.tiers.${tier.key}.price`);
    const tagline = t(`landingPage.pricing.tiers.${tier.key}.tagline`);
    const ctaLabel = t(`landingPage.pricing.${tier.ctaKey}`);

    const ctaProps =
      tier.href === null
        ? ({ component: RouterLink, to: "/signup" } as const)
        : ({ component: "a", href: tier.href, target: "_blank", rel: "noopener noreferrer" } as const);

    return (
      <Box
        sx={{
          position: "relative",
          height: "100%",
          p: 3.5,
          borderRadius: "20px",
          border: tier.highlight
            ? `2px solid ${theme.palette.primary.main}`
            : `1px solid ${theme.palette.divider}`,
          bgcolor: tier.highlight
            ? alpha(theme.palette.primary.main, 0.04)
            : "background.paper",
          boxShadow: tier.highlight
            ? `0 8px 32px ${alpha(theme.palette.primary.main, 0.18)}`
            : "none",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          transition: "transform 0.2s ease",
          "&:hover": { transform: "translateY(-4px)" },
        }}
      >
        {tier.highlight && (
          <Chip
            label={t("landingPage.pricing.mostPopular")}
            size="small"
            color="primary"
            sx={{
              position: "absolute",
              top: -12,
              right: 16,
              fontWeight: 700,
              fontSize: "0.7rem",
            }}
          />
        )}
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {name}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, minHeight: 40 }}>
            {tagline}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <Typography sx={{ fontSize: "2.25rem", fontWeight: 800, lineHeight: 1 }}>
            {price}
          </Typography>
          {price !== "Free" && price !== "Gratis" && price !== "Custom" && (
            <Typography variant="body2" color="text.secondary">
              {t("landingPage.pricing.perSeatMonth")}
            </Typography>
          )}
        </Box>
        <Button
          {...ctaProps}
          variant={tier.highlight ? "contained" : "outlined"}
          fullWidth
          endIcon={<ArrowForwardIcon />}
          sx={{ fontWeight: 700, py: 1.25 }}
        >
          {ctaLabel}
        </Button>
        <Stack spacing={1} sx={{ mt: 1 }}>
          {features.map((feature, i) => (
            <Stack direction="row" spacing={1.25} alignItems="flex-start" key={i}>
              <CheckIcon
                sx={{ fontSize: 18, color: theme.palette.success.main, mt: "2px", flexShrink: 0 }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
                {feature}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
    );
  };

  return (
    <Box
      id="pricing"
      sx={{
        py: { xs: 8, md: 14 },
        bgcolor: "background.default",
        borderTop: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ textAlign: "center", mb: 6 }}>
          <Typography
            variant="h2"
            component="h2"
            sx={{ fontWeight: 800, mb: 2, fontSize: { xs: "1.75rem", md: "2.5rem" } }}
          >
            {t("landingPage.pricing.heading")}
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ maxWidth: 640, mx: "auto", mb: 3 }}
          >
            {t("landingPage.pricing.subheading")}
          </Typography>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            justifyContent="center"
            sx={{ mt: 2 }}
          >
            <Chip
              icon={<KeyIcon sx={{ fontSize: "16px !important" }} />}
              label={`${t("landingPage.pricing.byokLabel")} — ${t("landingPage.pricing.byokDescription")}`}
              sx={{
                fontWeight: 600,
                borderRadius: "999px",
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: "background.paper",
              }}
            />
            <Chip
              icon={<BoltIcon sx={{ fontSize: "16px !important" }} />}
              label={`${t("landingPage.pricing.managedLabel")} — ${t("landingPage.pricing.managedDescription")}`}
              sx={{
                fontWeight: 600,
                borderRadius: "999px",
                border: `1px solid ${alpha(theme.palette.primary.main, 0.4)}`,
                bgcolor: alpha(theme.palette.primary.main, 0.06),
                color: theme.palette.primary.main,
              }}
            />
          </Stack>
        </Box>

        <Grid container spacing={3}>
          {TIERS.map((tier) => (
            <Grid item xs={12} sm={6} md={4} key={tier.key}>
              {renderTierCard(tier)}
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
};

export default PricingSection;
