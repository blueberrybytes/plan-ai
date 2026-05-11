import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  List,
  ListItem,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  Typography,
  IconButton,
  TextField,
} from "@mui/material";
import SyncIcon from "@mui/icons-material/Sync";
import AddIcon from "@mui/icons-material/Add";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import SidebarLayout from "../components/layout/SidebarLayout";
import { selectUser } from "../store/slices/auth/authSelector";
import { setToastMessage } from "../store/slices/app/appSlice";
import { selectActiveWorkspaceId } from "../store/slices/app/appSelector";
import { useGetMyWorkspacesQuery } from "../store/apis/workspaceApi";
import {
  IntegrationProviderType,
  useListIntegrationsQuery,
  useBindGithubInstallationMutation,
  useGetGithubRepositoriesQuery,
  useLazyGetGoogleAuthUrlQuery,
  GithubRepository,
  integrationApi,
} from "../store/apis/integrationApi";
import {
  useConnectJiraManuallyMutation,
  useGetJiraSummaryQuery,
  useGetJiraProjectsQuery,
  useSetJiraDefaultProjectMutation,
} from "../store/apis/jiraApi";
import {
  useConnectLinearManuallyMutation,
  useGetLinearSummaryQuery,
  useGetLinearTeamsQuery,
  useSetLinearDefaultTeamMutation,
} from "../store/apis/linearApi";
import {
  useConnectTrelloManuallyMutation,
  useGetTrelloSummaryQuery,
  useGetTrelloBoardsQuery,
  useGetTrelloListsQuery,
  useSetTrelloDefaultBoardListMutation,
} from "../store/apis/trelloApi";
import type { components } from "../types/api";
import { useTranslation } from "react-i18next";

import { HowToConnectDialog, HowToProvider } from "../components/integrations/HowToConnectDialog";

const PROVIDER_TAB_PARAM = "provider";

const STATUS_PARAM = "status";
const MESSAGE_PARAM = "message";

type ProviderTabValue = "jira" | "linear" | "trello" | "github" | "google";

type ProviderConfig = {
  tabValue: ProviderTabValue;
  provider: IntegrationProviderType;
  labelKey: string;
  descriptionKey: string;
  connectCtaKey?: string;
  comingSoon?: boolean;
  comingSoonMessageKey?: string;
  notConnectedKey?: string;
  isBeta?: boolean;
};

type UserIntegrationSummary = components["schemas"]["IntegrationSummaryResponse"];

const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    tabValue: "jira",
    provider: "JIRA",
    labelKey: "integrationsPage.providers.jira.label",
    descriptionKey: "integrationsPage.providers.jira.description",
    connectCtaKey: "integrationsPage.providers.jira.connectCta",
    comingSoon: false,
    notConnectedKey: "integrationsPage.providers.jira.notConnected",
  },
  {
    tabValue: "linear",
    provider: "LINEAR",
    labelKey: "integrationsPage.providers.linear.label",
    descriptionKey: "integrationsPage.providers.linear.description",
    connectCtaKey: "integrationsPage.providers.linear.connectCta",
    comingSoon: false,
    notConnectedKey: "integrationsPage.providers.linear.notConnected",
  },
  {
    tabValue: "github",
    provider: "GITHUB",
    labelKey: "integrationsPage.providers.github.label",
    descriptionKey: "integrationsPage.providers.github.description",
    connectCtaKey: "integrationsPage.providers.github.connectCta",
    comingSoon: false,
    notConnectedKey: "integrationsPage.providers.github.notConnected",
  },
  {
    tabValue: "google",
    provider: "GOOGLE_DRIVE",
    labelKey: "integrationsPage.providers.google.label",
    descriptionKey: "integrationsPage.providers.google.description",
    connectCtaKey: "integrationsPage.providers.google.connectCta",
    comingSoon: false,
    notConnectedKey: "integrationsPage.providers.google.notConnected",
    isBeta: true,
  },
  {
    tabValue: "trello",
    provider: "TRELLO",
    labelKey: "integrationsPage.providers.trello.label",
    descriptionKey: "integrationsPage.providers.trello.description",
    connectCtaKey: "integrationsPage.providers.trello.connectCta",
    comingSoon: false,
    notConnectedKey: "integrationsPage.providers.trello.notConnected",
    isBeta: true,
  },
];

const defaultTab: ProviderTabValue = "jira";

const Integrations: React.FC = () => {
  const user = useSelector(selectUser);
  const activeWorkspaceId = useSelector(selectActiveWorkspaceId);
  const dispatch = useDispatch();
  const { t } = useTranslation();

  const { data: workspaces } = useGetMyWorkspacesQuery();
  const activeWorkspace = workspaces?.find((w) => w.id === activeWorkspaceId);
  const canManageIntegrations =
    activeWorkspace?.role === "OWNER" || activeWorkspace?.role === "ADMIN";
  const { provider: providerParam } = useParams<{ provider?: string }>();
  const [searchParams] = useSearchParams();
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

  const activeTab: ProviderTabValue = providerFromPath ?? providerFromQuery ?? defaultTab;
  const navigate = useNavigate();

  const [jiraAuthError, setJiraAuthError] = useState<string | null>(null);
  const [jiraSiteUrl, setJiraSiteUrl] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraApiToken, setJiraApiToken] = useState("");
  const [trelloAuthError, setTrelloAuthError] = useState<string | null>(null);

  const [helpDialogProvider, setHelpDialogProvider] = useState<HowToProvider | null>(null);

  const [connectJiraManually, { isLoading: isJiraManualConnecting }] =
    useConnectJiraManuallyMutation();

  const [linearAuthError, setLinearAuthError] = useState<string | null>(null);
  const [linearApiKey, setLinearApiKey] = useState("");
  const [connectLinearManually, { isLoading: isLinearManualConnecting }] =
    useConnectLinearManuallyMutation();

  const [trelloApiKey, setTrelloApiKey] = useState("");
  const [trelloApiToken, setTrelloApiToken] = useState("");
  const [connectTrelloManually, { isLoading: isTrelloManualConnecting }] =
    useConnectTrelloManuallyMutation();

  const {
    data: integrationsData,
    isLoading: isIntegrationsLoading,
    error: integrationsError,
    refetch: refetchIntegrations,
  } = useListIntegrationsQuery(undefined, {
    skip: !user,
  });

  const integrations = useMemo(() => integrationsData?.data ?? [], [integrationsData?.data]);

  const status = searchParams.get(STATUS_PARAM);
  const messageFromQuery = searchParams.get(MESSAGE_PARAM) ?? undefined;
  const isSuccessStatus = status === "success";
  const isErrorStatus = status === "error";

  useEffect(() => {
    if (isSuccessStatus) {
      refetchIntegrations();
      if (messageFromQuery) {
        dispatch(setToastMessage({ severity: "success", message: messageFromQuery }));
      }
    } else if (isErrorStatus && messageFromQuery) {
      dispatch(setToastMessage({ severity: "error", message: messageFromQuery }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccessStatus, isErrorStatus]);

  const [bindGithub, { isLoading: isBindingGithub }] = useBindGithubInstallationMutation();
  const [triggerGoogleAuthorization, { isFetching: isGoogleAuthLoading }] =
    useLazyGetGoogleAuthUrlQuery();

  useEffect(() => {
    const installationId = searchParams.get("installation_id");

    if (installationId && user) {
      // Prevent double firing if already loading
      if (isBindingGithub) return;

      bindGithub(installationId)
        .unwrap()
        .then(() => {
          dispatch(
            setToastMessage({
              severity: "success",
              message: t("integrationsPage.statusAlert.success"),
            }),
          );
          navigate(`/integrations/github`, { replace: true });
        })
        .catch((error) => {
          console.error("Failed to bind github installation", error);
          dispatch(
            setToastMessage({
              severity: "error",
              message: t("integrationsPage.statusAlert.error"),
            }),
          );
          navigate(`/integrations/github`, { replace: true });
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user, bindGithub, navigate]);

  const handleChangeTab = (_event: React.SyntheticEvent, newValue: ProviderTabValue) => {
    navigate(`/integrations/${newValue}`);
  };

  const handleManualJiraConnect = async () => {
    setJiraAuthError(null);
    try {
      await connectJiraManually({
        siteUrl: jiraSiteUrl,
        email: jiraEmail,
        apiToken: jiraApiToken,
      }).unwrap();

      dispatch(
        setToastMessage({
          severity: "success",
          message: t("integrationsPage.statusAlert.success"),
        }),
      );
      refetchIntegrations();

      setJiraSiteUrl("");
      setJiraEmail("");
      setJiraApiToken("");
    } catch (err: unknown) {
      console.error("Failed to connect to Jira manually", err);
      const rtkError = err as { data?: { message?: string } };
      setJiraAuthError(rtkError?.data?.message || t("integrationsPage.errors.jiraAuthFlow"));
    }
  };

  const handleManualLinearConnect = async () => {
    setLinearAuthError(null);
    try {
      await connectLinearManually({
        apiKey: linearApiKey,
      }).unwrap();

      dispatch(
        setToastMessage({
          severity: "success",
          message: t("integrationsPage.statusAlert.success"),
        }),
      );
      refetchIntegrations();

      setLinearApiKey("");
    } catch (err: unknown) {
      console.error("Failed to connect to Linear manually", err);
      const rtkError = err as { data?: { message?: string } };
      setLinearAuthError(rtkError?.data?.message || t("integrationsPage.statusAlert.error"));
    }
  };

  const handleManualTrelloConnect = async () => {
    setTrelloAuthError(null);
    try {
      await connectTrelloManually({
        apiKey: trelloApiKey,
        token: trelloApiToken,
      }).unwrap();

      dispatch(
        setToastMessage({
          severity: "success",
          message: t("integrationsPage.statusAlert.success"),
        }),
      );
      refetchIntegrations();

      setTrelloApiKey("");
      setTrelloApiToken("");
    } catch (err: unknown) {
      console.error("Failed to connect to Trello manually", err);
      const rtkError = err as { data?: { message?: string } };
      setTrelloAuthError(rtkError?.data?.message || t("integrationsPage.statusAlert.error"));
    }
  };

  const handleConnectGithub = () => {
    const rawAppName =
      process.env.REACT_APP_GITHUB_APP_NAME ||
      process.env.REACT_APP_VITE_GITHUB_APP_NAME ||
      "plan-ai-architect";
    const githubAppName = rawAppName.replace("https://github.com/apps/", "").split("/")[0];
    const setupUrl = `https://github.com/apps/${githubAppName}/installations/new`;
    window.location.href = setupUrl;
  };

  const handleConnectGoogle = async () => {
    try {
      const response = await triggerGoogleAuthorization("/integrations/google").unwrap();
      const authorizationUrl = response.data?.authorizationUrl;
      if (authorizationUrl) {
        window.location.href = authorizationUrl;
      }
    } catch (error) {
      console.error("Failed to fetch Google authorization URL", error);
      dispatch(setToastMessage({ severity: "error", message: "Failed to start Google Auth" }));
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
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Typography variant="h5">{t(config.labelKey)}</Typography>
              {config.isBeta && (
                <Chip
                  label="BETA"
                  size="small"
                  color="secondary"
                  variant="filled"
                  sx={{ fontWeight: "bold" }}
                />
              )}
            </Stack>
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
            <ConnectedIntegrationDetails
              integration={integration}
              onAddMore={config.tabValue === "github" ? handleConnectGithub : undefined}
            />
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
              {config.tabValue === "jira" && (
                <Box
                  component="form"
                  sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 2, maxWidth: 400 }}
                >
                  <TextField
                    size="small"
                    label={t("integrationsPage.providers.jira.manualForm.siteUrlLabel")}
                    value={jiraSiteUrl}
                    onChange={(e) => setJiraSiteUrl(e.target.value)}
                    placeholder="https://my-company.atlassian.net"
                    required
                  />
                  <TextField
                    size="small"
                    label={t("integrationsPage.providers.jira.manualForm.emailLabel")}
                    value={jiraEmail}
                    onChange={(e) => setJiraEmail(e.target.value)}
                    type="email"
                    required
                  />
                  <TextField
                    size="small"
                    label={t("integrationsPage.providers.jira.manualForm.apiTokenLabel")}
                    value={jiraApiToken}
                    onChange={(e) => setJiraApiToken(e.target.value)}
                    type="password"
                    required
                  />
                  <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleManualJiraConnect}
                      disabled={
                        isJiraManualConnecting || !jiraSiteUrl || !jiraEmail || !jiraApiToken
                      }
                    >
                      {isJiraManualConnecting
                        ? t("integrationsPage.loading")
                        : t("integrationsPage.providers.jira.connectManualSubmit")}
                    </Button>
                    <Button
                      variant="text"
                      color="secondary"
                      onClick={() => setHelpDialogProvider("jira")}
                    >
                      {"How to find my token?"}
                    </Button>
                  </Stack>
                  {jiraAuthError && (
                    <Typography variant="body2" color="error">
                      {jiraAuthError}
                    </Typography>
                  )}
                </Box>
              )}
              {config.tabValue === "linear" && (
                <Box
                  component="form"
                  sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 2, maxWidth: 400 }}
                >
                  <TextField
                    size="small"
                    label="Personal API Key"
                    value={linearApiKey}
                    onChange={(e) => setLinearApiKey(e.target.value)}
                    placeholder="lin_api_..."
                    required
                  />
                  <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                    <Button
                      variant="contained"
                      onClick={handleManualLinearConnect}
                      disabled={isLinearManualConnecting || !linearApiKey.trim()}
                    >
                      {isLinearManualConnecting
                        ? t("integrationsPage.loading")
                        : t("integrationsPage.providers.linear.connectCta")}
                    </Button>
                    <Button
                      variant="text"
                      color="secondary"
                      onClick={() => setHelpDialogProvider("linear")}
                    >
                      {"How to find my key?"}
                    </Button>
                  </Stack>
                  {linearAuthError && (
                    <Typography variant="body2" color="error">
                      {linearAuthError}
                    </Typography>
                  )}
                </Box>
              )}
              {config.tabValue === "trello" && (
                <Box
                  component="form"
                  sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 2, maxWidth: 400 }}
                >
                  <Alert severity="info">
                    Generate your app key and token directly from{" "}
                    <a href="https://trello.com/app-key" target="_blank" rel="noopener noreferrer">
                      Trello
                    </a>
                    .
                  </Alert>
                  <TextField
                    size="small"
                    label="Trello App Key"
                    value={trelloApiKey}
                    onChange={(e) => setTrelloApiKey(e.target.value)}
                    required
                  />
                  <TextField
                    size="small"
                    label="Trello Token"
                    value={trelloApiToken}
                    onChange={(e) => setTrelloApiToken(e.target.value)}
                    required
                  />
                  <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                    <Button
                      variant="contained"
                      onClick={handleManualTrelloConnect}
                      disabled={
                        isTrelloManualConnecting || !trelloApiKey.trim() || !trelloApiToken.trim()
                      }
                    >
                      {isTrelloManualConnecting
                        ? t("integrationsPage.loading")
                        : config.connectCtaKey
                          ? t(config.connectCtaKey)
                          : "Connect Trello"}
                    </Button>
                    <Button
                      variant="text"
                      color="secondary"
                      onClick={() => setHelpDialogProvider("trello")}
                    >
                      {"How to find my token?"}
                    </Button>
                  </Stack>
                  {trelloAuthError && (
                    <Typography variant="body2" color="error">
                      {trelloAuthError}
                    </Typography>
                  )}
                </Box>
              )}
              {config.tabValue === "github" && (
                <Button variant="contained" color="primary" onClick={handleConnectGithub}>
                  {config.connectCtaKey ? t(config.connectCtaKey) : undefined}
                </Button>
              )}
              {config.tabValue === "google" && (
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleConnectGoogle}
                  disabled={isGoogleAuthLoading}
                >
                  {isGoogleAuthLoading
                    ? t("integrationsPage.connect.redirecting")
                    : config.connectCtaKey
                      ? t(config.connectCtaKey)
                      : undefined}
                </Button>
              )}
              {config.tabValue !== "jira" &&
                config.tabValue !== "linear" &&
                config.tabValue !== "trello" &&
                config.tabValue !== "github" &&
                config.tabValue !== "google" && (
                  <Button variant="contained" color="primary" disabled>
                    {config.connectCtaKey ? t(config.connectCtaKey) : undefined}
                  </Button>
                )}
            </Box>
          ) : null}
        </Stack>
      </Paper>
    );
  };

  const handleDismissStatus = () => {
    navigate(`/integrations/${activeTab}`, { replace: true });
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

  if (!canManageIntegrations) {
    return (
      <SidebarLayout>
        <Box sx={{ p: 4 }}>
          <Alert severity="warning">
            Only workspace Owners and Admins can manage integrations. Please contact your workspace
            administrator.
          </Alert>
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
                <Tab
                  key={config.tabValue}
                  label={
                    config.isBeta ? (
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography variant="body2" sx={{ fontWeight: "inherit" }}>
                          {t(config.labelKey)}
                        </Typography>
                        <Chip
                          label="BETA"
                          size="small"
                          color="secondary"
                          sx={{ height: 18, fontSize: "0.65rem", fontWeight: "bold" }}
                        />
                      </Stack>
                    ) : (
                      t(config.labelKey)
                    )
                  }
                  value={config.tabValue}
                />
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
      <HowToConnectDialog
        open={!!helpDialogProvider}
        provider={helpDialogProvider}
        onClose={() => setHelpDialogProvider(null)}
      />
    </SidebarLayout>
  );
};

const ConnectedIntegrationDetails: React.FC<{
  integration: UserIntegrationSummary;
  onAddMore?: () => void;
}> = ({ integration, onAddMore }) => {
  const { t } = useTranslation();
  const statusColorMap: Record<UserIntegrationSummary["status"], "success" | "default" | "error"> =
    {
      CONNECTED: "success",
      DISCONNECTED: "default",
      ERROR: "error",
    };

  const dispatch = useDispatch();

  const { data: jiraProjectsData, isLoading: isJiraProjectsLoading } = useGetJiraProjectsQuery(
    undefined,
    { skip: integration.provider !== "JIRA" || integration.status !== "CONNECTED" },
  );
  const [setJiraDefaultProject, { isLoading: isSavingJiraProject }] =
    useSetJiraDefaultProjectMutation();

  const { data: linearTeamsData, isLoading: isLinearTeamsLoading } = useGetLinearTeamsQuery(
    undefined,
    { skip: integration.provider !== "LINEAR" || integration.status !== "CONNECTED" },
  );
  const [setLinearDefaultTeam, { isLoading: isSavingLinearTeam }] =
    useSetLinearDefaultTeamMutation();

  const [selectedJiraProjectId, setSelectedJiraProjectId] = React.useState(
    () =>
      ((integration.metadata as Record<string, unknown> | null)?.defaultProjectId as string) ?? "",
  );
  const [selectedLinearTeamId, setSelectedLinearTeamId] = React.useState(
    () => ((integration.metadata as Record<string, unknown> | null)?.defaultTeamId as string) ?? "",
  );

  const { data: trelloBoardsData, isLoading: isTrelloBoardsLoading } = useGetTrelloBoardsQuery(
    undefined,
    { skip: integration.provider !== "TRELLO" || integration.status !== "CONNECTED" },
  );

  const [selectedTrelloBoardId, setSelectedTrelloBoardId] = React.useState(
    () =>
      ((integration.metadata as Record<string, unknown> | null)?.defaultBoardId as string) ?? "",
  );

  const [selectedTrelloListId, setSelectedTrelloListId] = React.useState(
    () => ((integration.metadata as Record<string, unknown> | null)?.defaultListId as string) ?? "",
  );

  React.useEffect(() => {
    const meta = integration.metadata as Record<string, unknown> | null;
    setSelectedJiraProjectId((meta?.defaultProjectId as string) ?? "");
    setSelectedLinearTeamId((meta?.defaultTeamId as string) ?? "");
    setSelectedTrelloBoardId((meta?.defaultBoardId as string) ?? "");
    setSelectedTrelloListId((meta?.defaultListId as string) ?? "");
  }, [integration.metadata]);

  const { data: trelloListsData, isLoading: isTrelloListsLoading } = useGetTrelloListsQuery(
    selectedTrelloBoardId,
    {
      skip:
        integration.provider !== "TRELLO" ||
        integration.status !== "CONNECTED" ||
        !selectedTrelloBoardId,
    },
  );

  const [setTrelloDefaultBoardList, { isLoading: isSavingTrelloDefault }] =
    useSetTrelloDefaultBoardListMutation();

  // Sync local state when the integration metadata refreshes from the network (e.g. on page load)
  React.useEffect(() => {
    const meta = integration.metadata as Record<string, unknown> | null;
    console.log(`[Integrations] Syncing from metadata for ${integration.provider}:`, meta);
    const projectId = (meta?.defaultProjectId as string) ?? "";
    const teamId = (meta?.defaultTeamId as string) ?? "";
    const boardId = (meta?.defaultBoardId as string) ?? "";
    const listId = (meta?.defaultListId as string) ?? "";
    setSelectedJiraProjectId(projectId);
    setSelectedLinearTeamId(teamId);
    setSelectedTrelloBoardId(boardId);
    setSelectedTrelloListId(listId);
  }, [integration.metadata, integration.provider]);

  const {
    data: reposData,
    isLoading: isReposLoading,
    isFetching: isReposFetching,
    error: reposError,
    refetch,
  } = useGetGithubRepositoriesQuery(undefined, {
    skip: integration.provider !== "GITHUB" || integration.status !== "CONNECTED",
  });

  const {
    data: jiraSummaryResponse,
    isLoading: isJiraSummaryLoading,
    isFetching: isJiraSummaryFetching,
    refetch: refetchJiraSummary,
  } = useGetJiraSummaryQuery(undefined, {
    skip: integration.provider !== "JIRA" || integration.status !== "CONNECTED",
  });

  const {
    data: linearSummaryResponse,
    isLoading: isLinearSummaryLoading,
    isFetching: isLinearSummaryFetching,
    refetch: refetchLinearSummary,
  } = useGetLinearSummaryQuery(undefined, {
    skip: integration.provider !== "LINEAR" || integration.status !== "CONNECTED",
  });

  const {
    data: trelloSummaryResponse,
    isLoading: isTrelloSummaryLoading,
    isFetching: isTrelloSummaryFetching,
    refetch: refetchTrelloSummary,
  } = useGetTrelloSummaryQuery(undefined, {
    skip: integration.provider !== "TRELLO" || integration.status !== "CONNECTED",
  });

  // Client-side safety net: if repos take >12s to load, show error + retry
  const [reposTimedOut, setReposTimedOut] = React.useState(false);

  useEffect(() => {
    if (integration.provider !== "GITHUB" || integration.status !== "CONNECTED") return;
    if (!isReposLoading && !isReposFetching) {
      setReposTimedOut(false);
      return;
    }
    // Start a 12-second timeout when loading begins
    setReposTimedOut(false);
    const timer = setTimeout(() => setReposTimedOut(true), 20_000);
    return () => clearTimeout(timer);
  }, [isReposLoading, isReposFetching, integration.provider, integration.status]);

  useEffect(() => {
    if (reposError) {
      dispatch(
        setToastMessage({
          severity: "error",
          message: "Failed to load connected repositories from GitHub.",
        }),
      );
    }
  }, [reposError, dispatch]);

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

      {integration.provider === "JIRA" && integration.status === "CONNECTED" && (
        <Box sx={{ mt: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
              Jira Workspace Overview
            </Typography>
            <IconButton
              size="small"
              onClick={() => refetchJiraSummary()}
              disabled={isJiraSummaryFetching || isJiraSummaryLoading}
            >
              <SyncIcon fontSize="small" sx={{ color: "text.secondary" }} />
            </IconButton>
          </Stack>

          {isJiraSummaryLoading || isJiraSummaryFetching ? (
            <CircularProgress size={20} />
          ) : jiraSummaryResponse?.data ? (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Total Projects:</strong> {jiraSummaryResponse.data.totalProjects ?? "N/A"}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Assigned Issues:</strong> {jiraSummaryResponse.data.totalIssues ?? "N/A"}
                </Typography>

                {jiraSummaryResponse.data.latestBoards?.length > 0 && (
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      <strong>Agile Boards:</strong>
                    </Typography>
                    <Stack direction="row" flexWrap="wrap" gap={1}>
                      {jiraSummaryResponse.data.latestBoards.map((board) => (
                        <Chip key={board} label={board} size="small" variant="outlined" />
                      ))}
                    </Stack>
                  </Box>
                )}
              </Paper>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Unable to load Jira summary statistics.
            </Typography>
          )}
        </Box>
      )}

      {integration.provider === "JIRA" && integration.status === "CONNECTED" && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Default Destination Project
          </Typography>
          {isJiraProjectsLoading ? (
            <CircularProgress size={20} />
          ) : (
            <FormControl size="small" sx={{ minWidth: 280 }}>
              <InputLabel>Select Default Project</InputLabel>
              <Select
                label="Select Default Project"
                value={selectedJiraProjectId}
                disabled={isSavingJiraProject}
                onChange={async (e) => {
                  const projectId = e.target.value as string;
                  setSelectedJiraProjectId(projectId);
                  try {
                    await setJiraDefaultProject({ projectId }).unwrap();
                    dispatch(integrationApi.util.invalidateTags(["Integration"]));
                    dispatch(
                      setToastMessage({
                        severity: "success",
                        message: "Default Jira project saved",
                      }),
                    );
                  } catch {
                    dispatch(
                      setToastMessage({
                        severity: "error",
                        message: "Failed to save default project",
                      }),
                    );
                  }
                }}
              >
                {(jiraProjectsData?.data ?? []).map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    [{p.key}] {p.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>
      )}

      {integration.provider === "LINEAR" && integration.status === "CONNECTED" && (
        <Box sx={{ mt: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
              Linear Workspace Overview
            </Typography>
            <IconButton
              size="small"
              onClick={() => refetchLinearSummary()}
              disabled={isLinearSummaryFetching || isLinearSummaryLoading}
            >
              <SyncIcon fontSize="small" sx={{ color: "text.secondary" }} />
            </IconButton>
          </Stack>

          {isLinearSummaryLoading || isLinearSummaryFetching ? (
            <CircularProgress size={20} />
          ) : linearSummaryResponse?.data ? (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Total Projects:</strong>{" "}
                  {linearSummaryResponse.data.totalProjects ?? "N/A"}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Assigned Issues:</strong>{" "}
                  {linearSummaryResponse.data.totalIssues ?? "N/A"}
                </Typography>

                {linearSummaryResponse.data.latestTeams?.length > 0 && (
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      <strong>Active Teams:</strong>
                    </Typography>
                    <Stack direction="row" flexWrap="wrap" gap={1}>
                      {linearSummaryResponse.data.latestTeams.map((team: string) => (
                        <Chip key={team} label={team} size="small" variant="outlined" />
                      ))}
                    </Stack>
                  </Box>
                )}
              </Paper>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Unable to load Linear summary statistics.
            </Typography>
          )}
        </Box>
      )}

      {integration.provider === "LINEAR" && integration.status === "CONNECTED" && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Default Destination Team
          </Typography>
          {isLinearTeamsLoading ? (
            <CircularProgress size={20} />
          ) : (
            <FormControl size="small" sx={{ minWidth: 280 }}>
              <InputLabel>Select Default Team</InputLabel>
              <Select
                label="Select Default Team"
                value={selectedLinearTeamId}
                disabled={isSavingLinearTeam}
                onChange={async (e) => {
                  const teamId = e.target.value as string;
                  setSelectedLinearTeamId(teamId);
                  try {
                    await setLinearDefaultTeam({ teamId }).unwrap();
                    dispatch(integrationApi.util.invalidateTags(["Integration"]));
                    dispatch(
                      setToastMessage({
                        severity: "success",
                        message: "Default Linear team saved",
                      }),
                    );
                  } catch {
                    dispatch(
                      setToastMessage({
                        severity: "error",
                        message: "Failed to save default team",
                      }),
                    );
                  }
                }}
              >
                {(linearTeamsData?.data ?? []).map((team) => (
                  <MenuItem key={team.id} value={team.id}>
                    {team.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>
      )}

      {integration.provider === "TRELLO" && integration.status === "CONNECTED" && (
        <Box sx={{ mt: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
              Trello Connection
            </Typography>
            <IconButton
              size="small"
              onClick={() => refetchTrelloSummary()}
              disabled={isTrelloSummaryFetching || isTrelloSummaryLoading}
            >
              <SyncIcon fontSize="small" sx={{ color: "text.secondary" }} />
            </IconButton>
          </Stack>

          {isTrelloSummaryLoading || isTrelloSummaryFetching ? (
            <CircularProgress size={20} />
          ) : trelloSummaryResponse?.data ? (
            <Stack spacing={2} sx={{ mt: 1, mb: 2 }}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Total Boards:</strong> {trelloSummaryResponse.data.totalBoards ?? "N/A"}
                </Typography>
                {trelloSummaryResponse.data.latestBoards?.length > 0 && (
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      <strong>Active Boards:</strong>
                    </Typography>
                    <Stack direction="row" flexWrap="wrap" gap={1}>
                      {trelloSummaryResponse.data.latestBoards.map((board: string) => (
                        <Chip key={board} label={board} size="small" variant="outlined" />
                      ))}
                    </Stack>
                  </Box>
                )}
              </Paper>
            </Stack>
          ) : null}

          <Typography variant="subtitle2" sx={{ mb: 1, mt: 2 }}>
            Default Destination Board & List
          </Typography>
          <Stack spacing={2}>
            {isTrelloBoardsLoading ? (
              <CircularProgress size={20} />
            ) : (
              <FormControl size="small" sx={{ minWidth: 280 }}>
                <InputLabel>Select Default Board</InputLabel>
                <Select
                  label="Select Default Board"
                  value={selectedTrelloBoardId}
                  disabled={isSavingTrelloDefault}
                  onChange={async (e) => {
                    const boardId = e.target.value as string;
                    setSelectedTrelloBoardId(boardId);
                    setSelectedTrelloListId(""); // Reset list
                    try {
                      await setTrelloDefaultBoardList({ boardId, listId: "" }).unwrap();
                      dispatch(integrationApi.util.invalidateTags(["Integration"]));
                    } catch {
                      dispatch(
                        setToastMessage({
                          severity: "error",
                          message: "Failed to update default board",
                        }),
                      );
                    }
                  }}
                >
                  {(trelloBoardsData?.data ?? []).map((board: { id: string; name: string }) => (
                    <MenuItem key={board.id} value={board.id}>
                      {board.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {selectedTrelloBoardId &&
              (isTrelloListsLoading ? (
                <CircularProgress size={20} />
              ) : (
                <FormControl size="small" sx={{ minWidth: 280 }}>
                  <InputLabel>Select Default List</InputLabel>
                  <Select
                    label="Select Default List"
                    value={selectedTrelloListId}
                    disabled={isSavingTrelloDefault}
                    onChange={async (e) => {
                      const listId = e.target.value as string;
                      setSelectedTrelloListId(listId);
                      try {
                        await setTrelloDefaultBoardList({
                          boardId: selectedTrelloBoardId,
                          listId,
                        }).unwrap();
                        dispatch(integrationApi.util.invalidateTags(["Integration"]));
                        dispatch(
                          setToastMessage({
                            severity: "success",
                            message: "Default Trello List saved",
                          }),
                        );
                      } catch {
                        dispatch(
                          setToastMessage({
                            severity: "error",
                            message: "Failed to save default list",
                          }),
                        );
                      }
                    }}
                  >
                    {(trelloListsData?.data ?? []).map((list: { id: string; name: string }) => (
                      <MenuItem key={list.id} value={list.id}>
                        {list.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ))}
          </Stack>
        </Box>
      )}

      {integration.provider !== "GITHUB" && (
        <Typography variant="body2" color="text.secondary">
          {t("integrationsPage.connectedDetails.refreshToken", {
            status: integration.hasRefreshToken
              ? t("integrationsPage.connectedDetails.refreshAvailable")
              : t("integrationsPage.connectedDetails.refreshUnavailable"),
          })}
        </Typography>
      )}

      {integration.provider === "GITHUB" && integration.status === "CONNECTED" && (
        <Box sx={{ mt: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
              Connected Repositories
            </Typography>
            {onAddMore && (
              <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={onAddMore}>
                Add Organization
              </Button>
            )}
            <IconButton
              size="small"
              onClick={() => {
                setReposTimedOut(false);
                refetch();
              }}
              disabled={isReposFetching || isReposLoading}
            >
              <SyncIcon fontSize="small" sx={{ color: "text.secondary" }} />
            </IconButton>
          </Stack>

          {reposTimedOut ? (
            <Alert
              severity="warning"
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    setReposTimedOut(false);
                    refetch();
                  }}
                >
                  Retry
                </Button>
              }
            >
              GitHub is taking too long to respond. One of your connected organizations may have
              revoked access. Try refreshing or reconnecting via <strong>Add Organization</strong>.
            </Alert>
          ) : isReposLoading || isReposFetching ? (
            <CircularProgress size={20} />
          ) : reposData?.installations && reposData.installations.length > 0 ? (
            <Stack spacing={2}>
              {reposData.installations.map((installation) => (
                <Paper key={installation.installationId} variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
                    {installation.orgName}
                  </Typography>
                  <List dense disablePadding>
                    {installation.repositories.map((repo: GithubRepository) => (
                      <ListItem key={repo.id} disableGutters>
                        <Typography variant="body2">
                          <a
                            href={repo.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ textDecoration: "none", color: "inherit" }}
                          >
                            {repo.full_name}
                          </a>
                        </Typography>
                        {repo.private && (
                          <Chip
                            label="Private"
                            size="small"
                            variant="outlined"
                            sx={{ ml: 1, height: 20, fontSize: "0.65rem" }}
                          />
                        )}
                      </ListItem>
                    ))}
                    {installation.repositories.length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        No repositories granted.
                      </Typography>
                    )}
                  </List>
                </Paper>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No repositories found or access not granted.
            </Typography>
          )}
        </Box>
      )}
    </Stack>
  );
};

export default Integrations;
