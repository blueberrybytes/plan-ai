import React, { useMemo, useState } from "react";
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
  Avatar,
  CircularProgress,
  Alert,
  Tab,
  Tabs,
  Button,
  Chip,
  IconButton,
  Tooltip,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import RefreshIcon from "@mui/icons-material/Refresh";
import InsightsIcon from "@mui/icons-material/Insights";
import { useTranslation } from "react-i18next";
import { useSelector, useDispatch } from "react-redux";
import SidebarLayout from "../components/layout/SidebarLayout";
import WorkspaceMembersModal from "../components/layout/WorkspaceMembersModal";
import EditWorkspaceMemberModal from "../components/layout/EditWorkspaceMemberModal";
import {
  useGetWorkspaceMembersQuery,
  useGetMyWorkspacesQuery,
  useCreateWorkspaceMutation,
  useRemoveWorkspaceMemberMutation,
  useCancelWorkspaceInvitationMutation,
  useUpdateWorkspaceSettingsMutation,
  WorkspaceResponse,
  UpdateWorkspaceSettingsRequest,
} from "../store/apis/workspaceApi";
import { useGetWorkspaceSummaryQuery } from "../store/apis/aiUsageApi";
import { selectActiveWorkspaceId } from "../store/slices/app/appSelector";
import { selectUserDb } from "../store/slices/auth/authSelector";
import { setActiveWorkspaceId, setToastMessage } from "../store/slices/app/appSlice";
import { format } from "date-fns";
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField } from "@mui/material";
import { components } from "../types/api";

type WorkspaceMemberResponse = components["schemas"]["WorkspaceMemberResponse"];

const WorkspaceSettingsSection: React.FC<{ activeWorkspace: WorkspaceResponse }> = ({
  activeWorkspace,
}) => {
  const [updateSettings, { isLoading }] = useUpdateWorkspaceSettingsMutation();
  const dispatch = useDispatch();

  const [openRouterKey, setOpenRouterKey] = useState("");
  const [deepgramKey, setDeepgramKey] = useState("");
  const [tokenLimit, setTokenLimit] = useState("");

  React.useEffect(() => {
    if (activeWorkspace) {
      setOpenRouterKey(activeWorkspace.openRouterKey || "");
      setDeepgramKey(activeWorkspace.deepgramKey || "");
      setTokenLimit(activeWorkspace.monthlyTokenLimit?.toString() || "200000");
    }
  }, [activeWorkspace]);

  if (!activeWorkspace || activeWorkspace.role !== "OWNER") {
    return null;
  }

  const handleSave = async () => {
    try {
      const payload: UpdateWorkspaceSettingsRequest = {
        monthlyTokenLimit: parseInt(tokenLimit, 10) || 200000,
      };
      if (!activeWorkspace.isCourtesy) {
        payload.openRouterKey = openRouterKey;
        payload.deepgramKey = deepgramKey;
      }
      await updateSettings(payload).unwrap();
      dispatch(setToastMessage({ message: "Workspace settings updated", severity: "success" }));
    } catch (e) {
      console.error(e);
      dispatch(setToastMessage({ message: "Failed to update settings", severity: "error" }));
    }
  };

  const currentLimit = parseInt(tokenLimit, 10) || 0;
  // Based on the backend: blueberryTokens = actualCost * 2 * 10000 => actualCost = blueberryTokens / 20000
  const estimatedCost = (currentLimit / 20000).toFixed(2);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        gap: 3,
        mt: 3,
        alignItems: "flex-start",
      }}
    >
      <Paper elevation={1} sx={{ p: 3, flex: 1, maxWidth: 600 }}>
        {!activeWorkspace.isCourtesy && (
          <>
            <Typography variant="h6" gutterBottom>
              Workspace API Settings
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Update your personal Bring-Your-Own-Key configuration.
            </Typography>

            <TextField
              fullWidth
              label="OpenRouter API Key"
              type="password"
              value={openRouterKey}
              onChange={(e) => setOpenRouterKey(e.target.value)}
              sx={{ mb: 2 }}
              size="small"
            />
            <TextField
              fullWidth
              label="Deepgram API Key"
              type="password"
              value={deepgramKey}
              onChange={(e) => setDeepgramKey(e.target.value)}
              sx={{ mb: 3 }}
              size="small"
            />
          </>
        )}

        <Typography variant="subtitle2" gutterBottom>
          Monthly Token Visual Limit
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Set a visual warning recommendation limit for your workspace.
        </Typography>
        <TextField
          fullWidth
          label="Monthly Token Limit"
          type="number"
          value={tokenLimit}
          onChange={(e) => setTokenLimit(e.target.value)}
          sx={{ mb: 2 }}
          size="small"
          helperText={`≈ $${estimatedCost} USD estimated combined API cost`}
          FormHelperTextProps={{
            sx: { color: "success.main", fontWeight: 600, ml: 0 }
          }}
        />

        <Button variant="contained" onClick={handleSave} disabled={isLoading}>
          {isLoading ? "Saving..." : "Save Settings"}
        </Button>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          p: 3,
          width: { xs: "100%", md: 350 },
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
        }}
      >
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}
        >
          <InsightsIcon fontSize="small" color="primary" /> Understanding Your Limit
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          The <b>Monthly Token Limit</b> is a visual recommendation designed to help you monitor
          your &quot;Bring Your Own Key&quot; API usage. It does not hard-stop your workspace from
          functioning, but changes the sidebar usage bar to red if exceeded.
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          To make tracking easier, all your AI costs are unified into a single metric called <b>Blueberry Tokens</b>.
          <br /><br />
          <b>1 Blueberry Token ≈ $0.00005</b><br />
          <b>20,000 Tokens ≈ $1.00</b>
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          This metric combines your two major API costs:
        </Typography>
        <Box component="ul" sx={{ pl: 2, m: 0, "& li": { mb: 1 } }}>
          <Typography component="li" variant="body2" color="text.secondary">
            <b>OpenRouter (LLMs):</b> Variable cost depending on the AI model (e.g., Claude 3.5 Sonnet, GPT-4o).
          </Typography>
          <Typography component="li" variant="body2" color="text.secondary">
            <b>Deepgram (Audio):</b> Fast audio transcription. Costs ~$0.0043 per minute.
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};

const WorkspaceTeam: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<WorkspaceMemberResponse | null>(null);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

  const activeWorkspaceId = useSelector(selectActiveWorkspaceId);
  const userDb = useSelector(selectUserDb);
  const isAdmin = userDb?.role === "ADMIN";

  const [createWorkspace, { isLoading: isCreating }] = useCreateWorkspaceMutation();
  const [removeMember] = useRemoveWorkspaceMemberMutation();
  const [cancelInvitation] = useCancelWorkspaceInvitationMutation();
  const { data: workspaces } = useGetMyWorkspacesQuery();
  const activeWorkspace = workspaces?.find((w) => w.id === activeWorkspaceId);
  const canInvite =
    activeWorkspace && (activeWorkspace.role === "OWNER" || activeWorkspace.role === "ADMIN");
  const canViewUsage = activeWorkspace && (activeWorkspace.role === "OWNER" || isAdmin);

  const {
    data: response,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useGetWorkspaceMembersQuery(undefined, {
    skip: !activeWorkspaceId,
    refetchOnFocus: true,
  });

  const allMembers = useMemo(() => response?.members || [], [response]);

  const activeMembers = useMemo(
    () => allMembers.filter((m) => m.status === "ACTIVE"),
    [allMembers],
  );
  const pendingInvitations = useMemo(
    () => allMembers.filter((m) => m.status === "PENDING"),
    [allMembers],
  );

  const maxInvitations = response?.maxInvitations || 5;
  const usedInvitations = useMemo(
    () => activeMembers.filter((m) => m.role !== "OWNER").length + pendingInvitations.length,
    [activeMembers, pendingInvitations],
  );
  const isLimitReached = usedInvitations >= maxInvitations;

  const { data: usageData, isLoading: usageLoading } = useGetWorkspaceSummaryQuery(undefined, {
    skip: !activeWorkspaceId || !canViewUsage,
  });

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    try {
      const res = await createWorkspace({ name: newWorkspaceName }).unwrap();
      setCreateWorkspaceOpen(false);
      setNewWorkspaceName("");
      // Switch to the newly created workspace automatically
      // Note: Dispatching setActiveWorkspaceId naturally intercepts at rootReducers.ts
      // which aggressively purges every single workspace-dependent RTK query cache instantly!
      dispatch(setActiveWorkspaceId(res.id));
    } catch (error) {
      console.error("Failed to create workspace:", error);
    }
  };

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 2, md: 4 } }}>
        <Box
          sx={{ mb: 4, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
        >
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                {t("workspaceTeam.title", "Workspace Team")}
              </Typography>
              <Tooltip title="Refresh team data">
                <IconButton size="small" onClick={() => refetch()} disabled={isFetching}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Typography
              variant="body1"
              color="text.secondary"
              dangerouslySetInnerHTML={{
                __html: t("workspaceTeam.description", {
                  workspaceName: activeWorkspace?.name || "",
                }),
              }}
            />
          </Box>
          <Box sx={{ display: "flex", gap: 2 }}>
            {isAdmin && (
              <Button
                variant="outlined"
                color="secondary"
                onClick={() => setCreateWorkspaceOpen(true)}
              >
                + Create Workspace
              </Button>
            )}
            {canInvite && (
              <Box
                sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}
              >
                <Button
                  variant="contained"
                  startIcon={<GroupAddIcon />}
                  onClick={() => setModalOpen(true)}
                  disabled={isLimitReached}
                >
                  {t("workspaceTeam.sendInvite", "Invite Member")}
                </Button>
                <Typography variant="caption" color={isLimitReached ? "error" : "text.secondary"}>
                  {usedInvitations} / {maxInvitations} invitations used
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
          <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
            <Tab label={`Active Members (${activeMembers.length})`} />
            <Tab label={`Pending Invitations (${pendingInvitations.length})`} />
            {canViewUsage && <Tab label="Usage" />}
            {activeWorkspace?.role === "OWNER" && <Tab label="Settings" />}
          </Tabs>
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
            Failed to load team members.
          </Alert>
        ) : tabValue === 0 || tabValue === 1 ? (
          <TableContainer component={Paper} sx={{ borderRadius: 2, overflow: "hidden" }}>
            <Table>
              <TableHead sx={{ bgcolor: "background.default" }}>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  {tabValue === 0 && <TableCell>Name</TableCell>}
                  <TableCell>User Persona</TableCell>
                  <TableCell>Date</TableCell>
                  {canInvite && <TableCell align="center">Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {(tabValue === 0 ? activeMembers : pendingInvitations).map((member) => (
                  <TableRow key={member.id} hover>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Avatar sx={{ width: 32, height: 32 }}>
                          {member.email[0].toUpperCase()}
                        </Avatar>
                        <Typography variant="body2" fontWeight={500}>
                          {member.email}
                        </Typography>
                      </Box>
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
                            member.role === "ADMIN" || member.role === "OWNER"
                              ? "error.main"
                              : "primary.main",
                          color: "#fff",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          opacity: 0.9,
                        }}
                      >
                        {member.role}
                      </Typography>
                    </TableCell>
                    {tabValue === 0 && (
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {member.name || "—"}
                        </Typography>
                      </TableCell>
                    )}
                    <TableCell>
                      <Chip
                        label={
                          member.personas && member.personas.length > 0
                            ? member.personas.join(", ").replace(/_/g, " ")
                            : "Not Set"
                        }
                        size="small"
                        onClick={
                          canInvite && member.role !== "OWNER"
                            ? () => {
                                setMemberToEdit(member);
                                setEditModalOpen(true);
                              }
                            : undefined
                        }
                        clickable={canInvite && member.role !== "OWNER"}
                        color={
                          member.personas && member.personas.length > 0 ? "primary" : "default"
                        }
                        variant={
                          member.personas && member.personas.length > 0 ? "outlined" : "filled"
                        }
                        sx={{ textTransform: "capitalize" }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {format(new Date(member.createdAt), "MMM d, yyyy")}
                      </Typography>
                    </TableCell>
                    {canInvite && (
                      <TableCell align="center" sx={{ whiteSpace: "nowrap" }}>
                        {tabValue === 0 && (
                          <Tooltip title="Edit member">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => {
                                setMemberToEdit(member);
                                setEditModalOpen(true);
                              }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {member.role !== "OWNER" && (
                          <Tooltip title={tabValue === 0 ? "Remove member" : "Cancel invitation"}>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => {
                                if (tabValue === 0) {
                                  removeMember(member.id);
                                } else {
                                  cancelInvitation(member.id);
                                }
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {(tabValue === 0 ? activeMembers : pendingInvitations).length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={canInvite ? 5 : 4}
                      align="center"
                      sx={{ py: 4, color: "text.secondary" }}
                    >
                      {tabValue === 0 ? "No active members found." : "No pending invitations."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        ) : tabValue === 2 && canViewUsage ? (
          <>
            {usageLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <TableContainer component={Paper} sx={{ borderRadius: 2, overflow: "hidden" }}>
                <Table>
                  <TableHead sx={{ bgcolor: "background.default" }}>
                    <TableRow>
                      <TableCell>User</TableCell>
                      <TableCell>Role</TableCell>
                      <TableCell align="right">Input Tokens</TableCell>
                      <TableCell align="right">Output Tokens</TableCell>
                      <TableCell align="right">Total Tokens</TableCell>
                      <TableCell align="right">Est. Cost</TableCell>
                      <TableCell align="right">Blueberry Tokens</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {usageData && usageData.length > 0 ? (
                      usageData.map((usage) => (
                        <TableRow
                          key={usage.userId}
                          hover
                          onClick={() => navigate(`/team/users/${usage.userId}/usage`)}
                          sx={{ cursor: "pointer" }}
                        >
                          <TableCell>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                              <Avatar sx={{ width: 32, height: 32 }}>
                                {usage.email?.[0]?.toUpperCase() || "?"}
                              </Avatar>
                              <Box>
                                <Typography variant="body2" fontWeight={500}>
                                  {usage.name || "—"}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {usage.email}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={usage.workspaceRole}
                              color={
                                usage.workspaceRole === "OWNER" || usage.workspaceRole === "ADMIN"
                                  ? "error"
                                  : "primary"
                              }
                            />
                          </TableCell>
                          <TableCell align="right">
                            {usage.totalInputTokens.toLocaleString()}
                          </TableCell>
                          <TableCell align="right">
                            {usage.totalOutputTokens.toLocaleString()}
                          </TableCell>
                          <TableCell align="right">
                            <strong>{usage.totalTokens.toLocaleString()}</strong>
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{ color: "success.main", fontWeight: "bold" }}
                          >
                            ${usage.estimatedCost?.toFixed(6) || "0.000000"}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{ color: "secondary.main", fontWeight: "bold" }}
                          >
                            {usage.blueberryTokens?.toLocaleString() || "0"}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          align="center"
                          sx={{ py: 4, color: "text.secondary" }}
                        >
                          No usage data recorded for this workspace.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        ) : tabValue === 3 && activeWorkspace?.role === "OWNER" ? (
          <WorkspaceSettingsSection activeWorkspace={activeWorkspace} />
        ) : null}
      </Box>

      <WorkspaceMembersModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          refetch(); // Refetch after inviting
        }}
      />

      <EditWorkspaceMemberModal
        open={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setMemberToEdit(null);
          refetch();
        }}
        member={memberToEdit}
        activeWorkspaceRole={activeWorkspace?.role || "MEMBER"}
      />

      {/* Admin Workspace Creation Dialog */}
      <Dialog
        open={createWorkspaceOpen}
        onClose={() => setCreateWorkspaceOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New Workspace (Admin Only)</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This feature is temporarily available to admins to create isolated workspaces for
            testing.
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label="Workspace Name"
            type="text"
            fullWidth
            variant="outlined"
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
            disabled={isCreating}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateWorkspaceOpen(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateWorkspace}
            variant="contained"
            disabled={!newWorkspaceName.trim() || isCreating}
          >
            {isCreating ? "Creating..." : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
    </SidebarLayout>
  );
};

export default WorkspaceTeam;
