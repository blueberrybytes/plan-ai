import React from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  Chip,
  Backdrop,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  useMediaQuery,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";
import GitHubIcon from "@mui/icons-material/GitHub";
import AddToDriveIcon from "@mui/icons-material/AddToDrive";
import CloudQueueIcon from "@mui/icons-material/CloudQueue";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import PublicIcon from "@mui/icons-material/Public";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import BugReportIcon from "@mui/icons-material/BugReport";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import ContextFormDialog from "../components/context/ContextFormDialog";
import WebScrapeDialog from "../components/context/WebScrapeDialog";
import CreateTextContextDialog from "../components/context/CreateTextContextDialog";
import { useDropzone } from "react-dropzone";
import ScrapedUrlsDialog from "../components/context/ScrapedUrlsDialog";
import GithubRepoSelectDialog from "../components/context/GithubRepoSelectDialog";
import GithubBranchEditDialog from "../components/context/GithubBranchEditDialog";
import ConfirmDeletionDialog from "../components/dialogs/ConfirmDeletionDialog";
import ContextInfoDialog from "../components/dialogs/ContextInfoDialog";
import GitNexusChatDialog from "../components/context/GitNexusChatDialog";
import {
  useDeleteContextFileMutation,
  useDeleteContextMutation,
  useGetContextQuery,
  useCreateContextMutation,
  useUpdateContextMutation,
  useUploadContextFileMutation,
  useListContextsQuery,
  useImportFromGoogleDriveMutation,
  useImportFromOneDriveMutation,
  useRetryContextFileMutation,
} from "../store/apis/contextApi";
import { useListIntegrationsQuery } from "../store/apis/integrationApi";
import { useGooglePicker } from "../hooks/useGooglePicker";
import { useOneDrivePicker } from "../hooks/useOneDrivePicker";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import { setToastMessage } from "../store/slices/app/appSlice";

const Contexts: React.FC = () => {
  const { contextId } = useParams<{ contextId: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const theme = useTheme();
  const { t } = useTranslation();

  const defaultContextColor = React.useMemo(() => {
    const primary = theme.palette.primary.main;
    return typeof primary === "string" && primary.startsWith("#") ? primary : "#1976d2";
  }, [theme.palette.primary.main]);

  const {
    data: contextsData,
    isLoading: isListLoading,
    error: listError,
    refetch: refetchList,
  } = useListContextsQuery(undefined, { refetchOnFocus: true });

  const { data: integrationsData } = useListIntegrationsQuery();
  const hasGoogleDrive = React.useMemo(
    () =>
      integrationsData?.data?.some(
        (i) => i.provider === "GOOGLE_DRIVE" && i.status === "CONNECTED",
      ),
    [integrationsData],
  );
  const hasOneDrive = React.useMemo(
    () =>
      integrationsData?.data?.some(
        (i) => i.provider === "ONEDRIVE" && i.status === "CONNECTED",
      ),
    [integrationsData],
  );
  const { loadPicker, openPicker } = useGooglePicker();
  const { openPicker: openOneDrivePicker } = useOneDrivePicker();

  React.useEffect(() => {
    loadPicker();
  }, [loadPicker]);
  const [importFromGoogleDrive, { isLoading: isImportingGoogleDrive }] =
    useImportFromGoogleDriveMutation();
  const [importFromOneDrive, { isLoading: isImportingOneDrive }] =
    useImportFromOneDriveMutation();

  const [pollingInterval, setPollingInterval] = React.useState(0);

  const { data, isLoading, error, refetch } = useGetContextQuery(contextId ?? "", {
    skip: !contextId,
    pollingInterval,
  });

  React.useEffect(() => {
    const syncStatus = data?.data?.metadata
      ? (data.data.metadata as Record<string, unknown>).syncStatus
      : null;
    const hasPendingFiles = data?.data?.files?.some(
      (f) =>
        f.metadata &&
        typeof f.metadata === "object" &&
        (f.metadata as Record<string, unknown>).processingStatus === "PENDING",
    );
    setPollingInterval(syncStatus === "SYNCING" || hasPendingFiles ? 2000 : 0);
  }, [data?.data]);

  const [createContext, { isLoading: isCreating }] = useCreateContextMutation();
  const [updateContext, { isLoading: isUpdating }] = useUpdateContextMutation();
  const [deleteContext, { isLoading: isDeletingContext }] = useDeleteContextMutation();
  const [uploadContextFile, { isLoading: isUploading }] = useUploadContextFileMutation();
  const [deleteContextFile, { isLoading: isDeletingFile }] = useDeleteContextFileMutation();
  const [retryContextFile, { isLoading: isRetryingFile }] = useRetryContextFileMutation();

  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deletedContextId, setDeletedContextId] = React.useState<string | null>(null);

  const [githubDialogOpen, setGithubDialogOpen] = React.useState(false);
  const [webScrapeDialogOpen, setWebScrapeDialogOpen] = React.useState(false);
  const [createTextDialogOpen, setCreateTextDialogOpen] = React.useState(false);
  const [infoDialogOpen, setInfoDialogOpen] = React.useState(false);
  const [scrapedUrlsDialogOpen, setScrapedUrlsDialogOpen] = React.useState<string[] | null>(null);
  const [editGithubRepo, setEditGithubRepo] = React.useState<{
    repoFullName: string;
    installationId: string;
    branch?: string;
  } | null>(null);
  const [addMenuAnchorEl, setAddMenuAnchorEl] = React.useState<null | HTMLElement>(null);
  const [gitnexusChatRepo, setGitnexusChatRepo] = React.useState<string | null>(null);

  const context = data?.data ?? null;
  const contexts = React.useMemo(() => contextsData?.data?.contexts ?? [], [contextsData]);

  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  // Auto-select first context if none selected, but never re-select a just-deleted one
  React.useEffect(() => {
    if (!isMobile && !isListLoading && contexts.length > 0 && !contextId) {
      const next = contexts.find((c) => c.id !== deletedContextId);
      if (next) {
        setDeletedContextId(null);
        navigate(`/contexts/${next.id}`, { replace: true });
      }
    }
  }, [isMobile, isListLoading, contexts, contextId, navigate, deletedContextId]);

  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = React.useState(false);
  const [dialogMode, setDialogMode] = React.useState<"create" | "edit" | null>(null);
  const [dialogName, setDialogName] = React.useState("");
  const [dialogDescription, setDialogDescription] = React.useState("");
  const [dialogColor, setDialogColor] = React.useState(defaultContextColor);
  const [dialogError, setDialogError] = React.useState<string | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  const resetDialogState = () => {
    setDialogName("");
    setDialogDescription("");
    setDialogColor(defaultContextColor);
    setDialogError(null);
  };

  const openCreateDialog = () => {
    resetDialogState();
    setDialogMode("create");
  };

  const openEditDialog = () => {
    if (!context) {
      return;
    }

    setDialogName(context.name ?? "");
    setDialogDescription(context.description ?? "");
    setDialogColor(context.color ?? defaultContextColor);
    setDialogError(null);
    setDialogMode("edit");
  };

  const closeDialog = () => {
    setDialogMode(null);
    resetDialogState();
  };

  const validateDialog = () => {
    if (!dialogName.trim()) {
      setDialogError(t("contexts.messages.nameRequired"));
      return false;
    }

    setDialogError(null);
    return true;
  };

  const handleCreateContext = async () => {
    if (!validateDialog()) {
      return;
    }

    const trimmedName = dialogName.trim();
    const trimmedDescription = dialogDescription.trim();
    const trimmedColor = dialogColor.trim();

    try {
      const response = await createContext({
        name: trimmedName,
        description: trimmedDescription || null,
        color: trimmedColor || null,
      }).unwrap();

      await refetchList();
      closeDialog();

      if (response.data) {
        navigate(`/contexts/${response.data.id}`);
        dispatch(
          setToastMessage({
            severity: "success",
            message: t("contexts.messages.createSuccess"),
          }),
        );
      }
    } catch (createError) {
      console.error("Failed to create context", createError);
      setDialogError(t("contexts.messages.createError"));
    }
  };

  const handleUpdateContext = async () => {
    if (!validateDialog() || !contextId) {
      return;
    }

    const trimmedName = dialogName.trim();
    const trimmedDescription = dialogDescription.trim();
    const trimmedColor = dialogColor.trim();

    try {
      await updateContext({
        contextId,
        body: {
          name: trimmedName,
          description: trimmedDescription || null,
          color: trimmedColor || null,
        },
      }).unwrap();

      closeDialog();
      await refetch();

      dispatch(
        setToastMessage({
          severity: "success",
          message: t("contexts.messages.updateSuccess"),
        }),
      );
    } catch (updateError) {
      console.error("Failed to update context", updateError);
      setDialogError(t("contexts.messages.updateError"));
    }
  };

  const SUPPORTED_CONTEXT_TYPES = React.useMemo(
    () => [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint",
      "text/plain",
      "text/csv",
      "application/json",
      "application/xml",
    ],
    [],
  );

  const supportedContextLabels = "PDF, DOC, DOCX, TXT, CSV, JSON, XML, XLSX, PPTX, MD";

  const uploadFileTask = async (file: File) => {
    try {
      if (
        !SUPPORTED_CONTEXT_TYPES.some((type) => file.type === type || file.type.startsWith("text/"))
      ) {
        setUploadError(t("contexts.messages.unsupportedFile", { types: supportedContextLabels }));
        return;
      }

      setUploadError(null);
      if (!contextId) return;
      await uploadContextFile({ contextId, file }).unwrap();
      await refetch();
      dispatch(
        setToastMessage({
          severity: "success",
          message: t("contexts.messages.uploadProcessing"),
        }),
      );
    } catch (error) {
      console.error("Failed to upload context file", error);
      dispatch(
        setToastMessage({
          severity: "error",
          message: t("contexts.messages.uploadError"),
        }),
      );
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!contextId || !event.target.files || event.target.files.length === 0) {
      return;
    }
    const file = event.target.files[0];
    await uploadFileTask(file);
    event.target.value = "";
  };

  const onDrop = React.useCallback(
    async (acceptedFiles: File[]) => {
      if (!contextId || acceptedFiles.length === 0) return;
      for (const file of acceptedFiles) {
        await uploadFileTask(file);
      }
    },
    // We cannot reliably list all dependencies here without extracting uploadFileTask to useCallback,
    // but React's synthetic ref will handle it since we're using a simple async wrapper.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contextId],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: false,
    noKeyboard: true,
  });

  const handleRetryFile = async (fileId: string) => {
    if (!contextId) return;
    try {
      await retryContextFile({ contextId, fileId }).unwrap();
      dispatch(
        setToastMessage({
          severity: "success",
          message: t("contexts.messages.uploadProcessing", "Procesando en segundo plano..."),
        }),
      );
      refetch();
    } catch (error) {
      console.error("Failed to retry processing", error);
      dispatch(
        setToastMessage({
          severity: "error",
          message: t("contexts.messages.uploadError", "Failed to upload file."),
        }),
      );
    }
  };

  const handleGoogleDriveImport = () => {
    if (!hasGoogleDrive) {
      dispatch(
        setToastMessage({
          severity: "info",
          message: t(
            "contexts.messages.connectGoogleDriveFirst",
            "Please connect Google Drive in Integrations first.",
          ),
        }),
      );
      navigate("/integrations/google");
      return;
    }
    openPicker({
      onPick: async (fileIds) => {
        if (!contextId) return;
        try {
          await importFromGoogleDrive({ contextId, fileIds }).unwrap();
          dispatch(
            setToastMessage({
              severity: "success",
              message: t(
                "contexts.messages.uploadProcessing",
                "Imported. Processing in the background...",
              ),
            }),
          );
          refetch();
        } catch (error) {
          dispatch(
            setToastMessage({
              severity: "error",
              message: t(
                "contexts.messages.googleDriveImportError",
                "Failed to start Google Drive import.",
              ),
            }),
          );
        }
      },
    });
  };

  const handleOneDriveImport = () => {
    if (!hasOneDrive) {
      dispatch(
        setToastMessage({
          severity: "info",
          message: t(
            "contexts.messages.connectOneDriveFirst",
            "Please connect OneDrive in Integrations first.",
          ),
        }),
      );
      navigate("/integrations/microsoft");
      return;
    }
    openOneDrivePicker({
      onPick: async (fileIds) => {
        if (!contextId) return;
        try {
          await importFromOneDrive({ contextId, fileIds }).unwrap();
          dispatch(
            setToastMessage({
              severity: "success",
              message: t(
                "contexts.messages.uploadProcessing",
                "Imported. Processing in the background...",
              ),
            }),
          );
          refetch();
        } catch (error) {
          dispatch(
            setToastMessage({
              severity: "error",
              message: t(
                "contexts.messages.oneDriveImportError",
                "Failed to start OneDrive import.",
              ),
            }),
          );
        }
      },
    });
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!contextId) {
      return;
    }

    try {
      await deleteContextFile({ contextId, fileId }).unwrap();
      await refetch();
      dispatch(
        setToastMessage({
          severity: "success",
          message: t("contexts.messages.deleteSuccess"),
        }),
      );
    } catch (deleteError) {
      console.error("Failed to delete context file", deleteError);
      dispatch(
        setToastMessage({
          severity: "error",
          message: t("contexts.messages.deleteError"),
        }),
      );
    }
  };

  const isDialogOpen = dialogMode !== null;
  const isDialogSubmitting = dialogMode === "create" ? isCreating : isUpdating;
  const handleDialogSubmit = dialogMode === "create" ? handleCreateContext : handleUpdateContext;
  const handleDeleteContext = async () => {
    if (!contextId) return;
    const deletedId = contextId;
    try {
      await deleteContext(deletedId).unwrap();
      setDeleteConfirmOpen(false);
      setDeletedContextId(deletedId);
      // Navigate away BEFORE refetching so useGetContextQuery is skipped immediately.
      navigate("/contexts", { replace: true });
      // Refetch list — auto-select effect will pick the next non-deleted context.
      refetchList();
      dispatch(
        setToastMessage({
          severity: "success",
          message: t("contexts.messages.deleteContextSuccess"),
        }),
      );
    } catch {
      dispatch(
        setToastMessage({ severity: "error", message: t("contexts.messages.deleteContextError") }),
      );
    }
  };

  const handleSelectContext = (id: string) => {
    navigate(`/contexts/${id}`);
  };

  return (
    <SidebarLayout fullHeight>
      <Box sx={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* ── Left panel: context list ── */}
        <Box
          sx={{
            width: { xs: "100%", md: isLeftPanelCollapsed ? 60 : 280 },
            display: { xs: contextId ? "none" : "flex", md: "flex" },
            flexShrink: 0,
            borderRight: 1,
            borderColor: "divider",
            overflow: "hidden",
            bgcolor: "background.paper",
            flexDirection: "column",
            transition: "width 0.2s ease-in-out",
          }}
        >
          {/* Header */}
          <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: isLeftPanelCollapsed ? "center" : "space-between",
              }}
            >
              {!isLeftPanelCollapsed && (
                <Typography variant="h6" fontWeight={700}>
                  {t("contexts.heading")}
                </Typography>
              )}
              <Box sx={{ display: "flex" }}>
                {!isLeftPanelCollapsed && (
                  <IconButton size="small" onClick={() => setInfoDialogOpen(true)}>
                    <InfoOutlinedIcon fontSize="small" />
                  </IconButton>
                )}
                <Tooltip title={isLeftPanelCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
                  <IconButton
                    onClick={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
                    size="small"
                    sx={{ ml: isLeftPanelCollapsed ? 0 : 1 }}
                  >
                    {isLeftPanelCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
            {!isLeftPanelCollapsed && (
              <Typography variant="caption" color="text.secondary">
                {t(`contexts.list.count${contexts.length === 1 ? "" : "_plural"}`, {
                  count: contexts.length,
                })}
              </Typography>
            )}
          </Box>

          {/* New context button pinned at top */}
          <Box
            sx={{
              p: 1.5,
              borderBottom: 1,
              borderColor: "divider",
              flexShrink: 0,
              display: isLeftPanelCollapsed ? "none" : "block",
            }}
          >
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={openCreateDialog}
              disabled={isCreating}
              fullWidth
            >
              {isCreating ? t("contexts.buttons.creating") : t("contexts.buttons.create")}
            </Button>
          </Box>

          {/* List */}
          <Box
            sx={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              minHeight: 0,
              px: 1.5,
              py: 1.5,
              display: isLeftPanelCollapsed ? "none" : "block",
            }}
          >
            {listError ? (
              <Alert severity="error" sx={{ mx: 0.5 }}>
                {t("contexts.list.error")}
              </Alert>
            ) : isListLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : contexts.length === 0 ? (
              <Box sx={{ px: 1, py: 4, textAlign: "center", color: "text.secondary" }}>
                <Typography variant="body2">{t("contexts.list.emptyDescription")}</Typography>
              </Box>
            ) : (
              contexts.map((item) => {
                const displayName = item.name?.trim() || t("contexts.info.untitled");
                const isSelected = item.id === contextId;
                return (
                  <Box
                    key={item.id}
                    onClick={() => handleSelectContext(item.id)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      px: 1.5,
                      py: 1.25,
                      mb: 0.5,
                      borderRadius: 2,
                      cursor: "pointer",
                      border: isSelected ? 2 : 1,
                      borderColor: isSelected ? "primary.main" : "divider",
                      bgcolor: isSelected ? "action.selected" : "transparent",
                      transition: "all 0.15s ease",
                      "&:hover": { bgcolor: isSelected ? "action.selected" : "action.hover" },
                    }}
                  >
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        flexShrink: 0,
                        bgcolor: item.color ?? "primary.main",
                        border: (theme) => `1px solid ${theme.palette.divider}`,
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="subtitle2"
                        fontWeight={600}
                        noWrap
                        color={isSelected ? "primary.main" : "text.primary"}
                      >
                        {displayName}
                      </Typography>
                      {item.description ? (
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
                          {item.description}
                        </Typography>
                      ) : null}
                    </Box>
                  </Box>
                );
              })
            )}
          </Box>
        </Box>

        {/* ── Right panel: context detail ── */}
        <Box
          sx={{
            flex: 1,
            display: { xs: !contextId ? "none" : "block", md: "block" },
            overflowY: "auto",
            bgcolor: "background.default",
          }}
        >
          {!contextId ? (
            <Box
              sx={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "text.secondary",
              }}
            >
              <Typography variant="body1">{t("contexts.placeholders.selectContext")}</Typography>
            </Box>
          ) : isLoading ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "100%",
              }}
            >
              <CircularProgress />
            </Box>
          ) : error ? (
            <Box sx={{ p: 4 }}>
              <Alert severity="error">{t("contexts.messages.contextError")}</Alert>
            </Box>
          ) : context ? (
            <Box sx={{ width: "100%", px: { xs: 3, md: 5 }, py: 5 }}>
              <Stack spacing={4}>
                {context.metadata &&
                  (context.metadata as Record<string, unknown>).syncStatus === "SYNCING" && (
                    <Alert severity="info" icon={<CircularProgress size={20} />}>
                      GitHub Repository (
                      {(context.metadata as Record<string, unknown>).githubRepoFullName as string})
                      is currently syncing in the background. Please wait...
                    </Alert>
                  )}

                {/* Context header */}
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Stack direction="row" alignItems="flex-start" spacing={1}>
                    <IconButton
                      sx={{ display: { xs: "flex", md: "none" }, mt: -0.5, ml: -1 }}
                      onClick={() => navigate("/contexts")}
                    >
                      <ArrowBackIcon />
                    </IconButton>
                    <Stack spacing={0.5}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        {context.color && (
                          <Box
                            sx={{
                              width: 14,
                              height: 14,
                              borderRadius: "50%",
                              bgcolor: context.color,
                              border: (theme) => `1px solid ${theme.palette.divider}`,
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <Typography variant="h4" fontWeight={700}>
                          {context.name}
                        </Typography>
                      </Stack>
                      {context.description ? (
                        <Typography variant="body1" color="text.secondary">
                          {context.description}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary" fontStyle="italic">
                          {t("contexts.placeholders.missingDescription")}
                        </Typography>
                      )}
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Typography variant="caption" color="text.disabled">
                          {t("contexts.info.updated", {
                            timestamp: new Date(context.updatedAt).toLocaleString(),
                          })}
                        </Typography>
                        {Boolean(
                          context.metadata &&
                          (context.metadata as Record<string, unknown>).lastSyncAt,
                        ) && (
                          <Typography
                            variant="caption"
                            color="text.disabled"
                            sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                          >
                            <GitHubIcon fontSize="inherit" />
                            Last synced:{" "}
                            {new Date(
                              (context.metadata as Record<string, unknown>).lastSyncAt as string,
                            ).toLocaleString()}
                            {Boolean(
                              context.metadata &&
                              (context.metadata as Record<string, unknown>).gitnexusReady,
                            ) && (
                              <Tooltip title="GitNexus Context Ready">
                                <BugReportIcon
                                  fontSize="small"
                                  sx={{ color: "error.main", ml: 1 }}
                                />
                              </Tooltip>
                            )}
                          </Typography>
                        )}
                      </Stack>
                    </Stack>
                  </Stack>

                  {/* Actions */}
                  <Stack direction="row" spacing={1} sx={{ flexShrink: 0, ml: 2 }}>
                    <Tooltip title={t("contexts.buttons.edit")}>
                      <IconButton onClick={openEditDialog} disabled={isUpdating}>
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t("contexts.buttons.delete")}>
                      <IconButton
                        color="error"
                        onClick={() => setDeleteConfirmOpen(true)}
                        disabled={isDeletingContext}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                    <Button
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={(e) => setAddMenuAnchorEl(e.currentTarget)}
                      disabled={isUploading || isImportingGoogleDrive || isImportingOneDrive}
                    >
                      {t("contexts.buttons.addFiles", "Add Files...")}
                    </Button>
                    <Menu
                      anchorEl={addMenuAnchorEl}
                      open={Boolean(addMenuAnchorEl)}
                      onClose={() => setAddMenuAnchorEl(null)}
                      transformOrigin={{ horizontal: "right", vertical: "top" }}
                      anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
                    >
                      <MenuItem component="label" disabled={isUploading}>
                        <ListItemIcon>
                          {isUploading ? (
                            <CircularProgress size={20} color="inherit" />
                          ) : (
                            <CloudUploadIcon fontSize="small" />
                          )}
                        </ListItemIcon>
                        <ListItemText>
                          {isUploading
                            ? t("contexts.buttons.uploading")
                            : t("contexts.buttons.upload")}
                        </ListItemText>
                        <input
                          type="file"
                          hidden
                          onChange={(e) => {
                            handleFileUpload(e);
                            setAddMenuAnchorEl(null);
                          }}
                        />
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          setWebScrapeDialogOpen(true);
                          setAddMenuAnchorEl(null);
                        }}
                      >
                        <ListItemIcon>
                          <PublicIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>
                          {t("contexts.buttons.importWebsite", "Import Website")}
                        </ListItemText>
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          setCreateTextDialogOpen(true);
                          setAddMenuAnchorEl(null);
                        }}
                      >
                        <ListItemIcon>
                          <DriveFileRenameOutlineIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>
                          {t("contexts.buttons.writeText", "Write Text Manually...")}
                        </ListItemText>
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          setGithubDialogOpen(true);
                          setAddMenuAnchorEl(null);
                        }}
                      >
                        <ListItemIcon>
                          <GitHubIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>
                          {t("contexts.buttons.syncGithub", "Sync GitHub")}
                        </ListItemText>
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          handleGoogleDriveImport();
                          setAddMenuAnchorEl(null);
                        }}
                        disabled={isImportingGoogleDrive}
                      >
                        <ListItemIcon>
                          {isImportingGoogleDrive ? (
                            <CircularProgress size={20} color="inherit" />
                          ) : (
                            <AddToDriveIcon fontSize="small" />
                          )}
                        </ListItemIcon>
                        <ListItemText>
                          {isImportingGoogleDrive
                            ? t("contexts.buttons.importing", "Importing")
                            : t("contexts.buttons.importDrive", "Import Drive")}
                        </ListItemText>
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          handleOneDriveImport();
                          setAddMenuAnchorEl(null);
                        }}
                        disabled={isImportingOneDrive}
                      >
                        <ListItemIcon>
                          {isImportingOneDrive ? (
                            <CircularProgress size={20} color="inherit" />
                          ) : (
                            <CloudQueueIcon fontSize="small" />
                          )}
                        </ListItemIcon>
                        <ListItemText>
                          {isImportingOneDrive
                            ? t("contexts.buttons.importing", "Importing")
                            : t("contexts.buttons.importOneDrive", "Import OneDrive")}
                        </ListItemText>
                      </MenuItem>
                    </Menu>
                  </Stack>
                </Stack>

                {uploadError && (
                  <Alert severity="error" onClose={() => setUploadError(null)}>
                    {uploadError}
                  </Alert>
                )}

                {/* Drag and Drop Zone */}
                <Box
                  {...getRootProps()}
                  sx={{
                    mb: 4,
                    mt: 2,
                    p: 4,
                    border: (theme) =>
                      `2px dashed ${isDragActive ? theme.palette.primary.main : theme.palette.divider}`,
                    borderRadius: 2,
                    bgcolor: isDragActive ? "action.hover" : "transparent",
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    "&:hover": {
                      borderColor: "primary.main",
                      bgcolor: "action.hover",
                    },
                  }}
                >
                  <input {...getInputProps()} />
                  <CloudUploadIcon
                    color={isDragActive ? "primary" : "action"}
                    sx={{ fontSize: 40, mb: 1 }}
                  />
                  <Typography
                    variant="body1"
                    fontWeight={600}
                    color={isDragActive ? "primary.main" : "text.primary"}
                  >
                    {isDragActive
                      ? "Drop files here..."
                      : "Drag & drop files here, or click to browse"}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 1 }}
                  >
                    {supportedContextLabels}
                  </Typography>
                </Box>

                {/* Files section */}
                <Box>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 2 }}
                  >
                    <Typography variant="h6" fontWeight={600}>
                      {t("contexts.files.title")}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t(`contexts.files.count${context.files.length === 1 ? "" : "_plural"}`, {
                        count: context.files.length,
                      })}
                    </Typography>
                  </Stack>

                  {context.files.length === 0 ? (
                    <Box
                      sx={{
                        py: 6,
                        textAlign: "center",
                        borderRadius: 2,
                        border: (theme) => `1px dashed ${theme.palette.divider}`,
                        color: "text.secondary",
                      }}
                    >
                      <Typography variant="body2">{t("contexts.placeholders.noFiles")}</Typography>
                      <Typography
                        variant="caption"
                        color="text.disabled"
                        sx={{ mt: 0.5, display: "block" }}
                      >
                        {t("contexts.placeholders.supportedTypes", {
                          types: supportedContextLabels,
                        })}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="primary.main"
                        sx={{ mt: 1, display: "block", fontWeight: 500 }}
                      >
                        {t("contexts.placeholders.presentationTip")}
                      </Typography>
                    </Box>
                  ) : (
                    <Stack spacing={1.5}>
                      {context.files.map((file) => (
                        <Card key={file.id} variant="outlined">
                          <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                            <Stack direction="row" spacing={2} alignItems="center">
                              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                <Typography
                                  variant="subtitle2"
                                  fontWeight={600}
                                  noWrap
                                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                                >
                                  {file.fileName}
                                  {(file.metadata as Record<string, unknown>)?.source ===
                                    "GITHUB_SYNC" && (
                                    <>
                                      <Chip
                                        size="small"
                                        icon={<GitHubIcon fontSize="inherit" />}
                                        label={(() => {
                                          const b = (file.metadata as Record<string, unknown>)
                                            ?.branch as string | undefined;
                                          if (!b || b === "HEAD") return "Default branch";
                                          return `Branch: ${b}`;
                                        })()}
                                        variant="outlined"
                                        color="primary"
                                        sx={{ height: 20, "& .MuiChip-label": { px: 1 } }}
                                      />
                                      {Boolean(
                                        context.metadata &&
                                        (context.metadata as Record<string, unknown>).gitnexusReady,
                                      ) && (
                                        <Tooltip title="Open PlanAI Knowledge Graph Chat">
                                          <BugReportIcon
                                            fontSize="small"
                                            sx={{ color: "error.main", ml: 0.5, cursor: "pointer" }}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const contextMeta = context.metadata as Record<
                                                string,
                                                unknown
                                              >;
                                              const repoName =
                                                (file.metadata as Record<string, unknown>)?.repo ||
                                                (contextMeta.githubRepoFullName as string) ||
                                                "Unknown Repo";
                                              setGitnexusChatRepo(repoName as string);
                                            }}
                                          />
                                        </Tooltip>
                                      )}
                                    </>
                                  )}
                                  {(file.metadata as Record<string, unknown>)?.source ===
                                    "GOOGLE_DRIVE" && (
                                    <Chip
                                      size="small"
                                      icon={<AddToDriveIcon fontSize="inherit" />}
                                      label="Google Drive"
                                      variant="outlined"
                                      color="info"
                                      sx={{ height: 20, "& .MuiChip-label": { px: 1 } }}
                                    />
                                  )}
                                  {(file.metadata as Record<string, unknown>)?.source ===
                                    "WEBSITE_SCRAPE" && (
                                    <Tooltip
                                      title={
                                        (file.metadata as { urls?: string[] })?.urls?.length
                                          ? `${(file.metadata as { urls?: string[] })?.urls?.length} aggregated pages`
                                          : "Website Context"
                                      }
                                      placement="top"
                                    >
                                      <Chip
                                        size="small"
                                        icon={<PublicIcon fontSize="inherit" />}
                                        label="Website"
                                        variant="outlined"
                                        color="secondary"
                                        sx={{ height: 20, "& .MuiChip-label": { px: 1 } }}
                                      />
                                    </Tooltip>
                                  )}
                                  {(file.metadata as Record<string, unknown>)?.processingStatus ===
                                    "PENDING" && (
                                    <Chip
                                      size="small"
                                      icon={<CircularProgress size={12} color="inherit" />}
                                      label={t("contexts.buttons.processing", "Procesando...")}
                                      variant="outlined"
                                      color="warning"
                                      sx={{ height: 20, "& .MuiChip-label": { px: 1 } }}
                                    />
                                  )}
                                  {(file.metadata as Record<string, unknown>)?.processingStatus ===
                                    "FAILED" && (
                                    <Stack
                                      direction="row"
                                      spacing={0.5}
                                      alignItems="center"
                                      component="span"
                                      sx={{ display: "inline-flex", verticalAlign: "middle" }}
                                    >
                                      <Tooltip
                                        title={
                                          ((file.metadata as Record<string, unknown>)
                                            ?.processingError as string) || "Failed"
                                        }
                                      >
                                        <Chip
                                          size="small"
                                          label="Failed"
                                          variant="outlined"
                                          color="error"
                                          sx={{ height: 20, "& .MuiChip-label": { px: 1 } }}
                                        />
                                      </Tooltip>
                                      <Tooltip title={t("contexts.buttons.retry", "Reintentar")}>
                                        <IconButton
                                          size="small"
                                          color="primary"
                                          onClick={() => handleRetryFile(file.id)}
                                          disabled={isRetryingFile}
                                          sx={{ width: 24, height: 24 }}
                                        >
                                          {isRetryingFile ? (
                                            <CircularProgress size={14} color="inherit" />
                                          ) : (
                                            <RefreshIcon sx={{ fontSize: 16 }} />
                                          )}
                                        </IconButton>
                                      </Tooltip>
                                    </Stack>
                                  )}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {file.mimeType} ·{" "}
                                  {file.sizeBytes > 1024 * 1024
                                    ? `${(file.sizeBytes / (1024 * 1024)).toFixed(2)} MB`
                                    : `${(file.sizeBytes / 1024).toFixed(2)} KB`}{" "}
                                  ·{" "}
                                  {t("contexts.files.uploaded", {
                                    timestamp: new Date(file.createdAt).toLocaleString(),
                                  })}
                                </Typography>
                              </Box>
                              <Stack direction="row" spacing={0.5}>
                                <Tooltip title={t("contexts.buttons.view")}>
                                  <IconButton
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/contexts/${contextId}/files/${file.id}`);
                                    }}
                                    size="small"
                                  >
                                    <OpenInNewIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title={t("contexts.buttons.download", "Download")}>
                                  <IconButton
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const link = document.createElement("a");
                                      link.href = file.publicUrl;
                                      link.download = file.fileName;
                                      link.target = "_blank";
                                      document.body.appendChild(link);
                                      link.click();
                                      document.body.removeChild(link);
                                    }}
                                    size="small"
                                  >
                                    <DownloadIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                {(file.metadata as Record<string, unknown>)?.source ===
                                  "WEBSITE_SCRAPE" && (
                                  <Tooltip title="View Scraped URLs">
                                    <IconButton
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const metadata = file.metadata as { urls?: string[] };
                                        if (metadata?.urls?.length) {
                                          setScrapedUrlsDialogOpen(metadata.urls);
                                        }
                                      }}
                                      size="small"
                                    >
                                      <InfoOutlinedIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                                {(file.metadata as Record<string, unknown>)?.source ===
                                  "GITHUB_SYNC" && (
                                  <Tooltip title="Edit or Re-sync Branch">
                                    <IconButton
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const fileMeta = file.metadata as Record<string, unknown>;
                                        const contextMeta = context.metadata as Record<
                                          string,
                                          unknown
                                        >;
                                        setEditGithubRepo({
                                          repoFullName: (fileMeta.repo ||
                                            contextMeta.githubRepoFullName) as string,
                                          installationId: contextMeta.installationId as string,
                                          branch: fileMeta.branch as string,
                                        });
                                      }}
                                      size="small"
                                    >
                                      <EditIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                                <Tooltip title={t("contexts.files.deleteAria")}>
                                  <IconButton
                                    color="error"
                                    size="small"
                                    onClick={() => handleDeleteFile(file.id)}
                                    disabled={isDeletingFile}
                                  >
                                    {isDeletingFile ? (
                                      <CircularProgress size={16} />
                                    ) : (
                                      <DeleteIcon />
                                    )}
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            </Stack>
                          </CardContent>
                        </Card>
                      ))}
                    </Stack>
                  )}
                </Box>
              </Stack>
            </Box>
          ) : null}
        </Box>
      </Box>

      <ConfirmDeletionDialog
        open={deleteConfirmOpen}
        title={t("contexts.dialog.title.delete")}
        entityName={context?.name}
        description={t("contexts.dialog.deleteWarning", { name: context?.name ?? "" })}
        isProcessing={isDeletingContext}
        onConfirm={handleDeleteContext}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <ContextFormDialog
        open={isDialogOpen}
        mode={dialogMode ?? "create"}
        name={dialogName}
        description={dialogDescription}
        color={dialogColor}
        error={dialogError}
        isSubmitting={isDialogSubmitting}
        onChangeName={setDialogName}
        onChangeDescription={setDialogDescription}
        onChangeColor={setDialogColor}
        onSubmit={handleDialogSubmit}
        onClose={closeDialog}
      />

      {contextId && (
        <>
          <GithubRepoSelectDialog
            open={githubDialogOpen}
            contextId={contextId}
            onClose={() => setGithubDialogOpen(false)}
            onSuccess={() => refetch()}
          />
          {editGithubRepo && (
            <GithubBranchEditDialog
              open={Boolean(editGithubRepo)}
              contextId={contextId}
              installationId={editGithubRepo.installationId}
              repoFullName={editGithubRepo.repoFullName}
              currentBranch={editGithubRepo.branch}
              onClose={() => setEditGithubRepo(null)}
              onSuccess={() => refetch()}
            />
          )}
        </>
      )}

      <Backdrop
        sx={{
          color: (theme) => theme.palette.text.primary,
          zIndex: (theme) => theme.zIndex.drawer + 999,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          backgroundColor: (theme) => alpha(theme.palette.background.default, 0.85),
          backdropFilter: "blur(8px)",
        }}
        open={isUploading || isImportingGoogleDrive}
      >
        <CircularProgress color="primary" />
        <Typography variant="h6">Uploading and generating vector embeddings...</Typography>
        <Typography variant="body2" sx={{ opacity: 0.8 }}>
          This may take a minute depending on document size.
        </Typography>
      </Backdrop>
      {contextId && (
        <WebScrapeDialog
          open={webScrapeDialogOpen}
          onClose={() => setWebScrapeDialogOpen(false)}
          contextId={contextId}
        />
      )}
      {contextId && (
        <CreateTextContextDialog
          open={createTextDialogOpen}
          onClose={() => setCreateTextDialogOpen(false)}
          contextId={contextId}
        />
      )}
      <ScrapedUrlsDialog
        urls={scrapedUrlsDialogOpen}
        onClose={() => setScrapedUrlsDialogOpen(null)}
      />
      <ContextInfoDialog open={infoDialogOpen} onClose={() => setInfoDialogOpen(false)} />
      {gitnexusChatRepo && (
        <GitNexusChatDialog
          open={Boolean(gitnexusChatRepo)}
          repoFullName={gitnexusChatRepo}
          onClose={() => setGitnexusChatRepo(null)}
        />
      )}
    </SidebarLayout>
  );
};

export default Contexts;
