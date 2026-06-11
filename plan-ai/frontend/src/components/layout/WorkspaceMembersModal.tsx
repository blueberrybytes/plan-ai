/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Alert,
  CircularProgress,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  useGetMyWorkspacesQuery,
  useInviteWorkspaceMemberMutation,
} from "../../store/apis/workspaceApi";
import { useSelector } from "react-redux";
import { RootState } from "../../store/store";
import { components } from "../../types/api";

interface WorkspaceMembersModalProps {
  open: boolean;
  onClose: () => void;
}

const WorkspaceMembersModal: React.FC<WorkspaceMembersModalProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [personas, setPersonas] = useState<string[]>([]);
  const [personaNotes, setPersonaNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const PERSONA_OPTIONS: Array<{
    value: string;
    label: string;
  }> = [
    { value: "PROJECT_MANAGER", label: "Project Manager" },
    { value: "SOFTWARE_ENGINEER", label: "Software Engineer" },
    { value: "DESIGNER", label: "Designer" },
    { value: "PRODUCT_MANAGER", label: "Product Manager" },
    { value: "EXECUTIVE", label: "Executive" },
    { value: "OTHER", label: "Other" },
  ];

  const activeWorkspaceId = useSelector((state: RootState) => state.app.activeWorkspaceId);
  const { data: workspaces = [] } = useGetMyWorkspacesQuery();
  const [inviteMember, { isLoading }] = useInviteWorkspaceMemberMutation();

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const handleInvite = async () => {
    if (!email) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await inviteMember({
        email,
        role,
        personas: personas as components["schemas"]["UserPersona"][],
        personaNotes,
      }).unwrap();
      setSuccessMsg(t("workspaceTeam.success"));
      setEmail("");
      setPersonas([]);
      setPersonaNotes("");
      // Add a slight delay before closing or wait for user to close manually
      setTimeout(() => {
        setSuccessMsg(null);
      }, 3000);
    } catch (err: any) {
      setErrorMsg(err.data?.message || err.message || "Failed to invite user");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t("workspaceTeam.title")}</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1, mb: 3 }}>
          <Typography
            variant="body2"
            color="text.secondary"
            dangerouslySetInnerHTML={{
              __html: t("workspaceTeam.description", {
                workspaceName: activeWorkspace?.name || "",
              }),
            }}
          />
        </Box>

        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMsg}
          </Alert>
        )}

        {successMsg && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {successMsg}
          </Alert>
        )}

        <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", mt: 2 }}>
          <TextField
            autoFocus
            label={t("workspaceTeam.emailLabel")}
            type="email"
            fullWidth
            variant="outlined"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
          />
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel>{t("workspaceTeam.roleLabel")}</InputLabel>
            <Select
              value={role}
              label={t("workspaceTeam.roleLabel")}
              onChange={(e) => setRole(e.target.value as "MEMBER" | "ADMIN")}
              disabled={isLoading}
            >
              <MenuItem value="MEMBER">{t("workspaceTeam.roleMember")}</MenuItem>
              {activeWorkspace?.role === "OWNER" && (
                <MenuItem value="ADMIN">{t("workspaceTeam.roleAdmin")}</MenuItem>
              )}
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ mt: 2 }}>
          <FormControl fullWidth>
            <InputLabel>User Personas</InputLabel>
            <Select
              multiple
              value={personas}
              label="User Personas"
              onChange={(e) =>
                setPersonas(
                  typeof e.target.value === "string" ? e.target.value.split(",") : e.target.value,
                )
              }
              disabled={isLoading}
              renderValue={(selected) =>
                selected
                  .map((val) => PERSONA_OPTIONS.find((o) => o.value === val)?.label || val)
                  .join(", ")
              }
            >
              {PERSONA_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ mt: 2 }}>
          <TextField
            label="Custom AI Instructions / Notes"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            placeholder="E.g., Focuses heavily on frontend performance and accessibility."
            value={personaNotes}
            onChange={(e) => setPersonaNotes(e.target.value)}
            disabled={isLoading}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
          {t("workspaceTeam.close")}
        </Button>
        <Button
          onClick={handleInvite}
          variant="contained"
          disabled={!email || isLoading}
          startIcon={isLoading ? <CircularProgress size={20} /> : undefined}
        >
          {isLoading ? t("workspaceTeam.inviting") : t("workspaceTeam.sendInvite")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WorkspaceMembersModal;
