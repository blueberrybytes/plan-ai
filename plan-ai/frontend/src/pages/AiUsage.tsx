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
} from "@mui/material";
import SyncIcon from "@mui/icons-material/Sync";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { useParams, useLocation, NavLink } from "react-router-dom";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useGetUsageMetricsQuery } from "../store/apis/aiUsageApi";
import { selectUserDb } from "../store/slices/auth/authSelector";
import { useSelector } from "react-redux";
import { selectActiveWorkspaceId } from "../store/slices/app/appSelector";
import { useGetWorkspaceMembersQuery } from "../store/apis/workspaceApi";

export const AiUsageContent: React.FC<{ hideBreadcrumbs?: boolean }> = ({
  hideBreadcrumbs = false,
}) => {
  const { t } = useTranslation();
  const [tempFilters, setTempFilters] = useState({ feature: "", provider: "", model: "" });
  const [appliedFilters, setAppliedFilters] = useState({ feature: "", provider: "", model: "" });
  const userDb = useSelector(selectUserDb);
  const activeWorkspaceId = useSelector(selectActiveWorkspaceId);
  const isAdmin = userDb?.role === "ADMIN";
  const { targetUserId } = useParams<{ targetUserId: string }>();
  const location = useLocation();

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
    { refetchOnFocus: true, pollingInterval: 5000, skip: !activeWorkspaceId },
  );

  const handleApply = () => setAppliedFilters(tempFilters);
  const handleClear = () => {
    setTempFilters({ feature: "", provider: "", model: "" });
    setAppliedFilters({ feature: "", provider: "", model: "" });
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
      </Box>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        {t(
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
          <Box sx={{ display: "flex", gap: 3, mb: 4, flexWrap: "wrap" }}>
            <Paper sx={{ p: 3, flex: "1 1 200px", minWidth: 200 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {t("aiUsage.totalTokens", "Total Tokens")}
              </Typography>
              <Typography variant="h3" sx={{ mt: 1, color: "primary.main" }}>
                {data.totalTokens.toLocaleString()}
              </Typography>
            </Paper>
            {isAdmin && (
              <Paper sx={{ p: 3, flex: "1 1 200px", minWidth: 200 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  {t("aiUsage.totalCost", "Total Est. Cost")}
                </Typography>
                <Typography variant="h3" sx={{ mt: 1, color: "success.main" }}>
                  ${data.totalEstimatedCost?.toFixed(6) || "0.000000"}
                </Typography>
              </Paper>
            )}
            <Paper sx={{ p: 3, flex: "1 1 200px", minWidth: 200 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {t("aiUsage.totalBlueberryTokens", "Blueberry Tokens")}
              </Typography>
              <Typography variant="h3" sx={{ mt: 1, color: "secondary.main" }}>
                {data.totalBlueberryTokens?.toLocaleString() || "0"}
              </Typography>
            </Paper>
            {isAdmin && (
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

              {isAdmin && (
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
                  {isAdmin && (
                    <>
                      <TableCell>{t("aiUsage.table.provider", "Provider")}</TableCell>
                      <TableCell>{t("aiUsage.table.model", "Model")}</TableCell>
                      <TableCell align="right">{t("aiUsage.table.input", "Input")}</TableCell>
                      <TableCell align="right">{t("aiUsage.table.output", "Output")}</TableCell>
                    </>
                  )}
                  <TableCell align="right">{t("aiUsage.table.total", "Total")}</TableCell>
                  {isAdmin && (
                    <TableCell align="right">{t("aiUsage.table.cost", "Est. Cost")}</TableCell>
                  )}
                  <TableCell align="right">
                    {t("aiUsage.table.blueberryTokens", "Blueberry Tokens")}
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
                    {isAdmin && (
                      <>
                        <TableCell>{log.provider}</TableCell>
                        <TableCell>{log.model}</TableCell>
                        <TableCell align="right">{log.inputTokens.toLocaleString()}</TableCell>
                        <TableCell align="right">{log.outputTokens.toLocaleString()}</TableCell>
                      </>
                    )}
                    <TableCell align="right">
                      <strong>{log.totalTokens.toLocaleString()}</strong>
                    </TableCell>
                    {isAdmin && (
                      <TableCell align="right" sx={{ color: "success.main", fontWeight: "bold" }}>
                        ${log.estimatedCost?.toFixed(8) || "0.00000000"}
                      </TableCell>
                    )}
                    <TableCell align="right" sx={{ color: "secondary.main", fontWeight: "bold" }}>
                      {log.blueberryTokens?.toLocaleString() || "0"}
                    </TableCell>
                  </TableRow>
                ))}
                {data.logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 9 : 8} align="center">
                      {t("aiUsage.emptyLogs", "No AI operations logged yet.")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
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
