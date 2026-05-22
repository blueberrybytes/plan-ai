import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import {
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
  CircularProgress,
  Alert,
  alpha,
  Menu,
  MenuItem,
  Stack,
  Backdrop,
} from "@mui/material";
import {
  Add as AddIcon,
  CloudUpload as CloudUploadIcon,
  Public as PublicIcon,
  DriveFileRenameOutline as DriveFileRenameOutlineIcon,
  GitHub as GitHubIcon,
  AddToDrive as AddToDriveIcon,
  Delete as DeleteIcon,
  InsertDriveFile as FileIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  InfoOutlined as InfoOutlinedIcon,
  Edit as EditIcon,
  Visibility as VisibilityIcon,
} from "@mui/icons-material";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { setToastMessage } from "../../store/slices/app/appSlice";
import {
  useGetContextQuery,
  useUploadContextFileMutation,
  useDeleteContextFileMutation,
  useRetryContextFileMutation,
  useImportFromGoogleDriveMutation,
} from "../../store/apis/contextApi";
import { useListIntegrationsQuery } from "../../store/apis/integrationApi";
import { useGooglePicker } from "../../hooks/useGooglePicker";

import WebScrapeDialog from "./WebScrapeDialog";
import CreateTextContextDialog from "./CreateTextContextDialog";
import ScrapedUrlsDialog from "./ScrapedUrlsDialog";
import GithubRepoSelectDialog from "./GithubRepoSelectDialog";
import GithubBranchEditDialog from "./GithubBranchEditDialog";
import GitNexusChatDialog from "./GitNexusChatDialog";

interface ProjectFilesTabProps {
  projectId: string;
  contextId: string;
}

const ProjectFilesTab: React.FC<ProjectFilesTabProps> = ({ projectId, contextId }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [pollingInterval, setPollingInterval] = useState(0);
  const {
    data: contextResponse,
    isLoading,
    refetch,
  } = useGetContextQuery(contextId, {
    skip: !contextId,
    pollingInterval,
  });

  const context = contextResponse?.data ?? null;
  const files = useMemo(() => context?.files ?? [], [context?.files]);

  useEffect(() => {
    const syncStatus = context?.metadata
      ? (context.metadata as Record<string, unknown>).syncStatus
      : null;
    const hasPendingFiles = files.some(
      (f) =>
        f.metadata &&
        typeof f.metadata === "object" &&
        (f.metadata as Record<string, unknown>).processingStatus === "PENDING",
    );
    setPollingInterval(syncStatus === "SYNCING" || hasPendingFiles ? 2000 : 0);
  }, [context, files]);

  const [uploadFile, { isLoading: isUploading }] = useUploadContextFileMutation();
  const [deleteFile, { isLoading: isDeletingFile }] = useDeleteContextFileMutation();
  const [retryFile] = useRetryContextFileMutation();
  const [importFromGoogleDrive, { isLoading: isImportingGoogleDrive }] =
    useImportFromGoogleDriveMutation();

  const { data: integrationsData } = useListIntegrationsQuery();
  const hasGoogleDrive = React.useMemo(
    () =>
      integrationsData?.data?.some(
        (i) => i.provider === "GOOGLE_DRIVE" && i.status === "CONNECTED",
      ),
    [integrationsData],
  );
  const { loadPicker, openPicker } = useGooglePicker();

  useEffect(() => {
    loadPicker();
  }, [loadPicker]);

  const [error, setError] = useState<string | null>(null);
  const [addMenuAnchorEl, setAddMenuAnchorEl] = useState<null | HTMLElement>(null);

  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const [webScrapeDialogOpen, setWebScrapeDialogOpen] = useState(false);
  const [createTextDialogOpen, setCreateTextDialogOpen] = useState(false);
  const [scrapedUrlsDialogOpen, setScrapedUrlsDialogOpen] = useState<string[] | null>(null);
  const [editGithubRepo, setEditGithubRepo] = useState<{
    repoFullName: string;
    installationId: string;
    branch?: string;
  } | null>(null);
  const [gitnexusChatRepo, setGitnexusChatRepo] = useState<string | null>(null);

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

  const uploadFileTask = useCallback(
    async (file: File) => {
      try {
        if (
          !SUPPORTED_CONTEXT_TYPES.some(
            (type) => file.type === type || file.type.startsWith("text/"),
          )
        ) {
          setError(t("contexts.messages.unsupportedFile", { types: supportedContextLabels }));
          return;
        }

        setError(null);
        await uploadFile({ contextId, file }).unwrap();
        await refetch();
        dispatch(
          setToastMessage({
            severity: "success",
            message: t("contexts.messages.uploadProcessing", "Procesando en segundo plano..."),
          }),
        );
      } catch (err: unknown) {
        console.error("Failed to upload context file", err);
        setError(err instanceof Error ? err.message : `Failed to upload ${file.name}`);
        dispatch(
          setToastMessage({
            severity: "error",
            message: t("contexts.messages.uploadError", "Error al subir"),
          }),
        );
      }
    },
    [SUPPORTED_CONTEXT_TYPES, uploadFile, contextId, refetch, dispatch, t],
  );

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
    const file = event.target.files[0];
    await uploadFileTask(file);
    event.target.value = "";
  };

  const handleDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setError(null);
      if (!acceptedFiles.length) return;
      for (const file of acceptedFiles) {
        await uploadFileTask(file);
      }
    },
    [uploadFileTask],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    noClick: true,
    noKeyboard: true,
  });

  const handleDelete = async (fileId: string) => {
    setError(null);
    try {
      await deleteFile({ contextId, fileId }).unwrap();
      await refetch();
      dispatch(
        setToastMessage({
          severity: "success",
          message: t("contexts.messages.deleteSuccess", "Eliminado correctamente"),
        }),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete file");
    }
  };

  const handleRetry = async (fileId: string) => {
    setError(null);
    try {
      await retryFile({ contextId, fileId }).unwrap();
      dispatch(
        setToastMessage({
          severity: "success",
          message: t("contexts.messages.uploadProcessing", "Procesando en segundo plano..."),
        }),
      );
      refetch();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to retry file");
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

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ py: 2 }}>
      {context?.metadata &&
        (context.metadata as Record<string, unknown>).syncStatus === "SYNCING" && (
          <Alert severity="info" icon={<CircularProgress size={20} />} sx={{ mb: 3 }}>
            GitHub Repository (
            {(context.metadata as Record<string, unknown>).githubRepoFullName as string}) is
            currently syncing in the background. Please wait...
          </Alert>
        )}

      {/* Actions */}
      <Stack direction="row" spacing={1} sx={{ mb: 3 }} justifyContent="flex-end">
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={(e) => setAddMenuAnchorEl(e.currentTarget)}
          disabled={isUploading || isImportingGoogleDrive}
        >
          {t("contexts.buttons.addFiles", "Add Data...")}
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
                ? t("contexts.buttons.uploading", "Uploading...")
                : t("contexts.buttons.upload", "Upload File")}
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
            <ListItemText>{t("contexts.buttons.importWebsite", "Import Website")}</ListItemText>
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
            <ListItemText>{t("contexts.buttons.writeText", "Write Text Manually...")}</ListItemText>
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
            <ListItemText>{t("contexts.buttons.syncGithub", "Sync GitHub")}</ListItemText>
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
        </Menu>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
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
          transition: "all 0.2s ease",
          "&:hover": {
            borderColor: "primary.main",
            bgcolor: "action.hover",
          },
        }}
      >
        <input {...getInputProps()} />
        <CloudUploadIcon color={isDragActive ? "primary" : "action"} sx={{ fontSize: 40, mb: 1 }} />
        <Typography
          variant="body1"
          fontWeight={600}
          color={isDragActive ? "primary.main" : "text.primary"}
        >
          {isDragActive ? "Drop files here..." : "Drag & drop files here, or use 'Add Files' menu"}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          {supportedContextLabels}
        </Typography>
      </Box>

      {/* Files List */}
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6" fontWeight={600}>
            {t("contexts.files.title", "Files")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t(`contexts.files.count${files.length === 1 ? "" : "_plural"}`, {
              count: files.length,
              defaultValue: `${files.length} files`,
            })}
          </Typography>
        </Stack>

        {files.length === 0 ? (
          <Box
            sx={{
              py: 6,
              textAlign: "center",
              bgcolor: "background.paper",
              borderRadius: 2,
              border: 1,
              borderColor: "divider",
            }}
          >
            <FileIcon sx={{ fontSize: 48, color: "text.disabled", mb: 2 }} />
            <Typography variant="body1" color="text.secondary">
              {t("contexts.files.empty", "No files uploaded yet")}
            </Typography>
          </Box>
        ) : (
          <List dense disablePadding>
            {files.map((file) => {
              const fileMeta = file.metadata as Record<string, unknown> | null;
              const status = fileMeta?.status as string | undefined;
              const failed = status === "FAILED";
              const contextMeta = context?.metadata as Record<string, unknown>;

              return (
                <ListItem
                  key={file.id}
                  sx={{
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    mb: 1,
                    bgcolor: "background.paper",
                  }}
                  secondaryAction={
                    <Box sx={{ display: "flex", gap: 0.5 }}>
                      <Tooltip title="View File">
                        <IconButton
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/projects/${projectId}/files/${file.id}`);
                          }}
                          size="small"
                        >
                          <VisibilityIcon fontSize="small" />
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
                      {fileMeta?.source === "WEBSITE_SCRAPE" && (
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
                      {fileMeta?.source === "GITHUB_SYNC" && (
                        <Tooltip title="Edit or Re-sync Branch">
                          <IconButton
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditGithubRepo({
                                repoFullName: (fileMeta.repo ||
                                  contextMeta?.githubRepoFullName) as string,
                                installationId: contextMeta?.installationId as string,
                                branch: fileMeta.branch as string,
                              });
                            }}
                            size="small"
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {failed && (
                        <Tooltip title="Retry processing">
                          <IconButton size="small" onClick={() => handleRetry(file.id)}>
                            <RefreshIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(file.id)}
                          disabled={isDeletingFile}
                        >
                          {isDeletingFile ? (
                            <CircularProgress size={16} />
                          ) : (
                            <DeleteIcon fontSize="small" />
                          )}
                        </IconButton>
                      </Tooltip>
                    </Box>
                  }
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <FileIcon fontSize="small" color={failed ? "error" : "primary"} />
                  </ListItemIcon>
                  <ListItemText
                    primary={file.fileName}
                    secondary={
                      <Box component="span" sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                        <Typography component="span" variant="caption" color="text.secondary">
                          {(file.sizeBytes / 1024).toFixed(1)} KB
                        </Typography>
                        <Typography component="span" variant="caption" color="text.secondary">
                          ·
                        </Typography>
                        <Typography component="span" variant="caption" color="text.secondary">
                          {formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}
                        </Typography>
                        {failed && (
                          <>
                            <Typography component="span" variant="caption" color="text.secondary">
                              ·
                            </Typography>
                            <Typography component="span" variant="caption" color="error.main">
                              Processing failed
                            </Typography>
                          </>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        )}
      </Box>

      {/* Dialogs */}
      <WebScrapeDialog
        open={webScrapeDialogOpen}
        onClose={() => setWebScrapeDialogOpen(false)}
        contextId={contextId}
      />
      <CreateTextContextDialog
        open={createTextDialogOpen}
        onClose={() => setCreateTextDialogOpen(false)}
        contextId={contextId}
      />
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
      <ScrapedUrlsDialog
        urls={scrapedUrlsDialogOpen}
        onClose={() => setScrapedUrlsDialogOpen(null)}
      />
      {gitnexusChatRepo && (
        <GitNexusChatDialog
          open={Boolean(gitnexusChatRepo)}
          repoFullName={gitnexusChatRepo}
          onClose={() => setGitnexusChatRepo(null)}
        />
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
    </Box>
  );
};

export default ProjectFilesTab;
