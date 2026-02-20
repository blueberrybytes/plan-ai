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
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import UploadIcon from "@mui/icons-material/Upload";
import AddIcon from "@mui/icons-material/Add";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import ContextFormDialog from "../components/context/ContextFormDialog";
import ConfirmDeletionDialog from "../components/dialogs/ConfirmDeletionDialog";
import {
  useDeleteContextFileMutation,
  useDeleteContextMutation,
  useGetContextQuery,
  useCreateContextMutation,
  useUpdateContextMutation,
  useUploadContextFileMutation,
  useListContextsQuery,
} from "../store/apis/contextApi";
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
  } = useListContextsQuery();
  const { data, isLoading, error, refetch } = useGetContextQuery(contextId ?? "", {
    skip: !contextId,
  });

  const [createContext, { isLoading: isCreating }] = useCreateContextMutation();
  const [updateContext, { isLoading: isUpdating }] = useUpdateContextMutation();
  const [deleteContext, { isLoading: isDeletingContext }] = useDeleteContextMutation();
  const [uploadContextFile, { isLoading: isUploading }] = useUploadContextFileMutation();
  const [deleteContextFile, { isLoading: isDeletingFile }] = useDeleteContextFileMutation();

  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deletedContextId, setDeletedContextId] = React.useState<string | null>(null);

  const context = data?.data ?? null;
  const contexts = React.useMemo(() => contextsData?.data?.contexts ?? [], [contextsData]);

  // Auto-select first context if none selected, but never re-select a just-deleted one
  React.useEffect(() => {
    if (!isListLoading && contexts.length > 0 && !contextId) {
      const next = contexts.find((c) => c.id !== deletedContextId);
      if (next) {
        setDeletedContextId(null);
        navigate(`/contexts/${next.id}`, { replace: true });
      }
    }
  }, [isListLoading, contexts, contextId, navigate, deletedContextId]);

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
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/csv",
      "application/json",
      "application/xml",
    ],
    [],
  );

  const supportedContextLabels = "PDF, DOCX, TXT, CSV, JSON, XML";

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!contextId || !event.target.files || event.target.files.length === 0) {
      return;
    }

    const file = event.target.files[0];

    try {
      if (
        !SUPPORTED_CONTEXT_TYPES.some((type) => file.type === type || file.type.startsWith("text/"))
      ) {
        setUploadError(t("contexts.messages.unsupportedFile", { types: supportedContextLabels }));
        return;
      }

      setUploadError(null);
      await uploadContextFile({ contextId, file }).unwrap();
      await refetch();
      dispatch(
        setToastMessage({
          severity: "success",
          message: t("contexts.messages.uploadSuccess"),
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
    } finally {
      event.target.value = "";
    }
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
      <Box sx={{ display: "flex", height: "100%", overflow: "hidden" }}>
        {/* ── Left panel: context list ── */}
        <Box
          sx={{
            width: 280,
            flexShrink: 0,
            borderRight: 1,
            borderColor: "divider",
            overflow: "hidden",
            bgcolor: "background.paper",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
            <Typography variant="h6" fontWeight={700}>
              {t("contexts.heading")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t(`contexts.list.count${contexts.length === 1 ? "" : "_plural"}`, {
                count: contexts.length,
              })}
            </Typography>
          </Box>

          {/* List */}
          <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0, px: 1.5, py: 1.5 }}>
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

          {/* New context button pinned at bottom */}
          <Box sx={{ p: 1.5, borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
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
        </Box>

        {/* ── Right panel: context detail ── */}
        <Box sx={{ flex: 1, overflowY: "auto", bgcolor: "background.default" }}>
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
            <Box sx={{ maxWidth: 860, mx: "auto", px: { xs: 3, md: 5 }, py: 5 }}>
              <Stack spacing={4}>
                {/* Context header */}
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
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
                    <Typography variant="caption" color="text.disabled">
                      {t("contexts.info.updated", {
                        timestamp: new Date(context.updatedAt).toLocaleString(),
                      })}
                    </Typography>
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
                      component="label"
                      startIcon={<UploadIcon />}
                      disabled={isUploading}
                    >
                      {isUploading ? t("contexts.buttons.uploading") : t("contexts.buttons.upload")}
                      <input type="file" hidden onChange={handleFileUpload} />
                    </Button>
                  </Stack>
                </Stack>

                {uploadError && (
                  <Alert severity="error" onClose={() => setUploadError(null)}>
                    {uploadError}
                  </Alert>
                )}

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
                    </Box>
                  ) : (
                    <Stack spacing={1.5}>
                      {context.files.map((file) => (
                        <Card key={file.id} variant="outlined">
                          <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                            <Stack direction="row" spacing={2} alignItems="center">
                              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                <Typography variant="subtitle2" fontWeight={600} noWrap>
                                  {file.fileName}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {file.mimeType} · {(file.sizeBytes / 1024).toFixed(2)} KB ·{" "}
                                  {t("contexts.files.uploaded", {
                                    timestamp: new Date(file.createdAt).toLocaleString(),
                                  })}
                                </Typography>
                              </Box>
                              <Stack direction="row" spacing={0.5}>
                                <Tooltip title={t("contexts.buttons.view")}>
                                  <IconButton
                                    component="a"
                                    href={file.publicUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    size="small"
                                  >
                                    <OpenInNewIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
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
    </SidebarLayout>
  );
};

export default Contexts;
