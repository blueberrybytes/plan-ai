/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
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
import { useUpdateWorkspaceMemberMutation } from "../../store/apis/workspaceApi";
import { components } from "../../types/api";

type WorkspaceMemberResponse = components["schemas"]["WorkspaceMemberResponse"];

interface EditWorkspaceMemberModalProps {
  open: boolean;
  onClose: () => void;
  member: WorkspaceMemberResponse | null;
  activeWorkspaceRole: string;
}

const EditWorkspaceMemberModal: React.FC<EditWorkspaceMemberModalProps> = ({
  open,
  onClose,
  member,
  activeWorkspaceRole,
}) => {
  const [role, setRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [personas, setPersonas] = useState<string[]>([]);
  const [personaNotes, setPersonaNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const [updateMember, { isLoading }] = useUpdateWorkspaceMemberMutation();

  useEffect(() => {
    if (member && open) {
      setRole((member.role as any) === "OWNER" ? "ADMIN" : (member.role as "MEMBER" | "ADMIN"));
      setPersonas(member.personas || []);
      setPersonaNotes(member.personaNotes || "");
      setErrorMsg(null);
    }
  }, [member, open]);

  const handleUpdate = async () => {
    if (!member) return;
    setErrorMsg(null);

    try {
      await updateMember({
        memberId: member.id,
        body: {
          role: member.role === "OWNER" ? undefined : role,
          personas: personas as components["schemas"]["UserPersona"][],
          personaNotes,
        },
      }).unwrap();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.data?.message || err.message || "Failed to update member");
    }
  };

  if (!member) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Team Member</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1, mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            Update roles and AI instructions for <strong>{member.email}</strong>
          </Typography>
        </Box>

        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMsg}
          </Alert>
        )}

        <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", mt: 2 }}>
          <FormControl fullWidth>
            <InputLabel>Role</InputLabel>
            <Select
              value={member.role === "OWNER" ? "OWNER" : role}
              label="Role"
              onChange={(e) => setRole(e.target.value as "MEMBER" | "ADMIN")}
              disabled={isLoading || member.role === "OWNER"}
            >
              <MenuItem value="MEMBER">Member</MenuItem>
              {activeWorkspaceRole === "OWNER" && <MenuItem value="ADMIN">Admin</MenuItem>}
              {member.role === "OWNER" && <MenuItem value="OWNER">Owner</MenuItem>}
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
          Cancel
        </Button>
        <Button
          onClick={handleUpdate}
          variant="contained"
          disabled={isLoading}
          startIcon={isLoading ? <CircularProgress size={20} /> : undefined}
        >
          {isLoading ? "Saving..." : "Save Changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditWorkspaceMemberModal;
