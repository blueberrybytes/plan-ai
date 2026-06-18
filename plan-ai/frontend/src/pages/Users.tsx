/* eslint-disable @typescript-eslint/no-explicit-any */
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
  Select,
  MenuItem,
  TextField,
  InputAdornment,
  Avatar,
  CircularProgress,
  Alert,
  Snackbar,
  IconButton,
  Tooltip,
  Tab,
  Tabs,
  Button,
  Breadcrumbs,
  Link as MuiLink,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import InsightsIcon from "@mui/icons-material/Insights";
import SyncIcon from "@mui/icons-material/Sync";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNavigate, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import {
  useGetUsersQuery,
  UserDetailResponse,
  useUpdateUserRoleMutation,
  useGetOrphansQuery,
  useSyncOrphanMutation,
  UserOrphanResponse,
  useForceVerifyEmailMutation,
  useDeleteUserMutation,
} from "../store/apis/userApi";
import HowToRegIcon from "@mui/icons-material/HowToReg";

const Users: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [tabValue, setTabValue] = useState(0);
  console.log(tabValue);

  const { data: response, isLoading, isError, refetch } = useGetUsersQuery();
  const {
    data: orphansResponse,
    isLoading: isLoadingOrphans,
    refetch: refetchOrphans,
  } = useGetOrphansQuery(undefined, { skip: tabValue !== 1 });

  const [updateRole] = useUpdateUserRoleMutation();
  const [syncOrphan, { isLoading: isSyncing }] = useSyncOrphanMutation();
  const [forceVerifyEmail, { isLoading: isVerifying }] = useForceVerifyEmailMutation();
  const [deleteUser, { isLoading: isDeleting }] = useDeleteUserMutation();
  const [snackbarMessage, setSnackbarMessage] = useState("");

  const users = useMemo(() => response?.data || [], [response?.data]);
  const orphans = useMemo(() => orphansResponse?.data || [], [orphansResponse?.data]);

  const filteredUsers = useMemo(() => {
    return users.filter((u: UserDetailResponse) => {
      const s = searchTerm.toLowerCase();
      return (
        (u.name && u.name.toLowerCase().includes(s)) ||
        (u.email && u.email.toLowerCase().includes(s)) ||
        (u.role && u.role.toLowerCase().includes(s))
      );
    });
  }, [users, searchTerm]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateRole({ userId, body: { role: newRole as "ADMIN" | "CLIENT" } }).unwrap();
      setSnackbarMessage(t("users.updateSuccess"));
    } catch (e) {
      setSnackbarMessage(t("users.updateError", "Error updating role"));
    }
  };

  const handleVerifyEmail = async (userId: string) => {
    if (window.confirm("Are you sure you want to force-verify this user's email address?")) {
      try {
        await forceVerifyEmail({ userId }).unwrap();
        setSnackbarMessage("User email manually verified successfully!");
        refetch();
      } catch (e: any) {
        setSnackbarMessage(e?.data?.message || "Error verifying user email");
      }
    }
  };

  const handleSyncOrphan = async (firebaseUid: string) => {
    try {
      await syncOrphan({ firebaseUid }).unwrap();
      setSnackbarMessage("Orphan user successfully synced!");
      refetchOrphans();
      refetch();
    } catch (e: any) {
      setSnackbarMessage(e?.data?.message || "Error syncing orphan user");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (
      window.confirm(
        "Are you SURE you want to delete this user? This will delete them from PostgreSQL and Firebase and cannot be undone.",
      )
    ) {
      try {
        await deleteUser({ userId }).unwrap();
        setSnackbarMessage("User deleted successfully.");
        refetch();
      } catch (e: any) {
        setSnackbarMessage(e?.data?.message || "Error deleting user");
      }
    }
  };

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 2, md: 4 } }}>
        <Box sx={{ mb: 4 }}>
          <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
            <MuiLink component={NavLink} underline="hover" color="inherit" to="/home">
              Home
            </MuiLink>
            <MuiLink component={NavLink} underline="hover" color="inherit" to="/admin">
              Admin
            </MuiLink>
            <Typography color="text.primary">{t("users.title")}</Typography>
          </Breadcrumbs>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            {t("users.title")}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t("users.description")}
          </Typography>
        </Box>

        <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
          <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
            <Tab label="Active Users" />
            <Tab label="Orphaned Users" />
          </Tabs>
        </Box>

        {tabValue === 0 && (
          <>
            <Box sx={{ mb: 3 }}>
              <TextField
                placeholder={t("users.search")}
                variant="outlined"
                size="small"
                fullWidth
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon color="action" />
                    </InputAdornment>
                  ),
                  sx: { borderRadius: 2, bgcolor: "background.paper" },
                }}
                sx={{ maxWidth: 400 }}
              />
            </Box>

            {isLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                <CircularProgress />
              </Box>
            ) : isError ? (
              <Alert
                severity="error"
                action={
                  <Box onClick={() => refetch()} sx={{ cursor: "pointer" }}>
                    Retry
                  </Box>
                }
              >
                Failed to load users
              </Alert>
            ) : (
              <TableContainer component={Paper} sx={{ borderRadius: 2, overflow: "hidden" }}>
                <Table>
                  <TableHead sx={{ bgcolor: "background.default" }}>
                    <TableRow>
                      <TableCell>{t("users.name")}</TableCell>
                      <TableCell>{t("users.email")}</TableCell>
                      <TableCell>{t("users.role")}</TableCell>
                      <TableCell>Created</TableCell>
                      <TableCell>Last Sign In</TableCell>
                      <TableCell align="center">{t("users.actions")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredUsers.map((user: UserDetailResponse) => (
                      <TableRow key={user.id} hover>
                        <TableCell>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                            <Avatar
                              src={user.avatarUrl || undefined}
                              sx={{ width: 32, height: 32 }}
                            >
                              {user.name ? user.name[0].toUpperCase() : user.email[0].toUpperCase()}
                            </Avatar>
                            <Typography variant="body2" fontWeight={500}>
                              {user.name || "—"}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {user.email}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              px: 1.5,
                              py: 0.5,
                              borderRadius: 1,
                              display: "inline-block",
                              bgcolor:
                                user.role === "ADMIN"
                                  ? "error.main"
                                  : user.role === "PENDING"
                                    ? "warning.main"
                                    : user.role === "PREMIUM"
                                      ? "secondary.main"
                                      : "primary.main",
                              color: "#fff",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              opacity: 0.9,
                            }}
                          >
                            {user.role === "ADMIN"
                              ? t("users.admin")
                              : user.role === "PENDING"
                                ? t("users.pending", "Pending")
                                : user.role === "PREMIUM"
                                  ? t("users.premium", "Premium")
                                  : t("users.client")}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Tooltip title={user.createdAt ? new Date(user.createdAt).toLocaleString() : ""}>
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8rem" }}>
                              {user.createdAt
                                ? new Date(user.createdAt).toLocaleDateString(undefined, {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })
                                : "—"}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Tooltip title={user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : ""}>
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8rem" }}>
                              {user.lastSignInAt
                                ? new Date(user.lastSignInAt).toLocaleDateString(undefined, {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })
                                : "—"}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="center">
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 1,
                            }}
                          >
                            <Select
                              size="small"
                              value={user.role}
                              onChange={(e) => handleRoleChange(user.id, e.target.value)}
                              sx={{ minWidth: 120, fontSize: "0.875rem" }}
                            >
                              <MenuItem value="PENDING">{t("users.pending", "Pending")}</MenuItem>
                              <MenuItem value="CLIENT">{t("users.client")}</MenuItem>
                              <MenuItem value="PREMIUM">{t("users.premium", "Premium")}</MenuItem>
                              <MenuItem value="ADMIN">{t("users.admin")}</MenuItem>
                            </Select>
                            <Tooltip title="Force Verify Email">
                              <IconButton
                                size="small"
                                onClick={() => handleVerifyEmail(user.id)}
                                color="success"
                                disabled={isVerifying}
                              >
                                <HowToRegIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={t("users.viewUsage", "View AI Usage")}>
                              <IconButton
                                size="small"
                                onClick={() => navigate(`/admin/users/${user.id}/usage`)}
                                color="primary"
                              >
                                <InsightsIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete User">
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteUser(user.id)}
                                color="error"
                                disabled={isDeleting}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredUsers.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          align="center"
                          sx={{ py: 4, color: "text.secondary" }}
                        >
                          No users found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}

        {tabValue === 1 && (
          <>
            {isLoadingOrphans ? (
              <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                <CircularProgress />
              </Box>
            ) : orphans.length === 0 ? (
              <Alert severity="success">No orphaned users found! In-sync.</Alert>
            ) : (
              <TableContainer component={Paper} sx={{ borderRadius: 2, overflow: "hidden" }}>
                <Table>
                  <TableHead sx={{ bgcolor: "background.default" }}>
                    <TableRow>
                      <TableCell>{t("users.name", "Name")}</TableCell>
                      <TableCell>{t("users.email", "Email")}</TableCell>
                      <TableCell>UID</TableCell>
                      <TableCell align="center">{t("users.actions", "Actions")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {orphans.map((user: UserOrphanResponse) => (
                      <TableRow key={user.firebaseUid} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>
                            {user.name || "—"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {user.email || "—"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ fontFamily: "monospace" }}
                          >
                            {user.firebaseUid}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Button
                            variant="contained"
                            color="secondary"
                            size="small"
                            startIcon={<SyncIcon />}
                            disabled={isSyncing}
                            onClick={() => handleSyncOrphan(user.firebaseUid)}
                          >
                            Sync to DB
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}

        <Snackbar
          open={Boolean(snackbarMessage)}
          autoHideDuration={4000}
          onClose={() => setSnackbarMessage("")}
          message={snackbarMessage}
        />
      </Box>
    </SidebarLayout>
  );
};

export default Users;
