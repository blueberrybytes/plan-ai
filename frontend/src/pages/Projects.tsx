import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  FolderOutlined as FolderIcon,
  ChevronRight as ChevronRightIcon,
} from "@mui/icons-material";
import SidebarLayout from "../components/layout/SidebarLayout";
import {
  useListProjectsQuery,
  useCreateProjectMutation,
  useDeleteProjectMutation,
} from "../store/apis/projectApi";
import type { CreateProjectRequest, ListProjectsParams } from "../store/apis/projectApi";
import type { components } from "../types/api";
import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type { SerializedError } from "@reduxjs/toolkit";
import { Link as RouterLink, useLocation } from "react-router-dom";
import ConfirmDeletionDialog from "../components/dialogs/ConfirmDeletionDialog";
import ProjectCreateDialog from "../components/project/ProjectCreateDialog";

type ProjectResponse = components["schemas"]["ProjectResponse"];

const defaultListParams: ListProjectsParams = { page: 1, pageSize: 20 };

const getErrorMessage = (
  error: FetchBaseQueryError | SerializedError | undefined,
): string | null => {
  if (!error) return null;
  if ("status" in error) {
    if (typeof error.data === "string") return error.data;
    if (typeof error.data === "object" && error.data !== null && "message" in error.data) {
      const message = (error.data as { message?: string }).message;
      if (typeof message === "string" && message.trim().length > 0) return message;
    }
    return typeof error.status === "number" ? `Error ${error.status}` : "Error";
  }
  return (error as SerializedError).message ?? "An unexpected error occurred.";
};

const statusColor = (status: string): "default" | "success" | "warning" | "error" => {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "COMPLETED":
      return "default";
    case "ARCHIVED":
      return "warning";
    default:
      return "default";
  }
};

const Projects: React.FC = () => {
  const { data, isLoading, isFetching, error, refetch } = useListProjectsQuery(defaultListParams);
  const projects = data?.data?.projects ?? [];

  const [createProject, { isLoading: isCreating }] = useCreateProjectMutation();
  const [deleteProject, { isLoading: isDeleting }] = useDeleteProjectMutation();

  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [showValidation, setShowValidation] = React.useState(false);
  const [createErrorMessage, setCreateErrorMessage] = React.useState<string | null>(null);
  const [deletionErrorMessage, setDeletionErrorMessage] = React.useState<string | null>(null);
  const [projectIdBeingDeleted, setProjectIdBeingDeleted] = React.useState<string | null>(null);
  const [projectPendingDeletion, setProjectPendingDeletion] = React.useState<{
    id: string;
    title: string;
  } | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);

  const location = useLocation();
  const listErrorMessage = getErrorMessage(error);

  React.useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    if (queryParams.get("create") === "true") setIsDialogOpen(true);
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
    if (isCreating) return;
    setIsDialogOpen(false);
    resetDialogState();
  };

  const handleCreateProject = async () => {
    setShowValidation(true);
    if (!title.trim()) return;
    const payload: CreateProjectRequest = {
      title: title.trim(),
      description: description.trim() || undefined,
    };
    setCreateErrorMessage(null);
    try {
      await createProject(payload).unwrap();
      handleCloseDialog();
      await refetch();
    } catch (caughtError: unknown) {
      setCreateErrorMessage(
        caughtError && typeof caughtError === "object"
          ? getErrorMessage(caughtError as FetchBaseQueryError | SerializedError)
          : caughtError instanceof Error
            ? caughtError.message
            : "Failed to create project. Please try again.",
      );
    }
  };

  const openDeleteDialog = (project: { id: string; title: string }) => {
    setDeletionErrorMessage(null);
    setProjectPendingDeletion(project);
    setIsDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) return;
    setIsDeleteDialogOpen(false);
    setProjectPendingDeletion(null);
  };

  const confirmDeleteProject = async () => {
    if (!projectPendingDeletion) return;
    setDeletionErrorMessage(null);
    setProjectIdBeingDeleted(projectPendingDeletion.id);
    try {
      await deleteProject(projectPendingDeletion.id).unwrap();
      await refetch();
      setIsDeleteDialogOpen(false);
      setProjectPendingDeletion(null);
    } catch (caughtError: unknown) {
      setDeletionErrorMessage(
        caughtError && typeof caughtError === "object"
          ? getErrorMessage(caughtError as FetchBaseQueryError | SerializedError)
          : caughtError instanceof Error
            ? caughtError.message
            : "Failed to delete project. Please try again.",
      );
    } finally {
      setProjectIdBeingDeleted(null);
    }
  };

  return (
    <SidebarLayout>
      <Box sx={{ maxWidth: 900, mx: "auto", px: { xs: 3, md: 5 }, py: 5 }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 5 }}>
          <Box>
            <Typography variant="h4" fontWeight={700}>
              Projects
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Organise transcripts, tasks, and insights per conversation.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Refresh">
              <IconButton onClick={() => refetch()} disabled={isFetching} size="small">
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenDialog}
              disabled={isCreating}
            >
              New project
            </Button>
          </Stack>
        </Stack>

        {/* Errors */}
        {listErrorMessage && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {listErrorMessage}
          </Alert>
        )}
        {deletionErrorMessage && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {deletionErrorMessage}
          </Alert>
        )}

        {/* Loading skeletons */}
        {isLoading ? (
          <Stack spacing={0}>
            {[1, 2, 3, 4].map((i) => (
              <Box
                key={i}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  px: 2,
                  py: 1.75,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Skeleton variant="circular" width={32} height={32} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" width="30%" height={20} />
                  <Skeleton variant="text" width="50%" height={16} sx={{ mt: 0.5 }} />
                </Box>
                <Skeleton variant="rounded" width={64} height={22} />
                <Skeleton variant="text" width={80} height={16} />
              </Box>
            ))}
          </Stack>
        ) : projects.length === 0 ? (
          /* Empty state */
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              py: 10,
              borderRadius: 3,
              border: "1px dashed",
              borderColor: "divider",
              bgcolor: "rgba(255,255,255,0.02)",
            }}
          >
            <Box
              sx={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "linear-gradient(135deg, rgba(67,97,238,0.15), rgba(167,139,250,0.15))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 2.5,
              }}
            >
              <FolderIcon sx={{ fontSize: 36, color: "primary.main" }} />
            </Box>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
              No projects yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 380 }}>
              Create a project to organise transcripts and tasks for your next conversation.
            </Typography>
            <Button variant="contained" onClick={handleOpenDialog} startIcon={<AddIcon />}>
              Create project
            </Button>
          </Box>
        ) : (
          /* Project list */
          <Box
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            {projects.map((project: ProjectResponse, index: number) => (
              <Box
                key={project.id}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  px: 2,
                  py: 1.5,
                  borderBottom: index < projects.length - 1 ? "1px solid" : "none",
                  borderColor: "divider",
                  bgcolor: "background.paper",
                  transition: "background-color 0.15s ease",
                  "&:hover": { bgcolor: "action.hover" },
                  "&:hover .row-arrow": { opacity: 1 },
                }}
              >
                {/* Folder icon */}
                <Box
                  sx={{
                    width: 34,
                    height: 34,
                    borderRadius: 1.5,
                    bgcolor: "rgba(99,102,241,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <FolderIcon sx={{ fontSize: 18, color: "primary.main" }} />
                </Box>

                {/* Title + description — clickable */}
                <Box
                  component={RouterLink}
                  to={`/projects/${project.id}`}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <Typography variant="subtitle2" fontWeight={600} noWrap>
                    {project.title}
                  </Typography>
                  {project.description ? (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {project.description}
                    </Typography>
                  ) : null}
                </Box>

                {/* Status chip */}
                <Chip
                  label={project.status}
                  size="small"
                  color={statusColor(project.status)}
                  variant="outlined"
                  sx={{ fontSize: 11, height: 22, flexShrink: 0 }}
                />

                {/* Date */}
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{
                    flexShrink: 0,
                    minWidth: 90,
                    textAlign: "right",
                    display: { xs: "none", sm: "block" },
                  }}
                >
                  {new Date(project.updatedAt).toLocaleDateString()}
                </Typography>

                {/* Chevron */}
                <ChevronRightIcon
                  className="row-arrow"
                  component={RouterLink as React.ElementType}
                  to={`/projects/${project.id}`}
                  sx={{
                    fontSize: 18,
                    color: "text.disabled",
                    flexShrink: 0,
                    opacity: 0,
                    transition: "opacity 0.15s",
                  }}
                />

                {/* Delete */}
                <Tooltip title="Delete project">
                  <span>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openDeleteDialog({ id: project.id, title: project.title });
                      }}
                      disabled={isDeleting && projectIdBeingDeleted === project.id}
                      sx={{ flexShrink: 0, opacity: 0.5, "&:hover": { opacity: 1 } }}
                    >
                      {isDeleting && projectIdBeingDeleted === project.id ? (
                        <CircularProgress size={16} />
                      ) : (
                        <DeleteIcon fontSize="small" />
                      )}
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <ProjectCreateDialog
        open={isDialogOpen}
        title={title}
        description={description}
        isCreating={isCreating}
        showValidation={showValidation}
        errorMessage={createErrorMessage}
        onChangeTitle={setTitle}
        onChangeDescription={setDescription}
        onSubmit={handleCreateProject}
        onClose={handleCloseDialog}
      />

      <ConfirmDeletionDialog
        open={isDeleteDialogOpen}
        onCancel={closeDeleteDialog}
        onConfirm={confirmDeleteProject}
        isProcessing={isDeleting}
        title="Delete project"
        entityName={projectPendingDeletion?.title ?? "Selected project"}
        description="Deleting this project removes transcripts, tasks, and related data."
        additionalWarning="This action cannot be undone."
        confirmLabel="Delete project"
      />
    </SidebarLayout>
  );
};

export default Projects;
