import React, { useState } from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  Paper,
  Stack,
  Typography,
  useTheme,
  alpha,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from "@mui/material";
import {
  CheckCircleOutline as CheckIcon,
  OpenInNew as OpenInNewIcon,
  Bolt as BoltIcon,
  Key as KeyIcon,
  CardGiftcard as GiftIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { selectActiveWorkspaceId } from "../store/slices/app/appSelector";
import SidebarLayout from "../components/layout/SidebarLayout";
import {
  CatalogEntry,
  useCreateCheckoutMutation,
  useCreatePortalMutation,
  useGetCatalogQuery,
  useGetSubscriptionQuery,
  useSyncSessionMutation,
  useSyncPortalMutation,
} from "../store/apis/billingApi";
import {
  useGetMyWorkspacesQuery,
  useUpdateWorkspaceSettingsMutation,
} from "../store/apis/workspaceApi";
import { setToastMessage } from "../store/slices/app/appSlice";

/**
 * Billing page. Two modes:
 *  - **No active subscription** → renders the catalog, lets user start a
 *    Stripe Checkout session for the chosen tier.
 *  - **Active subscription** → renders the current plan summary plus a CTA
 *    to open the Stripe Customer Portal for plan changes / cancellation.
 *
 * When `?status=success` is present in the URL we show a one-time success
 * toast — the webhook should have already synced the subscription by the
 * time the redirect lands, but we refetch defensively.
 */
const Billing: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const checkoutStatus = searchParams.get("status");
  const sessionId = searchParams.get("session_id");
  const fromOnboarding = searchParams.get("from") === "onboarding";

  const {
    data: subscription,
    isLoading: subLoading,
    refetch: refetchSub,
  } = useGetSubscriptionQuery(undefined, { refetchOnFocus: true });
  const { data: catalog, isLoading: catalogLoading } = useGetCatalogQuery();
  const [createCheckout, { isLoading: checkoutLoading }] = useCreateCheckoutMutation();
  const [createPortal, { isLoading: portalLoading }] = useCreatePortalMutation();

  const dispatch = useDispatch();
  const [updateSettings, { isLoading: isUpdatingSettings }] = useUpdateWorkspaceSettingsMutation();

  // Pull fresh workspace data so we can check if BYOK keys are *already*
  // configured before prompting. Without this, upgrading BYOK→BYOK would
  // re-trigger the modal for users who already have keys.
  const { data: workspaces } = useGetMyWorkspacesQuery();
  const activeWorkspaceId = useSelector(selectActiveWorkspaceId);
  const activeWorkspace = workspaces?.find((w) => w.id === activeWorkspaceId);
  const hasExistingKeys = Boolean(
    activeWorkspace?.openRouterKey && activeWorkspace?.deepgramKey,
  );

  const [showByokModal, setShowByokModal] = useState(false);
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [deepgramKey, setDeepgramKey] = useState("");

  // Ref guard so the post-checkout modal only fires *once* per page mount,
  // even if cache thrash or re-renders re-evaluate the trigger condition.
  const byokModalShownRef = React.useRef(false);

  const handleSaveKeys = async () => {
    try {
      await updateSettings({ openRouterKey, deepgramKey }).unwrap();
      dispatch(setToastMessage({ message: "API keys configured successfully!", severity: "success" }));
      setShowByokModal(false);
      dismissStatus();
    } catch (e) {
      console.error(e);
      dispatch(setToastMessage({ message: "Failed to save API keys", severity: "error" }));
    }
  };
  const [syncSession] = useSyncSessionMutation();
  const [syncPortal] = useSyncPortalMutation();

  // On returning from Stripe Checkout, race the webhook against the user.
  // Force a synchronous sync via sessionId so the page renders the active
  // subscription state even if Stripe's webhook delivery is delayed.
  //
  // After the sync resolves and the subscription is refetched, decide
  // whether to prompt the user for BYOK keys. We do this *inside* the sync
  // flow (rather than a separate cache-driven useEffect) so we can't fire
  // on stale subscription.track values from a previous plan — concretely:
  // BYOK→Managed upgrade used to pop the modal during the brief window
  // where cached track was still "BYOK".
  React.useEffect(() => {
    if (checkoutStatus !== "success") return;
    let cancelled = false;
    const run = async () => {
      try {
        if (sessionId) {
          await syncSession({ sessionId }).unwrap();
        }
      } catch (err) {
        console.warn("[billing] sync-session failed, falling back to refetch", err);
      }
      if (cancelled) return;
      const result = await refetchSub();
      if (cancelled) return;

      // Only prompt for BYOK keys when:
      //   - this is a fresh post-checkout return
      //   - the *now-current* subscription track is BYOK (not Managed)
      //   - the workspace doesn't already have keys configured
      //   - we haven't already shown the modal for this page mount
      const freshTrack = result.data?.track;
      if (
        !byokModalShownRef.current &&
        freshTrack === "BYOK" &&
        !hasExistingKeys
      ) {
        byokModalShownRef.current = true;
        setShowByokModal(true);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [checkoutStatus, sessionId, syncSession, refetchSub, hasExistingKeys]);

  // Force-sync on portal return to bypass webhook delay.
  React.useEffect(() => {
    if (checkoutStatus !== "portal_return") return;
    let cancelled = false;
    const run = async () => {
      try {
        await syncPortal().unwrap();
        dispatch(setToastMessage({ message: "Subscription updated successfully.", severity: "success" }));
      } catch (err) {
        console.warn("[billing] sync-portal failed, falling back to refetch", err);
      }
      if (!cancelled) refetchSub();
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [checkoutStatus, syncPortal, refetchSub, dispatch]);

  const handleCheckout = async (priceId: string, seats: number) => {
    try {
      const res = await createCheckout({ priceId, seats }).unwrap();
      window.location.href = res.url;
    } catch (err) {
      console.error("[billing] Checkout failed", err);
    }
  };

  const handlePortal = async () => {
    try {
      const { url } = await createPortal().unwrap();
      window.location.href = url;
    } catch (err) {
      console.error("[billing] Portal failed", err);
    }
  };

  const dismissStatus = () => {
    searchParams.delete("status");
    searchParams.delete("session_id");
    setSearchParams(searchParams);
  };

  if (subLoading || catalogLoading) {
    return (
      <SidebarLayout>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
          <CircularProgress />
        </Box>
      </SidebarLayout>
    );
  }

  // OSS / self-hosted instance — billing surface still loads but informs the user.
  if (subscription && !subscription.configured) {
    return (
      <SidebarLayout>
        <Container maxWidth="md" sx={{ py: 6 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>
            {t("billing.title")}
          </Typography>
          <Alert severity="info">{t("billing.notConfigured")}</Alert>
        </Container>
      </SidebarLayout>
    );
  }

  // Courtesy workspace — full access granted by the team, no billing needed.
  if (activeWorkspace?.isCourtesy) {
    return (
      <SidebarLayout>
        <Container maxWidth="sm" sx={{ py: 8 }}>
          <Stack spacing={4} alignItems="center" textAlign="center">
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: (t) => alpha(t.palette.success.main, 0.12),
              }}
            >
              <GiftIcon sx={{ fontSize: 40, color: "success.main" }} />
            </Box>

            <Box>
              <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
                Courtesy Access
              </Typography>
              <Chip label="Active" color="success" size="small" sx={{ fontWeight: 700 }} />
            </Box>

            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 420 }}>
              Your workspace has been granted complimentary access to all Plan AI
              features. No subscription or payment is required.
            </Typography>

            <Paper
              variant="outlined"
              sx={{ p: 3, borderRadius: "16px", width: "100%", textAlign: "left" }}
            >
              <Stack spacing={1.5}>
                {[
                  "Unlimited recordings & transcriptions",
                  "Full AI assistant & generative studio",
                  "All integrations (Jira, Linear, Trello, Notion, Asana)",
                  "Branded slides, documents & diagrams",
                ].map((feat) => (
                  <Stack key={feat} direction="row" spacing={1.5} alignItems="center">
                    <CheckIcon sx={{ fontSize: 20, color: "success.main" }} />
                    <Typography variant="body2">{feat}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Paper>

            <Typography variant="caption" color="text.secondary">
              Managed by the Plan AI team. Contact us if you have any questions.
            </Typography>
          </Stack>
        </Container>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={4}>
          {checkoutStatus === "success" && (
            <Alert severity="success" onClose={dismissStatus}>
              {t("billing.successAlert")}
            </Alert>
          )}
          {checkoutStatus === "canceled" && (
            <Alert severity="warning" onClose={dismissStatus}>
              {t("billing.canceledAlert")}
            </Alert>
          )}

          {/* Seat over-quota alert — the subscription is paid but workspace
              has too many members. Surfaced prominently with two CTAs so the
              user can fix it either way. */}
          {subscription?.reason === "over_quota" && (
            <Alert severity="warning">
              <AlertTitle>{t("billing.banner.overQuotaTitle")}</AlertTitle>
              {t("billing.banner.overQuota")}
            </Alert>
          )}

          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
              {fromOnboarding ? t("billing.welcome.title") : t("billing.title")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {fromOnboarding ? t("billing.welcome.subtitle") : t("billing.subtitle")}
            </Typography>
          </Box>

          {/* Current subscription summary — visible when active OR when the
              only issue is over_quota (subscription IS paid, just too many
              seats used). We want the user to see what they have so they
              can decide between "add seats" vs "remove members". */}
          {(subscription?.active || subscription?.reason === "over_quota") && (
            <Paper sx={{ p: 3.5, borderRadius: "20px" }} variant="outlined">
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                justifyContent="space-between"
                alignItems={{ md: "center" }}
              >
                <Box>
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      {t("billing.currentPlan")}
                    </Typography>
                    <Chip
                      label={subscription.tier}
                      size="small"
                      color="primary"
                      sx={{ fontWeight: 700 }}
                    />
                    {subscription.track && (
                      <Chip
                        label={subscription.track}
                        size="small"
                        variant="outlined"
                        icon={
                          subscription.track === "BYOK" ? (
                            <KeyIcon sx={{ fontSize: "14px !important" }} />
                          ) : (
                            <BoltIcon sx={{ fontSize: "14px !important" }} />
                          )
                        }
                      />
                    )}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {subscription.seats}{" "}
                    {subscription.seats === 1 ? t("billing.seat") : t("billing.seats")}
                    {subscription.currentPeriodEnd && (
                      <>
                        {" · "}
                        {t("billing.renewsOn", {
                          date: new Date(subscription.currentPeriodEnd).toLocaleDateString(),
                        })}
                      </>
                    )}
                    {subscription.cancelAtPeriodEnd && (
                      <>
                        {" · "}
                        <Box component="span" sx={{ color: "warning.main", fontWeight: 600 }}>
                          {t("billing.cancelsAtEnd")}
                        </Box>
                      </>
                    )}
                  </Typography>
                </Box>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handlePortal}
                    disabled={portalLoading}
                  >
                    Add / Remove Seats
                  </Button>
                  <Button
                    variant="outlined"
                    endIcon={<OpenInNewIcon />}
                    onClick={handlePortal}
                    disabled={portalLoading}
                  >
                    {t("billing.managePortal")}
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          )}

          {/* Catalog grid — always visible (lets active users upgrade too) */}
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
              {subscription?.active || subscription?.reason === "over_quota"
                ? t("billing.changePlan")
                : t("billing.choosePlan")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {t("billing.catalogSubtitle")}
            </Typography>

            {(!catalog || catalog.prices.length === 0) && (
              <Alert severity="warning">{t("billing.catalogEmpty")}</Alert>
            )}

            <Grid container spacing={3}>
              {catalog?.prices.map((entry) => (
                <Grid item xs={12} sm={6} md={3} key={entry.priceId}>
                  <CatalogCard
                    entry={entry}
                    currentPriceId={subscription?.priceId ?? null}
                    onSelect={(seats) => handleCheckout(entry.priceId, seats)}
                    onManagePortal={handlePortal}
                    loading={checkoutLoading || portalLoading}
                  />
                </Grid>
              ))}
            </Grid>
          </Box>

          <Divider />

          <Box>
            <Typography variant="caption" color="text.secondary">
              {t("billing.legalNote")}
            </Typography>
          </Box>
        </Stack>
      </Container>

      <Dialog open={showByokModal} onClose={() => setShowByokModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Welcome aboard! 🎉</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 3 }}>
            Your <b>Bring Your Own Key</b> plan is now active. To unlock AI features, recordings, and insights, you must configure your API keys below.
          </Typography>

          <Stack spacing={2.5}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                OpenRouter API Key
              </Typography>
              <TextField
                fullWidth
                size="small"
                type="password"
                placeholder="sk-or-v1-..."
                value={openRouterKey}
                onChange={(e) => setOpenRouterKey(e.target.value)}
                autoComplete="off"
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                Required for task extraction and AI assistant (GPT-4o, Claude, etc).
              </Typography>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                Deepgram API Key
              </Typography>
              <TextField
                fullWidth
                size="small"
                type="password"
                placeholder="dg_..."
                value={deepgramKey}
                onChange={(e) => setDeepgramKey(e.target.value)}
                autoComplete="off"
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                Required for real-time and batch speech-to-text transcriptions.
              </Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1, pb: 3 }}>
          <Button onClick={() => setShowByokModal(false)} color="inherit" disabled={isUpdatingSettings}>
            I&apos;ll do it later
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSaveKeys}
            disabled={!openRouterKey || !deepgramKey || isUpdatingSettings}
          >
            {isUpdatingSettings ? "Saving..." : "Save API Keys"}
          </Button>
        </DialogActions>
      </Dialog>
    </SidebarLayout>
  );
};

const CatalogCard: React.FC<{
  entry: CatalogEntry;
  currentPriceId: string | null;
  onSelect: (seats: number) => void;
  onManagePortal: () => void;
  loading: boolean;
}> = ({ entry, currentPriceId, onSelect, onManagePortal, loading }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [seats, setSeats] = React.useState(1);

  const isCurrent = entry.priceId === currentPriceId;
  const isByok = entry.track === "BYOK";
  const highlight = !isByok && !isCurrent;

  // Tier features come from the landing-page i18n so we keep one source of truth.
  const featuresRaw = t(`landingPage.pricing.tiers.${entry.key}.features`, {
    returnObjects: true,
  }) as unknown;
  const features: string[] = Array.isArray(featuresRaw) ? (featuresRaw as string[]) : [];
  const name = t(`landingPage.pricing.tiers.${entry.key}.name`);
  const price = t(`landingPage.pricing.tiers.${entry.key}.price`);
  const tagline = t(`landingPage.pricing.tiers.${entry.key}.tagline`);

  const borderStyle = isByok
    ? `2px dashed ${theme.palette.secondary.main}`
    : highlight
    ? `2px solid ${theme.palette.primary.main}`
    : `1px solid ${theme.palette.divider}`;

  const bgStyle = isByok
    ? alpha(theme.palette.secondary.main, 0.04)
    : highlight
    ? alpha(theme.palette.primary.main, 0.04)
    : "background.paper";

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 3,
        borderRadius: "20px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        position: "relative",
        border: borderStyle,
        bgcolor: bgStyle,
      }}
    >
      {highlight && (
        <Chip
          label={t("landingPage.pricing.mostPopular")}
          size="small"
          color="primary"
          sx={{ position: "absolute", top: -10, right: 12, fontWeight: 700, fontSize: "0.7rem" }}
        />
      )}
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {name}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ minHeight: 32 }}>
          {tagline}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <Typography sx={{ fontSize: "2rem", fontWeight: 800 }}>{price}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t("landingPage.pricing.perSeatMonth")}
        </Typography>
      </Box>
      <Chip
        label={entry.track === "BYOK" ? t("billing.trackByok") : t("billing.trackManaged")}
        size="small"
        variant="outlined"
        color={isByok ? "secondary" : "default"}
        sx={{
          alignSelf: "flex-start",
          height: "auto",
          "& .MuiChip-label": {
            whiteSpace: "normal",
            display: "block",
            py: 0.5,
          },
        }}
      />
      {!isCurrent && (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 1, px: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>Seats to purchase:</Typography>
          <TextField
            type="number"
            size="small"
            value={seats}
            onChange={(e) => setSeats(Math.max(1, parseInt(e.target.value) || 1))}
            inputProps={{ min: 1 }}
            sx={{ width: 80 }}
            disabled={loading}
          />
        </Box>
      )}
      {isCurrent ? (
        <Button
          variant="contained"
          color="primary"
          onClick={onManagePortal}
          disabled={loading}
          fullWidth
          sx={{ fontWeight: 700 }}
        >
          {t("billing.addRemoveSeats", "Add / Remove Seats")}
        </Button>
      ) : (
        <Button
          variant={highlight ? "contained" : isByok ? "outlined" : "outlined"}
          color={isByok ? "secondary" : "primary"}
          onClick={() => onSelect(seats)}
          disabled={loading}
          fullWidth
          sx={{ fontWeight: 700 }}
        >
          {t("billing.subscribe")}
        </Button>
      )}

      {isByok && (
        <Alert
          severity="info"
          icon={false}
          sx={{
            py: 0,
            px: 1.5,
            border: `1px solid ${theme.palette.info.light}`,
            "& .MuiAlert-message": { fontSize: "0.75rem", py: 1 },
          }}
        >
          {t("billing.requiresKeys", { defaultValue: "You must provide your own OpenRouter and Deepgram API keys." })}
        </Alert>
      )}

      <Stack spacing={1}>
        {features.map((feature, i) => (
          <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
            <CheckIcon
              sx={{ fontSize: 16, color: "success.main", mt: "2px", flexShrink: 0 }}
            />
            <Typography variant="caption" color="text.secondary">
              {feature}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
};

export default Billing;
