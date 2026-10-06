import React, { useEffect, useRef, useState } from "react";
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
  useCheckQdrantWorkspaceMutation,
  useGetQdrantWorkspaceStatusQuery,
  type QdrantWorkspaceBackfill,
} from "../../store/apis/adminApi";

const POLL_MS = 2000;

const rowsOf = (s: QdrantWorkspaceBackfill): Array<[string, number | string]> => [
  ["Collection", s.collection],
  ["Points in total", s.totalPoints ?? "not counted yet"],
  ["Points without workspace", s.missing ?? "not counted yet"],
  ...(s.stamped === null
    ? []
    : ([["Points stamped in the last run", s.stamped]] as Array<[string, number]>)),
];

const progressOf = (s: QdrantWorkspaceBackfill): string =>
  s.workspacesTotal > 0
    ? `${s.step ?? "Working"} (${s.workspacesDone} of ${s.workspacesTotal} workspaces)`
    : (s.step ?? "Working");

/** Admin page for one-off data jobs. Admin pages are in English only. */
const AdminMaintenance: React.FC = () => {
  // The job runs on the server. The page only starts it and reads how far it is.
  const [polling, setPolling] = useState(false);
  const { data: status, error } = useGetQdrantWorkspaceStatusQuery(undefined, {
    pollingInterval: polling ? POLL_MS : 0,
  });
  const [check, { isLoading: isStartingCheck }] = useCheckQdrantWorkspaceMutation();
  const [apply, { isLoading: isStartingApply }] = useApplyQdrantWorkspaceBackfillMutation();
  const [startFailed, setStartFailed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const running = status?.state === "running";
  useEffect(() => setPolling(running), [running]);

  // Count once on arrival, so the numbers are there without pressing anything.
  // After a server restart the status is empty again and this fills it.
  const countedOnArrival = useRef(false);
  useEffect(() => {
    if (!status || countedOnArrival.current) return;
    countedOnArrival.current = true;
    if (status.state === "idle") void check();
  }, [status, check]);

  const start = async (run: () => { unwrap: () => Promise<unknown> }) => {
    setStartFailed(false);
    try {
      await run().unwrap();
    } catch {
      setStartFailed(true);
    }
  };

  const busy = running || isStartingCheck || isStartingApply;
  const lastApplyDone = status?.state === "done" && status.mode === "apply";
  const nothingToStamp = status?.missing === 0;

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
              before October 2026 have no stamp. This job adds it. It runs on the server, is safe
              while the platform is in use and can be run more than once.
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                Could not read the status. Check that you are a platform admin.
              </Alert>
            )}
            {startFailed && (
              <Alert severity="error" sx={{ mb: 2 }}>
                The job could not be started. Try again.
              </Alert>
            )}
            {status?.state === "failed" && (
              <Alert severity="error" sx={{ mb: 2 }}>
                The last run failed: {status.error}. Nothing is left half done: run it again to
                finish.
              </Alert>
            )}
            {lastApplyDone && (
              <Alert severity="success" sx={{ mb: 2 }}>
                Stamped {status.stamped ?? 0} points. {status.missing ?? 0} points are still without
                workspace
                {(status.missing ?? 0) > 0 ? " (their contexts no longer exist)" : ""}.
              </Alert>
            )}
            {status?.collectionExists === false && (
              <Alert severity="info" sx={{ mb: 2 }}>
                The collection does not exist yet. Nothing has been indexed.
              </Alert>
            )}

            {status && status.collectionExists !== false && (
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

            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
              <Button variant="outlined" onClick={() => void start(check)} disabled={busy}>
                Count again
              </Button>
              <Button
                variant="contained"
                onClick={() => setConfirmOpen(true)}
                disabled={busy || !status || status.missing === null || nothingToStamp}
              >
                Run backfill
              </Button>
              {busy && <CircularProgress size={20} />}
              {running && status && (
                <Typography variant="body2" color="text.secondary">
                  {progressOf(status)}. It keeps running if you leave this page.
                </Typography>
              )}
              {!busy && nothingToStamp && (
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
            {status?.missing ?? 0} points in production have no workspace. This writes it on the
            ones whose context still exists. It only adds a field and can be repeated.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              setConfirmOpen(false);
              void start(apply);
            }}
          >
            Run
          </Button>
        </DialogActions>
      </Dialog>
    </SidebarLayout>
  );
};

export default AdminMaintenance;
