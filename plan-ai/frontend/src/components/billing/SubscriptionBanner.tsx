import React from "react";
import { Alert, AlertTitle, Box, Button } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { useGetSubscriptionQuery, useGetCatalogQuery } from "../../store/apis/billingApi";
import { useGetMyWorkspacesQuery } from "../../store/apis/workspaceApi";
import { selectActiveWorkspaceId } from "../../store/slices/app/appSelector";

/**
 * Persistent banner that warns the user when their workspace's subscription
 * is missing, expired, or canceled. Shown across the app on top of paid
 * surfaces (Chat, Slides, Docs, Diagrams, Recordings).
 *
 * Hidden entirely when:
 *  - Stripe is not configured (self-hosted / OSS instance).
 *  - The workspace is on an active subscription.
 *  - The workspace is courtesy (managed by the team).
 *  - The user is already on /billing (no point yelling about it on the page
 *    that fixes it).
 *
 * For workspace MEMBERs (not OWNER/ADMIN) we show a different copy because
 * they can't initiate checkout themselves — they need to ping their admin.
 */
const SubscriptionBanner: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { data: subscription } = useGetSubscriptionQuery();
  const { data: workspaces } = useGetMyWorkspacesQuery();
  const { data: catalog } = useGetCatalogQuery();
  const activeWorkspaceId = useSelector(selectActiveWorkspaceId);

  if (!subscription) return null;
  if (!subscription.configured) return null; // OSS / self-host — never block
  if (subscription.active) return null;
  if (location.pathname.startsWith("/billing")) return null;

  const activeWorkspace = workspaces?.find((w) => w.id === activeWorkspaceId);
  const canSubscribe = activeWorkspace?.role === "OWNER" || activeWorkspace?.role === "ADMIN";

  // `over_quota` means the subscription IS active (and paid) — they just
  // have more team members than purchased seats. Different copy, different
  // remediation (manage team OR add seats), different banner title.
  const isOverQuota = subscription.reason === "over_quota";

  const reasonKey = !canSubscribe
    ? isOverQuota
      ? "billing.banner.memberOverQuota"
      : "billing.banner.memberAskAdmin"
    : isOverQuota
      ? "billing.banner.overQuota"
      : subscription.reason === "expired"
        ? "billing.banner.expired"
        : subscription.reason === "canceled"
          ? "billing.banner.canceled"
          : subscription.reason === "incomplete"
            ? "billing.banner.incomplete"
            : "billing.banner.noSubscription";

  const titleKey = isOverQuota ? "billing.banner.overQuotaTitle" : "billing.banner.title";

  // Turn the cold "no subscription" warning into a free-trial hook: friendlier
  // info styling + enticing copy. Only when the user has never subscribed
  // (no_subscription), can subscribe themselves, and a BYOK trial is available.
  const byokTrialDays = catalog?.byokTrialDays ?? 0;
  const showTrialOffer =
    canSubscribe && byokTrialDays > 0 && reasonKey === "billing.banner.noSubscription";

  return (
    <Box sx={{ px: 2, pt: 2 }}>
      <Alert
        severity={showTrialOffer ? "info" : "warning"}
        action={
          canSubscribe ? (
            <Button
              color="inherit"
              size="small"
              variant={showTrialOffer ? "outlined" : "text"}
              onClick={() => navigate(isOverQuota ? "/team" : "/billing")}
            >
              {t(
                showTrialOffer
                  ? "billing.banner.trialCta"
                  : isOverQuota
                    ? "billing.banner.overQuotaCta"
                    : "billing.banner.cta",
              )}
            </Button>
          ) : undefined
        }
      >
        <AlertTitle>
          {showTrialOffer ? t("billing.banner.trialTitle", { days: byokTrialDays }) : t(titleKey)}
        </AlertTitle>
        {showTrialOffer
          ? t("billing.banner.trialDescription", { days: byokTrialDays })
          : t(reasonKey)}
      </Alert>
    </Box>
  );
};

export default SubscriptionBanner;
