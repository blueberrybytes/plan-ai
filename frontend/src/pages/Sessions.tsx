import React from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add as AddIcon, Delete as DeleteIcon, Refresh as RefreshIcon } from "@mui/icons-material";
import SidebarLayout from "../components/layout/SidebarLayout";
import {
  useListSessionsQuery,
  useCreateSessionMutation,
  useDeleteSessionMutation,
} from "../store/apis/sessionApi";
import type { CreateSessionRequest, ListSessionsParams } from "../store/apis/sessionApi";
import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type { SerializedError } from "@reduxjs/toolkit";
import { Link as RouterLink, useLocation } from "react-router-dom";
import ConfirmDeletionDialog from "../components/dialogs/ConfirmDeletionDialog";

const defaultListParams: ListSessionsParams = {
  page: 1,
  pageSize: 20,
};

const getErrorMessage = (
  error: FetchBaseQueryError | SerializedError | undefined,
): string | null => {
  if (!error) {
    return null;
  }

  if ("status" in error) {
    const statusLabel = typeof error.status === "number" ? `Error ${error.status}` : "Error";

    if (typeof error.data === "string") {
      return error.data;
    }

    if (typeof error.data === "object" && error.data !== null && "message" in error.data) {
      const message = (error.data as { message?: string }).message;
      if (typeof message === "string" && message.trim().length > 0) {
        return message;
      }
    }

    return statusLabel;
  }

  if (typeof (error as SerializedError).message === "string") {
    return (error as SerializedError).message ?? null;
  }

  return "An unexpected error occurred.";
};

const Sessions: React.FC = () => {
  const { data, isLoading, isFetching, error, refetch } = useListSessionsQuery(defaultListParams);

  const sessions = data?.data?.sessions ?? [];

  const [createSession, { isLoading: isCreating }] = useCreateSessionMutation();
  const [deleteSession, { isLoading: isDeleting }] = useDeleteSessionMutation();

  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [showValidation, setShowValidation] = React.useState(false);
  const [createErrorMessage, setCreateErrorMessage] = React.useState<string | null>(null);
  const [deletionErrorMessage, setDeletionErrorMessage] = React.useState<string | null>(null);
  const [sessionIdBeingDeleted, setSessionIdBeingDeleted] = React.useState<string | null>(null);
  const [sessionPendingDeletion, setSessionPendingDeletion] = React.useState<{
    id: string;
    title: string;
  } | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);

  const location = useLocation();

  const listErrorMessage = getErrorMessage(error);

  const isTitleValid = title.trim().length > 0;

  React.useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    if (queryParams.get("create") === "true") {
      setIsDialogOpen(true);
    }
  }, [location.search]);

  const resetDialogState = () => {
    setTitle("");
    setDescription("");
    setShowValidation(false);
    setCreateErrorMessage(null);
  };

  const handleOpenDialog = () => {
    resetDialogState();
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    if (isCreating) {
      return;
    }
    setIsDialogOpen(false);
    resetDialogState();
  };

  const handleCreateSession = async () => {
    setShowValidation(true);
    if (!isTitleValid) {
      return;
    }

    const payload: CreateSessionRequest = {
      title: title.trim(),
      description: description.trim().length > 0 ? description.trim() : undefined,
    };

    setCreateErrorMessage(null);

    try {
      await createSession(payload).unwrap();
      handleCloseDialog();
      await refetch();
    } catch (caughtError: unknown) {
      if (caughtError && typeof caughtError === "object") {
        setCreateErrorMessage(
          getErrorMessage(caughtError as FetchBaseQueryError | SerializedError),
        );
      } else if (caughtError instanceof Error) {
        setCreateErrorMessage(caughtError.message);
      } else {
        setCreateErrorMessage("Failed to create session. Please try again.");
      }
    }
  };

  const openDeleteDialog = (session: { id: string; title: string }) => {
    setDeletionErrorMessage(null);
    setSessionPendingDeletion(session);
    setIsDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) {
      return;
    }
    setIsDeleteDialogOpen(false);
    setSessionPendingDeletion(null);
  };

  const confirmDeleteSession = async () => {
    if (!sessionPendingDeletion) {
      return;
    }

    setDeletionErrorMessage(null);
    setSessionIdBeingDeleted(sessionPendingDeletion.id);

    try {
      await deleteSession(sessionPendingDeletion.id).unwrap();
      await refetch();
      setIsDeleteDialogOpen(false);
      setSessionPendingDeletion(null);
    } catch (caughtError: unknown) {
      if (caughtError && typeof caughtError === "object") {
        setDeletionErrorMessage(
          getErrorMessage(caughtError as FetchBaseQueryError | SerializedError),
        );
      } else if (caughtError instanceof Error) {
        setDeletionErrorMessage(caughtError.message);
      } else {
        setDeletionErrorMessage("Failed to delete session. Please try again.");
      }
    } finally {
      setSessionIdBeingDeleted(null);
    }
  };

  return (
    <SidebarLayout>
      <Box
        sx={{
          p: { xs: 3, md: 6 },
          bgcolor: "background.default",
          minHeight: "100vh",
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={2}
          sx={{ mb: 4 }}
        >
          <Box>
            <Typography variant="h3" sx={{ fontWeight: 700 }}>
              Sessions
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              Curate conversations, track transcripts, and convert insight into action.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1}>
            <Tooltip title="Refresh">
              <span>
                <IconButton onClick={() => refetch()} disabled={isFetching} color="primary">
                  <RefreshIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenDialog}
              disabled={isCreating}
            >
              New session
            </Button>
          </Stack>
        </Stack>

        {listErrorMessage ? (
          <Alert severity="error" sx={{ mb: 3 }}>
            {listErrorMessage}
          </Alert>
        ) : null}

        {deletionErrorMessage ? (
          <Alert severity="error" sx={{ mb: 3 }}>
            {deletionErrorMessage}
          </Alert>
        ) : null}

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
            <CircularProgress />
          </Box>
        ) : sessions.length === 0 ? (
          <Card variant="outlined">
            <CardContent sx={{ textAlign: "center", py: 8 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                No sessions yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Create a session to organize transcripts and tasks for your next conversation.
              </Typography>
              <Button variant="contained" onClick={handleOpenDialog} startIcon={<AddIcon />}>
                Create session
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Stack spacing={2}>
            {sessions.map((session) => (
              <Card key={session.id} variant="outlined">
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  alignItems="stretch"
                  justifyContent="space-between"
                >
                  <CardActionArea
                    component={RouterLink}
                    to={`/sessions/${session.id}`}
                    sx={{ flexGrow: 1, textAlign: "left" }}
                  >
                    <CardContent>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        <Typography variant="h5" sx={{ fontWeight: 600 }}>
                          {session.title}
                        </Typography>
                        <Chip
                          label={session.status}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      </Stack>
                      {session.description ? (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          {session.description}
                        </Typography>
                      ) : null}
                      <Typography variant="caption" color="text.secondary">
                        Created {new Date(session.createdAt).toLocaleString()} · Updated{" "}
                        {new Date(session.updatedAt).toLocaleString()}
                      </Typography>
                    </CardContent>
                  </CardActionArea>

                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    justifyContent="flex-end"
                    sx={{ pr: 2, pb: { xs: 2, md: 0 }, pt: { xs: 0, md: 0 } }}
                  >
                    <Tooltip title="Delete session">
                      <span>
                        <IconButton
                          color="error"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            openDeleteDialog({
                              id: session.id,
                              title: session.title,
                            });
                          }}
                          disabled={isDeleting && sessionIdBeingDeleted === session.id}
                        >
                          {isDeleting && sessionIdBeingDeleted === session.id ? (
                            <CircularProgress size={20} />
                          ) : (
                            <DeleteIcon />
                          )}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                </Stack>
              </Card>
            ))}
          </Stack>
        )}

        <Dialog open={isDialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
          <DialogTitle>New session</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                autoFocus
                error={showValidation && !isTitleValid}
                helperText={showValidation && !isTitleValid ? "Title is required" : " "}
              />
              <TextField
                label="Description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                multiline
                minRows={3}
                placeholder="Outline the goals or context for this session"
              />

              {createErrorMessage ? <Alert severity="error">{createErrorMessage}</Alert> : null}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={handleCloseDialog} disabled={isCreating} variant="outlined">
              Cancel
            </Button>
            <Button onClick={handleCreateSession} disabled={isCreating} variant="contained">
              {isCreating ? "Creating..." : "Create session"}
            </Button>
          </DialogActions>
        </Dialog>

        <ConfirmDeletionDialog
          open={isDeleteDialogOpen}
          onCancel={closeDeleteDialog}
          onConfirm={confirmDeleteSession}
          isProcessing={isDeleting}
          title="Delete session"
          entityName={sessionPendingDeletion?.title ?? "Selected session"}
          description="Deleting this session removes transcripts, tasks, and related data."
          additionalWarning="This action cannot be undone."
          confirmLabel="Delete session"
        />
      </Box>
    </SidebarLayout>
  );
};

export default Sessions;
