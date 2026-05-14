import React, { useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  useTheme,
  Alert,
} from "@mui/material";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { useGetDashboardAnalyticsQuery } from "../store/apis/analyticsApi";
import {
  VideocamOutlined,
  ScheduleOutlined,
  TaskAltOutlined,
  PeopleOutline,
} from "@mui/icons-material";
import SidebarLayout from "../components/layout/SidebarLayout";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];
const SENTIMENT_COLORS = {
  POSITIVE: "#00C49F",
  NEUTRAL: "#FFBB28",
  NEGATIVE: "#FF8042",
  UNKNOWN: "#ccc",
};

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
}

const MetricCard = ({ title, value, icon, subtitle }: MetricCardProps) => {
  const theme = useTheme();
  return (
    <Paper sx={{ p: 3, height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
        <Box
          sx={{
            p: 1,
            borderRadius: 2,
            bgcolor: `${theme.palette.primary.main}15`,
            color: theme.palette.primary.main,
            mr: 2,
            display: "flex",
          }}
        >
          {icon}
        </Box>
        <Typography variant="h6" color="text.secondary" sx={{ fontSize: "0.9rem" }}>
          {title}
        </Typography>
      </Box>
      <Typography variant="h3" sx={{ fontWeight: "bold", mb: 1 }}>
        {value}
      </Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      )}
    </Paper>
  );
};

export default function Analytics() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const { data, isLoading, error } = useGetDashboardAnalyticsQuery(period);
  const theme = useTheme();

  return (
    <SidebarLayout>
      <Box sx={{ flexGrow: 1, height: "100vh", display: "flex", flexDirection: "column" }}>
        <Box sx={{ p: 4, flexGrow: 1, overflowY: "auto", bgcolor: "background.default" }}>
          <Box
            sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4 }}
          >
            <Typography variant="h4" sx={{ fontWeight: "bold" }}>
              Meeting Health
            </Typography>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Time Period</InputLabel>
              <Select
                value={period}
                label="Time Period"
                onChange={(e) => setPeriod(e.target.value as "7d" | "30d" | "90d" | "all")}
              >
                <MenuItem value="7d">Last 7 Days</MenuItem>
                <MenuItem value="30d">Last 30 Days</MenuItem>
                <MenuItem value="90d">Last 90 Days</MenuItem>
                <MenuItem value="all">All Time</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 10 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error">Failed to load analytics data.</Alert>
          ) : data ? (
            <>
              {/* KPI Cards */}
              <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={3}>
                  <MetricCard
                    title="Total Meetings"
                    value={data.meetings?.total || 0}
                    icon={<VideocamOutlined />}
                    subtitle={`${data.meetings?.totalHours?.toFixed(1) || 0} recorded hours`}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <MetricCard
                    title="Avg Duration"
                    value={`${Math.round(data.meetings?.avgDurationMinutes || 0)}m`}
                    icon={<ScheduleOutlined />}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <MetricCard
                    title="Task Completion"
                    value={`${Math.round(data.tasks?.completionRate || 0)}%`}
                    icon={<TaskAltOutlined />}
                    subtitle={`${data.tasks?.totalGenerated || 0} total tasks`}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <MetricCard
                    title="Avg Participants"
                    value={data.meetings?.avgParticipants.toFixed(1) || 0}
                    icon={<PeopleOutline />}
                  />
                </Grid>
              </Grid>

              {/* Charts Row 1 */}
              <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} md={8}>
                  <Paper sx={{ p: 3, height: 400 }}>
                    <Typography variant="h6" sx={{ mb: 3 }}>
                      Meeting Volume
                    </Typography>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.meetings?.byWeek || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="week" />
                        <YAxis />
                        <Tooltip />
                        <Area
                          type="monotone"
                          dataKey="count"
                          stroke={theme.palette.primary.main}
                          fill={`${theme.palette.primary.main}40`}
                          name="Meetings"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Paper sx={{ p: 3, height: 400 }}>
                    <Typography variant="h6" sx={{ mb: 3 }}>
                      Task Status
                    </Typography>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.tasks?.byStatus || []}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="count"
                          nameKey="status"
                        >
                          {data.tasks?.byStatus?.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </Paper>
                </Grid>
              </Grid>

              {/* Charts Row 2 */}
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 3, height: 400 }}>
                    <Typography variant="h6" sx={{ mb: 3 }}>
                      Sentiment Trend
                    </Typography>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.sentiment?.trend || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="week" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar
                          dataKey="positive"
                          stackId="a"
                          fill={SENTIMENT_COLORS.POSITIVE}
                          name="Positive"
                        />
                        <Bar
                          dataKey="neutral"
                          stackId="a"
                          fill={SENTIMENT_COLORS.NEUTRAL}
                          name="Neutral"
                        />
                        <Bar
                          dataKey="negative"
                          stackId="a"
                          fill={SENTIMENT_COLORS.NEGATIVE}
                          name="Negative"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 3, height: 400 }}>
                    <Typography variant="h6" sx={{ mb: 3 }}>
                      Task Delivery Trend
                    </Typography>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.tasks?.completionTrend || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="week" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="created"
                          stroke="#8884d8"
                          name="Created"
                          strokeWidth={2}
                        />
                        <Line
                          type="monotone"
                          dataKey="completed"
                          stroke="#82ca9d"
                          name="Completed"
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </Paper>
                </Grid>
              </Grid>
            </>
          ) : null}
        </Box>
      </Box>
    </SidebarLayout>
  );
}
