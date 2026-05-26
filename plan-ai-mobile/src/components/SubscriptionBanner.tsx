import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, Linking, Pressable } from "react-native";
import { Text, Button, useTheme } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";

/**
 * Persistent warning banner that surfaces when the active workspace has no
 * active Stripe subscription. The recorder screen blocks via the disabled
 * record button, but this banner gives users a constant, tap-to-act
 * affordance everywhere else in the app.
 *
 * Hidden when:
 *  - Stripe is not configured on the backend (self-host / OSS).
 *  - Subscription is active.
 *  - We don't have a workspace yet.
 *
 * Tapping the CTA opens the web Billing page in the system browser since
 * the actual Stripe Checkout flow requires a desktop browser anyway.
 */
const WEB_APP_URL =
  process.env.EXPO_PUBLIC_PLAN_AI_WEB_URL || "https://plan-ai.blueberrybytes.com";

type Reason =
  | "no_subscription"
  | "expired"
  | "canceled"
  | "incomplete"
  | "over_quota"
  | undefined;

export const SubscriptionBanner: React.FC = () => {
  const theme = useTheme();
  const { api, activeWorkspaceId, workspaces } = useAuth();
  const [active, setActive] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(false);
  const [reason, setReason] = useState<Reason>(undefined);

  const refresh = useCallback(async () => {
    if (!activeWorkspaceId) return;
    try {
      const sub = await api.getSubscription();
      setActive(sub.active);
      setConfigured(sub.configured);
      setReason(sub.reason as Reason);
    } catch (err) {
      // Fail open — don't show a banner on backend errors.
      console.warn("[mobile] Failed to load subscription state", err);
      setActive(true);
      setConfigured(false);
    }
  }, [activeWorkspaceId, api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Hide for OSS / self-host instances, active subs, or before first load.
  if (active === null) return null;
  if (!configured) return null;
  if (active) return null;

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const canSubscribe =
    activeWorkspace?.role === "OWNER" || activeWorkspace?.role === "ADMIN";

  // `over_quota` is special: subscription is paid + active, but too many
  // members for the purchased seat count. Different copy, different CTA
  // (deep-link to /team instead of /billing) and different banner title.
  const isOverQuota = reason === "over_quota";

  const title = isOverQuota ? "Too many seats in use" : "Subscription required";

  const reasonText = !canSubscribe
    ? isOverQuota
      ? "This workspace has more members than paid seats. Ask your admin to remove members or add more seats."
      : "Ask your workspace admin to choose a plan to unlock recordings."
    : isOverQuota
      ? "Your team has more members than paid seats. Remove members or buy more seats to keep using Plan AI."
      : reason === "expired"
        ? "Your subscription has lapsed. Update your card to keep recording."
        : reason === "canceled"
          ? "Your subscription has been canceled. Re-subscribe to keep using Plan AI."
          : reason === "incomplete"
            ? "Your last payment is incomplete. Finish checkout to activate it."
            : "No active subscription. Recordings and AI features are disabled.";

  const handleOpenBilling = () => {
    const path = isOverQuota ? "/team" : "/billing";
    void Linking.openURL(`${WEB_APP_URL.replace(/\/+$/, "")}${path}`);
  };

  const ctaLabel = isOverQuota ? "Manage team" : "Choose plan";

  return (
    <Pressable
      onPress={canSubscribe ? handleOpenBilling : undefined}
      style={[
        styles.banner,
        {
          backgroundColor: theme.colors.errorContainer,
          borderColor: theme.colors.error,
        },
      ]}
    >
      <MaterialCommunityIcons
        name="alert-circle-outline"
        size={20}
        color={theme.colors.error}
        style={{ marginRight: 8 }}
      />
      <View style={{ flex: 1 }}>
        <Text
          variant="labelLarge"
          style={{ color: theme.colors.onErrorContainer, fontWeight: "700" }}
        >
          {title}
        </Text>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onErrorContainer, marginTop: 2 }}
        >
          {reasonText}
        </Text>
      </View>
      {canSubscribe && (
        <Button
          mode="contained-tonal"
          compact
          onPress={handleOpenBilling}
          style={{ marginLeft: 8 }}
        >
          {ctaLabel}
        </Button>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    margin: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
});

export default SubscriptionBanner;
