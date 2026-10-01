import React, { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  CircularProgress,
  Link as MuiLink,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { enUS, es } from "date-fns/locale";
import SidebarLayout from "../../components/layout/SidebarLayout";
import UsagePeriodSelect from "../../components/usage/UsagePeriodSelect";
import { useGetAdminRecentUsageQuery } from "../../store/apis/aiUsageApi";

/** Who used the platform in a period and what it cost, most recent first. */
const AdminRecentUsage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [period, setPeriod] = useState("30d");
  const { data: rows, isLoading, error } = useGetAdminRecentUsageQuery({ period });

  const dateLocale = i18n.language.startsWith("es") ? es : enUS;
  const totalCost = useMemo(
    () => (rows ?? []).reduce((sum, row) => sum + row.estimatedCost, 0),
    [rows],
  );

  return (
    <SidebarLayout>
      <Box sx={{ p: 3, maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
          <MuiLink component={NavLink} underline="hover" color="inherit" to="/admin">
            {t("sidebarLayout.nav.admin")}
          </MuiLink>
          <Typography color="text.primary">{t("adminUsage.title")}</Typography>
        </Breadcrumbs>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 2,
            mb: 1,
          }}
        >
          <Typography variant="h4" fontWeight="bold">
            {t("adminUsage.title")}
          </Typography>
          <UsagePeriodSelect value={period} onChange={setPeriod} />
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          {t("adminUsage.description")}
        </Typography>

        {isLoading && <CircularProgress />}
        {error && <Alert severity="error">{t("adminUsage.error")}</Alert>}

        {rows && (
          <>
            <Box sx={{ display: "flex", gap: 3, mb: 3, flexWrap: "wrap" }}>
              <Paper sx={{ p: 3, flex: "1 1 200px" }}>
                <Typography variant="subtitle2" color="text.secondary">
                  {t("adminUsage.totalCost")}
                </Typography>
                <Typography variant="h4" fontWeight="bold">
                  ${totalCost.toFixed(2)}
                </Typography>
              </Paper>
              <Paper sx={{ p: 3, flex: "1 1 200px" }}>
                <Typography variant="subtitle2" color="text.secondary">
                  {t("adminUsage.activeUsers")}
                </Typography>
                <Typography variant="h4" fontWeight="bold">
                  {rows.length}
                </Typography>
              </Paper>
            </Box>

            <TableContainer component={Paper} elevation={0} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t("adminUsage.columns.user")}</TableCell>
                    <TableCell>{t("adminUsage.columns.lastActivity")}</TableCell>
                    <TableCell align="right">{t("adminUsage.columns.requests")}</TableCell>
                    <TableCell align="right">{t("adminUsage.columns.tokens")}</TableCell>
                    <TableCell align="right">{t("adminUsage.columns.cost")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.userId}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={() => navigate(`/admin/users/${row.userId}/usage`)}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {row.name || "—"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {row.email}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {formatDistanceToNow(new Date(row.lastActivityAt), {
                          addSuffix: true,
                          locale: dateLocale,
                        })}
                      </TableCell>
                      <TableCell align="right">{row.requestCount.toLocaleString()}</TableCell>
                      <TableCell align="right">{row.totalTokens.toLocaleString()}</TableCell>
                      <TableCell align="right">${row.estimatedCost.toFixed(4)}</TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        {t("adminUsage.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Box>
    </SidebarLayout>
  );
};

export default AdminRecentUsage;
