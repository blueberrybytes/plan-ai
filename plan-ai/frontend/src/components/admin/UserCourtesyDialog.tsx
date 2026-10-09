import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  useGetUserWorkspacesQuery,
  useSetWorkspaceCourtesyMutation,
} from "../../store/apis/userApi";

interface Props {
  /** The user whose workspaces are shown. Null closes the dialog. */
  user: { id: string; label: string } | null;
  onClose: () => void;
}

/**
 * Platform admin: gives or takes away courtesy access. Courtesy belongs to a
 * workspace, so the dialog lists the user's workspaces with a switch each.
 * Admin screens are in English only.
 */
const UserCourtesyDialog: React.FC<Props> = ({ user, onClose }) => {
  const { data, isFetching, error } = useGetUserWorkspacesQuery(user?.id ?? "", { skip: !user });
  const [setCourtesy] = useSetWorkspaceCourtesyMutation();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const workspaces = data?.data ?? [];

  const toggle = async (workspaceId: string, isCourtesy: boolean) => {
    setSavingId(workspaceId);
    setFailed(false);
    try {
      await setCourtesy({ workspaceId, isCourtesy }).unwrap();
    } catch {
      setFailed(true);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Dialog open={!!user} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Courtesy access: {user?.label}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          A courtesy workspace runs on the platform&apos;s AI and transcription keys and skips the
          subscription check and the usage limits. It applies to everyone in that workspace, and the
          change is written to the workspace&apos;s audit log.
        </Typography>

        {error && <Alert severity="error">Could not load this user&apos;s workspaces.</Alert>}
        {failed && (
          <Alert severity="error" sx={{ mb: 2 }}>
            The change could not be saved. Try again.
          </Alert>
        )}
        {isFetching && workspaces.length === 0 && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {!isFetching && !error && workspaces.length === 0 && (
          <Typography variant="body2">This user is not in any workspace yet.</Typography>
        )}

        {workspaces.length > 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Workspace</TableCell>
                <TableCell>Their role</TableCell>
                <TableCell align="right">Members</TableCell>
                <TableCell align="right">Courtesy</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {workspaces.map((w) => (
                <TableRow key={w.workspaceId}>
                  <TableCell>
                    <Typography variant="body2">{w.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {w.kind.toLowerCase()}, {w.tier.toLowerCase()}
                    </Typography>
                  </TableCell>
                  <TableCell>{w.role.toLowerCase()}</TableCell>
                  <TableCell align="right">{w.members}</TableCell>
                  <TableCell align="right">
                    <Switch
                      size="small"
                      checked={w.isCourtesy}
                      disabled={savingId !== null}
                      onChange={(event) => void toggle(w.workspaceId, event.target.checked)}
                      inputProps={{ "aria-label": `Courtesy for ${w.name}` }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default UserCourtesyDialog;
