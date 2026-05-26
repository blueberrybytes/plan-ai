import React, { useState, useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Breadcrumbs,
  Link as MuiLink,
  LinearProgress,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import SyncIcon from "@mui/icons-material/Sync";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { useParams, useLocation, NavLink } from "react-router-dom";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useGetUsageMetricsQuery } from "../store/apis/aiUsageApi";
import { selectUserDb } from "../store/slices/auth/authSelector";
import { useSelector } from "react-redux";
import { selectActiveWorkspaceId } from "../store/slices/app/appSelector";
import {
  useGetMyWorkspacesQuery,
  useGetWorkspaceMembersQuery,
} from "../store/apis/workspaceApi";
import { useGetSubscriptionQuery, useGetUsageLimitsQuery } from "../store/apis/billingApi";

export const AiUsageContent: React.FC<{ hideBreadcrumbs?: boolean }> = ({
  hideBreadcrumbs = false,
}) => {
  const { t } = useTranslation();
  const [tempFilters, setTempFilters] = useState({ feature: "", provider: "", model: "" });
  const [appliedFilters, setAppliedFilters] = useState({ feature: "", provider: "", model: "" });
  const userDb = useSelector(selectUserDb);
  const activeWorkspaceId = useSelector(selectActiveWorkspaceId);
  // `isPlanAiAdmin` = global Plan AI internal admin (support / debugging
  // across any workspace). Distinct from workspace OWNER/ADMIN which is a
  // per-workspace role.
  const isPlanAiAdmin = userDb?.role === "ADMIN";
  const { targetUserId } = useParams<{ targetUserId: string }>();
  const location = useLocation();

  // Pull the active workspace's role + subscription track so we can show
  // cost details to BYOK admins (the people whose money is at stake) while
  // hiding cost from Managed users (flat fee — cost is irrelevant noise).
  const { data: workspaces } = useGetMyWorkspacesQuery();
  const { data: subscription } = useGetSubscriptionQuery();
  const activeWorkspace = workspaces?.find((w) => w.id === activeWorkspaceId);
  const isWorkspaceAdmin =
    activeWorkspace?.role === "OWNER" || activeWorkspace?.role === "ADMIN";
  const isByokTrack = subscription?.track === "BYOK";
  const isManagedTrack = subscription?.track === "MANAGED";

  // Fetch enforced usage limits for managed plans
  const { data: usageLimits } = useGetUsageLimitsQuery(undefined, {
    skip: !activeWorkspaceId || !isManagedTrack,
    pollingInterval: 60000, // refresh every 60s
  });

  /**
   * Cost details (estimated $) are shown when:
   *  - Plan AI internal admin (always — for support purposes), OR
   *  - Workspace OWNER/ADMIN on a BYOK plan — they pay OpenRouter directly
   *    so the estimated cost is THEIR bill.
   *
   * Hidden for Managed plans (flat €29/seat covers AI cost — exposing $
   * estimates is misleading noise) and for regular MEMBERs.
   */
  const canSeeCost = isPlanAiAdmin || (isWorkspaceAdmin && isByokTrack);

  /**
   * Provider/Model detail columns are for technical debugging — gated to
   * Plan AI internal admins + BYOK workspace admins (who care about which
   * model is bleeding their OpenRouter budget).
   */
  const canSeeProviderModel = isPlanAiAdmin || (isWorkspaceAdmin && isByokTrack);

  /**
   * Input/Output token split is a low-level debugging stat — Plan AI
   * internal only. Workspace admins don't need it.
   */
  const canSeeTokenSplit = isPlanAiAdmin;

  const { data: teamData } = useGetWorkspaceMembersQuery(undefined, {
    skip: !activeWorkspaceId || !targetUserId,
  });

  const targetUserEmail = useMemo(() => {
    if (!targetUserId || !teamData?.members) return null;
    const member = teamData.members.find((m) => m.id === targetUserId);
    return member?.email || null;
  }, [targetUserId, teamData]);

  const { data, isLoading, error, isFetching, refetch } = useGetUsageMetricsQuery(
    {
      page: 1,
      limit: 100,
      feature: appliedFilters.feature || undefined,
      provider: appliedFilters.provider || undefined,
      model: appliedFilters.model || undefined,
      targetUserId,
      workspaceId: activeWorkspaceId || "",
    },
    { refetchOnFocus: true, pollingInterval: 30000, skip: !activeWorkspaceId },
  );

  const handleApply = () => setAppliedFilters(tempFilters);
  const handleClear = () => {
    setTempFilters({ feature: "", provider: "", model: "" });
    setAppliedFilters({ feature: "", provider: "", model: "" });
  };


  // Column count for empty-row colSpan
  const getColumnCount = () => {
    let count = 4; // date, feature, total, usage units
    if (canSeeProviderModel) count += 2; // provider, model
    if (canSeeTokenSplit) count += 2; // input, output
    if (canSeeCost) count += 1; // est. cost
    return count;
  };

  return (
    <Box
      sx={
        hideBreadcrumbs
          ? { width: "100%" }
          : { p: 4, margin: "0 auto", width: "100%" }
      }
    >
      {!hideBreadcrumbs && (
        <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
          <MuiLink component={NavLink} underline="hover" color="inherit" to="/home">
            Home
          </MuiLink>
          <MuiLink
            component={NavLink}
            underline="hover"
            color="inherit"
            to={location.pathname.startsWith("/admin") ? "/admin" : "/team"}
          >
            {location.pathname.startsWith("/admin") ? "Admin" : "Workspace Team"}
          </MuiLink>
          {targetUserId && location.pathname.startsWith("/admin") && (
            <MuiLink component={NavLink} underline="hover" color="inherit" to="/admin/users">
              Users
            </MuiLink>
          )}
          <Typography color="text.primary">{targetUserId ? "User Usage" : "Usage"}</Typography>
        </Breadcrumbs>
      )}

      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
        <Typography variant="h4" sx={{ mb: 0 }}>
          {targetUserId ? (
            <>
              {t("aiUsage.headingUser", "User AI Usage")}
              {targetUserEmail && (
                <Typography component="span" variant="h5" color="text.secondary" sx={{ ml: 2 }}>
                  ({targetUserEmail})
                </Typography>
              )}
            </>
          ) : (
            t("aiUsage.heading", "AI Usage Tracking")
          )}
        </Typography>
        <Tooltip title={t("aiUsage.refresh", "Refresh metrics")}>
          <Box component="span">
            <IconButton onClick={() => refetch()} disabled={isLoading}>
              <SyncIcon
                sx={{
                  animation: isFetching && !isLoading ? "spin 1s linear infinite" : "none",
                  "@keyframes spin": {
                    "0%": { transform: "rotate(0deg)" },
                    "100%": { transform: "rotate(360deg)" },
                  },
                }}
              />
            </IconButton>
          </Box>
        </Tooltip>
        {isByokTrack && (
          <Chip label="BYOK" size="small" color="secondary" variant="outlined" />
        )}
        {isManagedTrack && (
          <Chip label="Managed" size="small" color="primary" variant="outlined" />
        )}
      </Box>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        {isByokTrack
          ? "Monitor your AI spending and token consumption. Costs are charged to your OpenRouter account."
          : isManagedTrack
            ? "Monitor your AI usage against your plan allowance. All AI costs are included in your subscription."
            : t(
                "aiUsage.description",
                "Monitor your token consumption and generated content volume across platform features.",
              )}
      </Typography>

      {isLoading && <CircularProgress />}
      {error && (
        <Alert severity="error">{t("aiUsage.errorLoading", "Failed to load metrics.")}</Alert>
      )}

      {data && (
        <>
          {/* ── Summary Cards ── */}
          <Box sx={{ display: "flex", gap: 3, mb: 4, flexWrap: "wrap" }}>
            {/* Total Tokens — always visible */}
            <Paper sx={{ p: 3, flex: "1 1 200px", minWidth: 200 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {t("aiUsage.totalTokens", "Total Tokens")}
              </Typography>
              <Typography variant="h3" sx={{ mt: 1, color: "primary.main" }}>
                {data.totalTokens.toLocaleString()}
              </Typography>
            </Paper>

            {/* Estimated Cost — BYOK admins + Plan AI admins */}
            {canSeeCost && (
              <Paper sx={{ p: 3, flex: "1 1 200px", minWidth: 200 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Estimated Cost
                </Typography>
                <Typography variant="h3" sx={{ mt: 1, color: "success.main" }}>
                  ${data.totalEstimatedCost?.toFixed(4) || "0.0000"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Based on OpenRouter model pricing
                </Typography>
              </Paper>
            )}

            {/* Enforced Usage Limits — Managed plans */}
            {isManagedTrack && isWorkspaceAdmin && usageLimits && (
              <Paper sx={{ p: 3, flex: "1 1 100%", minWidth: 280 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                  Plan Limits (this month)
                </Typography>

                {/* LLM Tokens */}
                {usageLimits.llm && (
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                      <Typography variant="body2">AI Tokens</Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, color: usageLimits.llm.percentage >= 90 ? "error.main" : "text.primary" }}
                      >
                        {usageLimits.llm.used.toLocaleString()} / {usageLimits.llm.allowed.toLocaleString()} ({usageLimits.llm.percentage}%)
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(usageLimits.llm.percentage, 100)}
                      color={usageLimits.llm.percentage >= 90 ? "error" : "primary"}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                        "& .MuiLinearProgress-bar": { borderRadius: 4 },
                      }}
                    />
                  </Box>
                )}

                {/* Recording Hours */}
                {usageLimits.recording && (
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                      <Typography variant="body2">Recording Hours</Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, color: usageLimits.recording.percentage >= 90 ? "error.main" : "text.primary" }}
                      >
                        {(usageLimits.recording.used / 60).toFixed(1)} / {(usageLimits.recording.allowed / 60).toFixed(0)} hrs ({usageLimits.recording.percentage}%)
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(usageLimits.recording.percentage, 100)}
                      color={usageLimits.recording.percentage >= 90 ? "error" : "secondary"}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        bgcolor: (theme) => alpha(theme.palette.secondary.main, 0.1),
                        "& .MuiLinearProgress-bar": { borderRadius: 4 },
                      }}
                    />
                  </Box>
                )}

                {/* Generations */}
                {usageLimits.generations && (
                  <Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                      <Typography variant="body2">Generations (Docs / Slides / Diagrams)</Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, color: usageLimits.generations.percentage >= 90 ? "error.main" : "text.primary" }}
                      >
                        {usageLimits.generations.used} / {usageLimits.generations.allowed} ({usageLimits.generations.percentage}%)
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(usageLimits.generations.percentage, 100)}
                      color={usageLimits.generations.percentage >= 90 ? "error" : "success"}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        bgcolor: (theme) => alpha(theme.palette.success.main, 0.1),
                        "& .MuiLinearProgress-bar": { borderRadius: 4 },
                      }}
                    />
                  </Box>
                )}
              </Paper>
            )}

            {/* Usage Units — always visible */}
            <Paper sx={{ p: 3, flex: "1 1 200px", minWidth: 200 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {isPlanAiAdmin ? "Blueberry Tokens" : "Usage Units"}
              </Typography>
              <Typography variant="h3" sx={{ mt: 1, color: "secondary.main" }}>
                {data.totalBlueberryTokens?.toLocaleString() || "0"}
              </Typography>
            </Paper>

            {/* Input/Output split — Plan AI internal admins only */}
            {canSeeTokenSplit && (
              <>
                <Paper sx={{ p: 3, flex: "1 1 200px", minWidth: 200 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {t("aiUsage.inputTokens", "Input (Prompt)")}
                  </Typography>
                  <Typography variant="h4" sx={{ mt: 1 }}>
                    {data.totalInputTokens.toLocaleString()}
                  </Typography>
                </Paper>
                <Paper sx={{ p: 3, flex: "1 1 200px", minWidth: 200 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {t("aiUsage.outputTokens", "Output (Generation)")}
                  </Typography>
                  <Typography variant="h4" sx={{ mt: 1 }}>
                    {data.totalOutputTokens.toLocaleString()}
                  </Typography>
                </Paper>
              </>
            )}
          </Box>

          {/* ── Usage by Feature ── */}
          <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
            {t("aiUsage.usageByFeature", "Usage by Feature")}
          </Typography>
          <Box sx={{ display: "flex", gap: 2, mb: 4, flexWrap: "wrap" }}>
            {data.usageByFeature.map((stat) => (
              <Chip
                key={stat.feature}
                label={`${t(`aiUsage.features.${stat.feature}`, stat.feature)}: ${stat.totalTokens.toLocaleString()}`}
                color="primary"
                variant="outlined"
                sx={{ px: 1, py: 2, fontSize: "1rem" }}
              />
            ))}
          </Box>

          {/* ── Execution Logs ── */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mt: 4,
              mb: 2,
              flexWrap: "wrap",
              gap: 2,
            }}
          >
            <Typography variant="h5" sx={{ mb: 0 }}>
              {t("aiUsage.logSection", "Execution Logs")}
            </Typography>

            <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>{t("aiUsage.table.feature", "Feature")}</InputLabel>
                <Select
                  value={tempFilters.feature}
                  label={t("aiUsage.table.feature", "Feature")}
                  onChange={(e) => setTempFilters((prev) => ({ ...prev, feature: e.target.value }))}
                >
                  <MenuItem value="">
                    <em>All</em>
                  </MenuItem>
                  <MenuItem value="CHAT">{t("aiUsage.features.CHAT", "CHAT")}</MenuItem>
                  <MenuItem value="DOC">{t("aiUsage.features.DOC", "DOC")}</MenuItem>
                  <MenuItem value="SLIDES">{t("aiUsage.features.SLIDES", "SLIDES")}</MenuItem>
                  <MenuItem value="DIAGRAM">{t("aiUsage.features.DIAGRAM", "DIAGRAM")}</MenuItem>
                  <MenuItem value="TRANSCRIPT">
                    {t("aiUsage.features.TRANSCRIPT", "TRANSCRIPT")}
                  </MenuItem>
                </Select>
              </FormControl>

              {canSeeProviderModel && (
                <>
                  <TextField
                    size="small"
                    label={t("aiUsage.table.provider", "Provider")}
                    value={tempFilters.provider}
                    onChange={(e) =>
                      setTempFilters((prev) => ({ ...prev, provider: e.target.value }))
                    }
                    placeholder="e.g. GOOGLE"
                    sx={{ minWidth: 150 }}
                  />

                  <TextField
                    size="small"
                    label={t("aiUsage.table.model", "Model")}
                    value={tempFilters.model}
                    onChange={(e) => setTempFilters((prev) => ({ ...prev, model: e.target.value }))}
                    placeholder="e.g. gemini-2.5"
                    sx={{ minWidth: 150 }}
                  />
                </>
              )}

              <Button variant="contained" onClick={handleApply} disabled={isFetching || isLoading}>
                Apply
              </Button>
              <Button
                variant="outlined"
                color="secondary"
                onClick={handleClear}
                disabled={isFetching || isLoading}
              >
                Clear
              </Button>
            </Box>
          </Box>

          <TableContainer component={Paper} elevation={0} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t("aiUsage.table.date", "Date")}</TableCell>
                  <TableCell>{t("aiUsage.table.feature", "Feature")}</TableCell>
                  {canSeeProviderModel && (
                    <>
                      <TableCell>{t("aiUsage.table.provider", "Provider")}</TableCell>
                      <TableCell>{t("aiUsage.table.model", "Model")}</TableCell>
                    </>
                  )}
                  {canSeeTokenSplit && (
                    <>
                      <TableCell align="right">{t("aiUsage.table.input", "Input")}</TableCell>
                      <TableCell align="right">{t("aiUsage.table.output", "Output")}</TableCell>
                    </>
                  )}
                  <TableCell align="right">{t("aiUsage.table.total", "Total")}</TableCell>
                  {canSeeCost && (
                    <TableCell align="right">{t("aiUsage.table.cost", "Est. Cost")}</TableCell>
                  )}
                  <TableCell align="right">
                    {isPlanAiAdmin ? "Blueberry Tokens" : "Usage Units"}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{format(new Date(log.createdAt), "MMM d, yyyy HH:mm:ss")}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={t(`aiUsage.features.${log.feature}`, log.feature)}
                      />
                    </TableCell>
                    {canSeeProviderModel && (
                      <>
                        <TableCell>{log.provider}</TableCell>
                        <TableCell>{log.model}</TableCell>
                      </>
                    )}
                    {canSeeTokenSplit && (
                      <>
                        <TableCell align="right">{log.inputTokens.toLocaleString()}</TableCell>
                        <TableCell align="right">{log.outputTokens.toLocaleString()}</TableCell>
                      </>
                    )}
                    <TableCell align="right">
                      <strong>{log.totalTokens.toLocaleString()}</strong>
                    </TableCell>
                    {canSeeCost && (
                      <TableCell align="right" sx={{ color: "success.main", fontWeight: "bold" }}>
                        ${log.estimatedCost?.toFixed(6) || "0.000000"}
                      </TableCell>
                    )}
                    <TableCell align="right" sx={{ color: "secondary.main", fontWeight: "bold" }}>
                      {log.blueberryTokens?.toLocaleString() || "0"}
                    </TableCell>
                  </TableRow>
                ))}
                {data.logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={getColumnCount()} align="center">
                      {t("aiUsage.emptyLogs", "No AI operations logged yet.")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* ── Track-specific Footer Notes ── */}
          <Box sx={{ mt: 3 }}>
            {isByokTrack && (
              <Alert
                severity="info"
                icon={false}
                sx={{ borderRadius: 2 }}
                action={
                  <Button
                    size="small"
                    color="inherit"
                    endIcon={<OpenInNewIcon fontSize="small" />}
                    href="https://openrouter.ai/activity"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    OpenRouter Dashboard
                  </Button>
                }
              >
                Estimates are based on OpenRouter model pricing at time of use. Your OpenRouter
                invoice is the source of truth for actual charges.
              </Alert>
            )}
            {isManagedTrack && (
              <Alert severity="success" icon={false} sx={{ borderRadius: 2 }}>
                All AI costs are included in your Managed plan. No surprise bills — your usage is
                covered by your subscription.
              </Alert>
            )}
            {!isByokTrack && !isManagedTrack && !isPlanAiAdmin && (
              <Alert severity="info" icon={false} sx={{ borderRadius: 2 }}>
                Configure your API keys in Workspace Settings to start using AI features, or upgrade
                to a Managed plan for hassle-free usage.
              </Alert>
            )}
          </Box>
        </>
      )}
    </Box>
  );
};

const AiUsage: React.FC = () => {
  return (
    <SidebarLayout>
      <AiUsageContent />
    </SidebarLayout>
  );
};

export default AiUsage;
