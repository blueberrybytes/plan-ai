import React, { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  Link as MuiLink,
  MenuItem,
  Paper,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/DownloadOutlined";
import { NavLink } from "react-router-dom";
import SidebarLayout from "../../components/layout/SidebarLayout";
import { useGetFeatureUsageQuery } from "../../store/apis/adminApi";
import { downloadTextFile } from "../../utils/downloadFile";
import {
  buildFeatureTable,
  clientsSummary,
  featureUsageCsv,
  type FeatureUsageRow,
} from "./featureUsageTable";

const PERIODS = [7, 30, 90] as const;
const COLUMNS = 7;

/** One thin bar per day, as plain boxes. The tallest day fills the strip. */
const DayStrip: React.FC<{ series: number[]; labels: string[] }> = ({ series, labels }) => {
  const max = Math.max(...series, 0);
  if (max === 0) return null;
  return (
    <Box
      sx={{ display: "flex", alignItems: "flex-end", gap: "1px", height: 24, width: 150 }}
      aria-hidden
    >
      {series.map((value, index) => (
        <Box
          key={labels[index] ?? index}
          title={`${labels[index] ?? ""}: ${value}`}
          sx={{
            flex: 1,
            minWidth: 0,
            height: value > 0 ? `${Math.max(8, (value / max) * 100)}%` : "1px",
            bgcolor: value > 0 ? "primary.main" : "divider",
          }}
        />
      ))}
    </Box>
  );
};

const FeatureRow: React.FC<{ row: FeatureUsageRow; labels: string[] }> = ({ row, labels }) => (
  <TableRow hover>
    <TableCell>
      <Typography variant="body2" fontWeight={600} sx={{ fontFamily: "monospace" }}>
        {row.feature}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {row.description}
        {row.source === "client" ? " (reported by the web app)" : ""}
      </Typography>
    </TableCell>
    <TableCell align="right">{row.total.toLocaleString("en")}</TableCell>
    <TableCell align="right">{row.users.toLocaleString("en")}</TableCell>
    <TableCell align="right">{row.workspaces.toLocaleString("en")}</TableCell>
    <TableCell>{clientsSummary(row) || "-"}</TableCell>
    <TableCell sx={{ whiteSpace: "nowrap" }}>{row.lastUsedDay ?? "Never"}</TableCell>
    <TableCell>
      <DayStrip series={row.series} labels={labels} />
    </TableCell>
  </TableRow>
);

const Total: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <Paper variant="outlined" sx={{ p: 2.5, flex: "1 1 180px" }}>
    <Typography variant="subtitle2" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="h4" fontWeight="bold">
      {value.toLocaleString("en")}
    </Typography>
  </Paper>
);

/** Which features are used and which are not, from first-party counts. */
const AdminFeatureUsage: React.FC = () => {
  const [days, setDays] = useState<number>(30);
  const [query, setQuery] = useState("");
  const [onlyUnused, setOnlyUnused] = useState(false);
  const { data: report, isLoading, isFetching, error } = useGetFeatureUsageQuery({ days });

  const table = useMemo(
    () => buildFeatureTable(report?.features ?? [], { query, onlyUnused }),
    [report, query, onlyUnused],
  );
  const unusedTotal = useMemo(
    () => (report?.features ?? []).filter((row) => row.total === 0).length,
    [report],
  );

  const downloadCsv = () => {
    if (!report) return;
    const lastDay = report.dayLabels[report.dayLabels.length - 1] ?? "";
    downloadTextFile(
      `feature-usage-${report.days}d-${lastDay}.csv`,
      featureUsageCsv(report),
      "text/csv;charset=utf-8",
    );
  };

  return (
    <SidebarLayout>
      <Box sx={{ p: 3, maxWidth: 1280, margin: "0 auto", width: "100%" }}>
        <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
          <MuiLink component={NavLink} underline="hover" color="inherit" to="/admin">
            Admin
          </MuiLink>
          <Typography color="text.primary">Feature usage</Typography>
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
            Feature usage
          </Typography>
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="feature-usage-period">Period</InputLabel>
              <Select
                labelId="feature-usage-period"
                label="Period"
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
              >
                {PERIODS.map((value) => (
                  <MenuItem key={value} value={value}>
                    Last {value} days
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={downloadCsv}
              disabled={!report}
            >
              CSV
            </Button>
          </Box>
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 820 }}>
          How many times each feature was used, by how many people and in how many workspaces. These
          are counts only: no titles, no text and nothing sent outside this server. Days are UTC.
          Counting started when this page was released, so older use is not here.
        </Typography>

        {isLoading && <CircularProgress />}
        {error && <Alert severity="error">The feature usage could not be loaded.</Alert>}

        {report && (
          <Box sx={{ opacity: isFetching ? 0.6 : 1 }}>
            <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
              <Total label="Uses" value={report.totalUses} />
              <Total label="Active users" value={report.activeUsers} />
              <Total label="Active workspaces" value={report.activeWorkspaces} />
              <Total label="Features not used" value={unusedTotal} />
            </Box>

            <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
              <TextField
                size="small"
                label="Filter by name"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                sx={{ minWidth: 260 }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={onlyUnused}
                    onChange={(event) => setOnlyUnused(event.target.checked)}
                  />
                }
                label="Only unused"
              />
            </Box>

            <TableContainer component={Paper} elevation={0} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Feature</TableCell>
                    <TableCell align="right">Uses</TableCell>
                    <TableCell align="right">Users</TableCell>
                    <TableCell align="right">Workspaces</TableCell>
                    <TableCell>Clients</TableCell>
                    <TableCell>Last used</TableCell>
                    <TableCell>Per day</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {table.used.map((row) => (
                    <FeatureRow key={row.feature} row={row} labels={report.dayLabels} />
                  ))}
                  {table.unused.length > 0 && (
                    <TableRow>
                      <TableCell colSpan={COLUMNS} sx={{ bgcolor: "action.hover" }}>
                        <Typography variant="subtitle2">
                          Not used in the last {report.days} days ({table.unused.length})
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Candidates to cut. &quot;Last used&quot; looks at all the days counted,
                          not only this period.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {table.unused.map((row) => (
                    <FeatureRow key={row.feature} row={row} labels={report.dayLabels} />
                  ))}
                  {table.used.length === 0 && table.unused.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={COLUMNS} align="center">
                        No feature matches.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Box>
    </SidebarLayout>
  );
};

export default AdminFeatureUsage;
