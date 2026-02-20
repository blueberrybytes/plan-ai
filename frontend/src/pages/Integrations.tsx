import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { useSelector } from "react-redux";
import { useParams, useSearchParams } from "react-router-dom";
import SidebarLayout from "../components/layout/SidebarLayout";
import { selectUser } from "../store/slices/auth/authSelector";
import { IntegrationProviderType, useListIntegrationsQuery } from "../store/apis/integrationApi";
import { useLazyGetJiraAuthorizationUrlQuery } from "../store/apis/jiraApi";
import type { components } from "../types/api";
import { useTranslation } from "react-i18next";

const PROVIDER_TAB_PARAM = "provider";

const STATUS_PARAM = "status";
const MESSAGE_PARAM = "message";
const STATE_PARAM = "state";

type ProviderTabValue = "jira" | "linear";

type ProviderConfig = {
  tabValue: ProviderTabValue;
  provider: IntegrationProviderType;
  labelKey: string;
  descriptionKey: string;
  connectCtaKey?: string;
  comingSoon?: boolean;
  comingSoonMessageKey?: string;
  notConnectedKey?: string;
};

type UserIntegrationSummary = components["schemas"]["UserIntegrationSummary"];

const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    tabValue: "jira",
    provider: "JIRA",
    labelKey: "integrationsPage.providers.jira.label",
    descriptionKey: "integrationsPage.providers.jira.description",
    connectCtaKey: "integrationsPage.providers.jira.connectCta",
    comingSoon: true,
    comingSoonMessageKey: "integrationsPage.providers.jira.comingSoonMessage",
    notConnectedKey: "integrationsPage.providers.jira.notConnected",
  },
  {
    tabValue: "linear",
    provider: "LINEAR",
    labelKey: "integrationsPage.providers.linear.label",
    descriptionKey: "integrationsPage.providers.linear.description",
    connectCtaKey: "integrationsPage.providers.linear.connectCta",
    comingSoon: true,
    comingSoonMessageKey: "integrationsPage.providers.linear.comingSoonMessage",
    notConnectedKey: "integrationsPage.providers.linear.notConnected",
  },
];

const defaultTab: ProviderTabValue = "jira";

const Integrations: React.FC = () => {
  const user = useSelector(selectUser);
  const { t } = useTranslation();
  const { provider: providerParam } = useParams<{ provider?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const normalizeProviderTab = (value: string | null | undefined): ProviderTabValue | null => {
    if (!value) {
      return null;
    }
    const lower = value.toLowerCase();
    const match = PROVIDER_CONFIGS.find((config) => config.tabValue.toLowerCase() === lower);
    return match?.tabValue ?? null;
  };

  const providerFromPath = useMemo(() => normalizeProviderTab(providerParam), [providerParam]);

  const providerFromQuery = useMemo(
    () => normalizeProviderTab(searchParams.get(PROVIDER_TAB_PARAM)),
    [searchParams],
  );

  const [activeTab, setActiveTab] = useState<ProviderTabValue>(
    providerFromPath ?? providerFromQuery ?? defaultTab,
  );
  const [jiraAuthError, setJiraAuthError] = useState<string | null>(null);

  const {
    data: integrationsData,
    isLoading: isIntegrationsLoading,
    error: integrationsError,
    refetch: refetchIntegrations,
  } = useListIntegrationsQuery(undefined, {
    skip: !user,
  });

  const integrations = useMemo(() => integrationsData?.data ?? [], [integrationsData?.data]);

  const [triggerJiraAuthorization, { isFetching: isJiraAuthorizationLoading }] =
    useLazyGetJiraAuthorizationUrlQuery();

  const status = searchParams.get(STATUS_PARAM);
  const messageFromQuery = searchParams.get(MESSAGE_PARAM) ?? undefined;
  const isSuccessStatus = status === "success";
  const isErrorStatus = status === "error";

  useEffect(() => {
    if (providerFromPath && providerFromPath !== activeTab) {
      setActiveTab(providerFromPath);
    }
  }, [providerFromPath, activeTab]);

  useEffect(() => {
    if (!providerFromPath && providerFromQuery && providerFromQuery !== activeTab) {
      setActiveTab(providerFromQuery);
    }
  }, [providerFromPath, providerFromQuery, activeTab]);

  useEffect(() => {
    if (isSuccessStatus) {
      refetchIntegrations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccessStatus]);

  useEffect(() => {
    const current = searchParams.get(PROVIDER_TAB_PARAM);
    if (current === activeTab) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(PROVIDER_TAB_PARAM, activeTab);
    setSearchParams(nextParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleChangeTab = (_event: React.SyntheticEvent, newValue: ProviderTabValue) => {
    setActiveTab(newValue);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(PROVIDER_TAB_PARAM, newValue);
    setSearchParams(nextParams, { replace: true });
  };

  const handleConnectJira = async () => {
    try {
      setJiraAuthError(null);
      const response = await triggerJiraAuthorization("integrations").unwrap();
      const authorizationUrl = response.data?.authorizationUrl;
      if (authorizationUrl) {
        window.location.href = authorizationUrl;
      } else {
        setJiraAuthError(t("integrationsPage.errors.jiraAuthStart"));
      }
    } catch (error) {
      console.error("Failed to fetch Jira authorization URL", error);
      setJiraAuthError(t("integrationsPage.errors.jiraAuthFlow"));
    }
  };

  const findIntegration = (provider: IntegrationProviderType): UserIntegrationSummary | undefined =>
    integrations.find(
      (integration): integration is UserIntegrationSummary =>
        Boolean(integration) && integration.provider === provider,
    );

  const renderProviderContent = (config: ProviderConfig) => {
    const integration = findIntegration(config.provider);

    return (
      <Paper elevation={2} sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h5" sx={{ mb: 1 }}>
              {t(config.labelKey)}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t(config.descriptionKey)}
            </Typography>
          </Box>

          {config.comingSoon ? (
            <Alert severity="info">
              {config.comingSoonMessageKey
                ? t(config.comingSoonMessageKey)
                : t("integrationsPage.comingSoonFallback", { provider: t(config.labelKey) })}
            </Alert>
          ) : null}

          {!config.comingSoon && integration ? (
            <ConnectedIntegrationDetails integration={integration} />
          ) : null}

          {!config.comingSoon && !integration ? (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {config.notConnectedKey
                  ? t(config.notConnectedKey)
                  : t("integrationsPage.providers.jira.notConnected", {
                      provider: t(config.labelKey),
                    })}
              </Typography>
              {config.tabValue === "jira" ? (
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleConnectJira}
                  disabled={isJiraAuthorizationLoading}
                >
                  {isJiraAuthorizationLoading
                    ? t("integrationsPage.connect.redirecting")
                    : config.connectCtaKey
                      ? t(config.connectCtaKey)
                      : undefined}
                </Button>
              ) : (
                <Button variant="contained" color="primary" disabled>
                  {config.connectCtaKey ? t(config.connectCtaKey) : undefined}
                </Button>
              )}
            </Box>
          ) : null}

          {config.tabValue === "jira" && jiraAuthError ? (
            <Alert severity="error" onClose={() => setJiraAuthError(null)}>
              {jiraAuthError}
            </Alert>
          ) : null}
        </Stack>
      </Paper>
    );
  };

  const handleDismissStatus = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete(STATUS_PARAM);
    nextParams.delete(MESSAGE_PARAM);
    nextParams.delete(STATE_PARAM);
    setSearchParams(nextParams, { replace: true });
  };

  if (!user) {
    return (
      <SidebarLayout>
        <Box sx={{ p: 4 }}>
          <Alert severity="warning">{t("integrationsPage.notSignedIn")}</Alert>
        </Box>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 3, md: 6 } }}>
        <Stack spacing={4}>
          <Box>
            <Typography variant="h4" gutterBottom>
              {t("integrationsPage.heading")}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t("integrationsPage.description")}
            </Typography>
          </Box>

          <Box>
            <Tabs
              value={activeTab}
              onChange={handleChangeTab}
              variant="scrollable"
              allowScrollButtonsMobile
            >
              {PROVIDER_CONFIGS.map((config) => (
                <Tab key={config.tabValue} label={t(config.labelKey)} value={config.tabValue} />
              ))}
            </Tabs>
          </Box>

          {isSuccessStatus || isErrorStatus ? (
            <Alert severity={isSuccessStatus ? "success" : "error"} onClose={handleDismissStatus}>
              {messageFromQuery ??
                (isSuccessStatus
                  ? t("integrationsPage.statusAlert.success")
                  : t("integrationsPage.statusAlert.error"))}
            </Alert>
          ) : null}

          {integrationsError ? (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={() => refetchIntegrations()}>
                  {t("integrationsPage.buttons.retry")}
                </Button>
              }
            >
              {t("integrationsPage.errors.cannotLoad")}
            </Alert>
          ) : null}

          {isIntegrationsLoading ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                {t("integrationsPage.loading")}
              </Typography>
            </Box>
          ) : null}

          {PROVIDER_CONFIGS.filter((config) => config.tabValue === activeTab).map((config) => (
            <Box key={config.tabValue}>{renderProviderContent(config)}</Box>
          ))}
        </Stack>
      </Box>
    </SidebarLayout>
  );
};

const ConnectedIntegrationDetails: React.FC<{
  integration: UserIntegrationSummary;
}> = ({ integration }) => {
  const { t } = useTranslation();
  const statusColorMap: Record<UserIntegrationSummary["status"], "success" | "default" | "error"> =
    {
      CONNECTED: "success",
      DISCONNECTED: "default",
      ERROR: "error",
    };

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Chip
          label={integration.status.toLowerCase()}
          color={statusColorMap[integration.status]}
          sx={{ textTransform: "capitalize" }}
        />
        {integration.accountName ? (
          <Typography variant="body2" color="text.secondary">
            {integration.accountName}
          </Typography>
        ) : null}
      </Stack>

      <Typography variant="body2" color="text.secondary">
        {t("integrationsPage.connectedDetails.linkedAccount", {
          accountId: integration.accountId ?? t("integrationsPage.connectedDetails.unknownAccount"),
        })}
      </Typography>

      <Typography variant="body2" color="text.secondary">
        {t("integrationsPage.connectedDetails.connectedOn", {
          timestamp: new Date(integration.createdAt).toLocaleString(),
        })}
      </Typography>

      {integration.expiresAt ? (
        <Typography variant="body2" color="text.secondary">
          {t("integrationsPage.connectedDetails.expiresOn", {
            timestamp: new Date(integration.expiresAt).toLocaleString(),
          })}
        </Typography>
      ) : null}

      <Typography variant="body2" color="text.secondary">
        {t("integrationsPage.connectedDetails.refreshToken", {
          status: integration.hasRefreshToken
            ? t("integrationsPage.connectedDetails.refreshAvailable")
            : t("integrationsPage.connectedDetails.refreshUnavailable"),
        })}
      </Typography>
    </Stack>
  );
};

export default Integrations;
