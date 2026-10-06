import React, { useState } from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link as MuiLink,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
} from "@mui/material";
import { NavLink } from "react-router-dom";
import SidebarLayout from "../../components/layout/SidebarLayout";
import {
  useApplyQdrantWorkspaceBackfillMutation,
  useGetQdrantWorkspaceStatusQuery,
  type QdrantWorkspaceBackfill,
} from "../../store/apis/adminApi";

const rowsOf = (r: QdrantWorkspaceBackfill): Array<[string, number | string]> => [
  ["Collection", r.collection],
  ["Points in total", r.totalPoints],
  ["Points without workspace", r.missingAfter],
  [r.applied ? "Points stamped in this run" : "Points a run would stamp", r.stamped],
  ["Contexts with points to stamp", `${r.contextsTouched} of ${r.contextsTotal}`],
  ["Points of contexts that no longer exist", r.orphans],
];

/** Admin page for one-off data jobs. Admin pages are in English only. */
const AdminMaintenance: React.FC = () => {
  const { data: status, isFetching, error, refetch } = useGetQdrantWorkspaceStatusQuery();
  const [apply, { data: lastRun, isLoading: isApplying, error: applyError }] =
    useApplyQdrantWorkspaceBackfillMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const nothingToDo = !!status && status.stamped === 0;

  const handleApply = async () => {
    setConfirmOpen(false);
    await apply()
      .unwrap()
      .catch(() => undefined);
  };

  return (
    <SidebarLayout>
      <Box sx={{ p: 3, maxWidth: 900, margin: "0 auto" }}>
        <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
          <MuiLink component={NavLink} underline="hover" color="inherit" to="/home">
            Home
          </MuiLink>
          <MuiLink component={NavLink} underline="hover" color="inherit" to="/admin">
            Admin
          </MuiLink>
          <Typography color="text.primary">Maintenance</Typography>
        </Breadcrumbs>
        <Typography variant="h4" fontWeight="bold">
          Maintenance
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1, mb: 4 }}>
          One-off data jobs. Each one can be checked first without changing anything.
        </Typography>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight="bold">
              Workspace stamp on knowledge base vectors
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              All workspaces share one Qdrant collection. New points carry the workspace that owns
              them, and searches refuse a point stamped with another workspace. Points indexed
              before October 2026 have no stamp. This job adds it. It is safe to run while the
              platform is in use and to run more than once.
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                Could not read the status. Check that you are a platform admin and that Qdrant is
                reachable.
              </Alert>
            )}
            {applyError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                The run failed. Nothing is left half done: run it again to finish.
              </Alert>
            )}
            {lastRun && !applyError && (
              <Alert severity="success" sx={{ mb: 2 }}>
                Stamped {lastRun.stamped} points. {lastRun.missingAfter} points are still without
                workspace{lastRun.missingAfter > 0 ? " (their contexts no longer exist)" : ""}.
              </Alert>
            )}
            {status && !status.collectionExists && (
              <Alert severity="info" sx={{ mb: 2 }}>
                The collection does not exist yet. Nothing has been indexed.
              </Alert>
            )}

            {status && status.collectionExists && (
              <Table size="small" sx={{ mb: 2 }}>
                <TableBody>
                  {rowsOf(status).map(([label, value]) => (
                    <TableRow key={label}>
                      <TableCell sx={{ color: "text.secondary" }}>{label}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {value}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Button
                variant="outlined"
                onClick={() => refetch()}
                disabled={isFetching || isApplying}
              >
                Check again
              </Button>
              <Button
                variant="contained"
                onClick={() => setConfirmOpen(true)}
                disabled={!status || nothingToDo || isFetching || isApplying}
              >
                Run backfill
              </Button>
              {(isFetching || isApplying) && <CircularProgress size={20} />}
              {isApplying && (
                <Typography variant="body2" color="text.secondary">
                  Running. Keep this page open.
                </Typography>
              )}
              {status && nothingToDo && !isFetching && (
                <Typography variant="body2" color="text.secondary">
                  Nothing to stamp.
                </Typography>
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Run the backfill?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This writes the workspace on {status?.stamped ?? 0} points in production. It only adds a
            field and can be repeated.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleApply()}>
            Run
          </Button>
        </DialogActions>
      </Dialog>
    </SidebarLayout>
  );
};

export default AdminMaintenance;
