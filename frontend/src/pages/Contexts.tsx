import React from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import UploadIcon from "@mui/icons-material/Upload";
import AddIcon from "@mui/icons-material/Add";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import {
  useDeleteContextFileMutation,
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

  const { data: contextsData, isLoading: isListLoading, error: listError } = useListContextsQuery();
  const { data, isLoading, error, refetch } = useGetContextQuery(contextId ?? "", {
    skip: !contextId,
  });

  const [createContext, { isLoading: isCreating }] = useCreateContextMutation();
  const [updateContext, { isLoading: isUpdating }] = useUpdateContextMutation();
  const [uploadContextFile, { isLoading: isUploading }] = useUploadContextFileMutation();
  const [deleteContextFile, { isLoading: isDeletingFile }] = useDeleteContextFileMutation();

  const context = data?.data ?? null;
  const contexts = contextsData?.data?.contexts ?? [];

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
  const dialogTitle =
    dialogMode === "create" ? t("contexts.dialog.title.create") : t("contexts.dialog.title.edit");
  const dialogPrimaryLabel =
    dialogMode === "create"
      ? t("contexts.dialog.primary.create")
      : t("contexts.dialog.primary.save");
  const isDialogSubmitting = dialogMode === "create" ? isCreating : isUpdating;
  const handleDialogSubmit = dialogMode === "create" ? handleCreateContext : handleUpdateContext;
  const handleSelectContext = (id: string) => {
    navigate(`/contexts/${id}`);
  };

  return (
    <SidebarLayout>
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "background.default",
          py: { xs: 4, md: 6 },
        }}
      >
        <Box sx={{ maxWidth: 1200, mx: "auto", px: { xs: 3, md: 6 } }}>
          <Stack spacing={4}>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={{ xs: 2, md: 0 }}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", md: "center" }}
            >
              <Box>
                <Typography variant="h3" sx={{ fontWeight: 700 }}>
                  {t("contexts.heading")}
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
                  {t("contexts.description")}
                </Typography>
              </Box>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={openCreateDialog}
                disabled={isCreating}
                size="large"
              >
                {isCreating ? t("contexts.buttons.creating") : t("contexts.buttons.create")}
              </Button>
            </Stack>

            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    justifyContent="space-between"
                    alignItems={{ xs: "flex-start", sm: "center" }}
                    spacing={{ xs: 1.5, sm: 2 }}
                  >
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        {t("contexts.list.label")}
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {contexts.length === 0
                          ? t("contexts.list.emptyTitle")
                          : t("contexts.list.selectPrompt")}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {t(`contexts.list.count${contexts.length === 1 ? "" : "_plural"}`, {
                        count: contexts.length,
                      })}
                    </Typography>
                  </Stack>
                  {listError ? (
                    <Alert severity="error">{t("contexts.list.error")}</Alert>
                  ) : isListLoading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : contexts.length === 0 ? (
                    <Box
                      sx={{
                        px: 2,
                        py: 8,
                        textAlign: "center",
                        color: "text.secondary",
                        borderRadius: 1,
                        border: (theme) => `1px dashed ${theme.palette.divider}`,
                        display: "flex",
                        justifyContent: "center",
                      }}
                    >
                      <Typography variant="body1" sx={{ maxWidth: 500 }}>
                        {t("contexts.list.emptyDescription")}
                      </Typography>
                    </Box>
                  ) : (
                    <Box
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 1.5,
                      }}
                    >
                      {contexts.map((item) => {
                        const displayName = item.name?.trim() || t("contexts.info.untitled");
                        const colorSwatch = item.color ?? "primary.main";

                        return (
                          <Button
                            key={item.id}
                            variant={item.id === contextId ? "contained" : "outlined"}
                            color={item.id === contextId ? "primary" : "inherit"}
                            onClick={() => handleSelectContext(item.id)}
                            sx={{
                              minWidth: 200,
                              justifyContent: "flex-start",
                              textTransform: "none",
                              px: 2,
                              py: 1.5,
                            }}
                          >
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <Box
                                sx={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: "50%",
                                  bgcolor: colorSwatch,
                                  border: (theme) => `1px solid ${theme.palette.divider}`,
                                }}
                              />
                              <Stack spacing={0.25} alignItems="flex-start">
                                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                  {displayName}
                                </Typography>
                                {item.description ? (
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ display: "block", maxWidth: 220 }}
                                  >
                                    {item.description}
                                  </Typography>
                                ) : null}
                              </Stack>
                            </Stack>
                          </Button>
                        );
                      })}
                    </Box>
                  )}
                </Stack>
              </CardContent>
            </Card>

            {!contextId ? (
              <Box
                sx={{
                  minHeight: { xs: 240, md: 300 },
                  borderRadius: 2,
                  border: (theme) => `1px dashed ${theme.palette.divider}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  color: "text.secondary",
                  px: 4,
                  py: 6,
                }}
              >
                <Typography variant="body1">{t("contexts.placeholders.selectContext")}</Typography>
              </Box>
            ) : isLoading ? (
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                    <CircularProgress />
                  </Box>
                </CardContent>
              </Card>
            ) : error ? (
              <Card variant="outlined">
                <CardContent>
                  <Alert severity="error">{t("contexts.messages.contextError")}</Alert>
                </CardContent>
              </Card>
            ) : context ? (
              <Stack spacing={3}>
                <Card variant="outlined">
                  <CardContent>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={{ xs: 3, sm: 2 }}
                      justifyContent="space-between"
                      alignItems={{ xs: "flex-start", sm: "center" }}
                    >
                      <Stack spacing={1} sx={{ flex: 1 }}>
                        <Button
                          startIcon={<ArrowBackIcon />}
                          onClick={() => navigate("/contexts")}
                          sx={{
                            alignSelf: "flex-start",
                            mb: 0.5,
                            px: 0,
                            justifyContent: "flex-start",
                          }}
                        >
                          {t("contexts.buttons.back")}
                        </Button>
                        <Typography variant="h4" sx={{ fontWeight: 700 }}>
                          {context.name}
                        </Typography>
                        {context.description ? (
                          <Typography variant="body1" color="text.secondary">
                            {context.description}
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            {t("contexts.placeholders.missingDescription")}
                          </Typography>
                        )}
                        <Stack direction="row" spacing={2} color="text.secondary">
                          <Typography variant="body2">
                            {t("contexts.info.updated", {
                              timestamp: new Date(context.updatedAt).toLocaleString(),
                            })}
                          </Typography>
                          {context.color ? (
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Box
                                sx={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: "50%",
                                  bgcolor: context.color,
                                  border: (theme) => `1px solid ${theme.palette.divider}`,
                                }}
                              />
                              <Typography variant="body2">{context.color}</Typography>
                            </Stack>
                          ) : null}
                        </Stack>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                          <Button
                            variant="outlined"
                            startIcon={<EditIcon />}
                            onClick={openEditDialog}
                            disabled={isUpdating}
                          >
                            {isUpdating ? t("contexts.buttons.saving") : t("contexts.buttons.edit")}
                          </Button>
                          <Stack spacing={1} alignItems="flex-start">
                            <Button
                              variant="contained"
                              component="label"
                              startIcon={<UploadIcon />}
                              disabled={isUploading}
                            >
                              {isUploading
                                ? t("contexts.buttons.uploading")
                                : t("contexts.buttons.upload")}
                              <input type="file" hidden onChange={handleFileUpload} />
                            </Button>
                            {uploadError ? (
                              <Alert severity="error" sx={{ width: "100%" }}>
                                {uploadError}
                              </Alert>
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                {t("contexts.placeholders.supportedTypes", {
                                  types: supportedContextLabels,
                                })}
                              </Typography>
                            )}
                          </Stack>
                        </Stack>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>

                <Card variant="outlined">
                  <CardContent>
                    <Stack spacing={2}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
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
                            px: 3,
                            py: 5,
                            textAlign: "center",
                            borderRadius: 1,
                            border: (theme) => `1px dashed ${theme.palette.divider}`,
                            color: "text.secondary",
                          }}
                        >
                          <Typography variant="body2">
                            {t("contexts.placeholders.noFiles")}
                          </Typography>
                        </Box>
                      ) : (
                        <Stack spacing={2}>
                          {context.files.map((file) => (
                            <Card key={file.id} variant="outlined">
                              <CardContent>
                                <Stack
                                  direction={{ xs: "column", sm: "row" }}
                                  spacing={2}
                                  alignItems={{ sm: "center" }}
                                >
                                  <Box sx={{ flexGrow: 1 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                      {file.fileName}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      {file.mimeType} · {(file.sizeBytes / 1024).toFixed(2)} KB
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {t("contexts.files.uploaded", {
                                        timestamp: new Date(file.createdAt).toLocaleString(),
                                      })}
                                    </Typography>
                                  </Box>
                                  <Stack direction="row" spacing={1}>
                                    <Button
                                      variant="outlined"
                                      component="a"
                                      href={file.publicUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {t("contexts.buttons.view")}
                                    </Button>
                                    <IconButton
                                      color="primary"
                                      aria-label={t("contexts.files.renameAria")}
                                      disabled
                                    >
                                      <EditIcon />
                                    </IconButton>
                                    <IconButton
                                      color="error"
                                      aria-label={t("contexts.files.deleteAria")}
                                      onClick={() => handleDeleteFile(file.id)}
                                      disabled={isDeletingFile}
                                    >
                                      {isDeletingFile ? (
                                        <CircularProgress size={20} />
                                      ) : (
                                        <DeleteIcon />
                                      )}
                                    </IconButton>
                                  </Stack>
                                </Stack>
                              </CardContent>
                            </Card>
                          ))}
                        </Stack>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            ) : null}
          </Stack>
        </Box>
      </Box>

      <Dialog open={isDialogOpen} onClose={closeDialog} fullWidth maxWidth="xs">
        <DialogTitle>{dialogTitle}</DialogTitle>
        <DialogContent>
          <Box component="form" sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <TextField
              label={t("contexts.dialog.fields.name")}
              value={dialogName}
              onChange={(event) => setDialogName(event.target.value)}
              required
              autoFocus
            />
            <TextField
              label={t("contexts.dialog.fields.description")}
              value={dialogDescription}
              onChange={(event) => setDialogDescription(event.target.value)}
              multiline
              minRows={2}
            />
            <Stack direction="row" spacing={2} alignItems="center">
              <TextField
                label={t("contexts.dialog.fields.color")}
                type="color"
                value={dialogColor}
                onChange={(event) => setDialogColor(event.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 120 }}
              />
              <Typography variant="body2" color="text.secondary">
                {dialogColor.toUpperCase()}
              </Typography>
            </Stack>
            {dialogError ? (
              <Typography color="error" variant="body2">
                {dialogError}
              </Typography>
            ) : null}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={closeDialog} disabled={isDialogSubmitting}>
            {t("contexts.buttons.cancel")}
          </Button>
          <Button onClick={handleDialogSubmit} variant="contained" disabled={isDialogSubmitting}>
            {isDialogSubmitting
              ? dialogMode === "create"
                ? t("contexts.dialog.primary.creating")
                : t("contexts.dialog.primary.saving")
              : dialogPrimaryLabel}
          </Button>
        </DialogActions>
      </Dialog>
    </SidebarLayout>
  );
};

export default Contexts;
