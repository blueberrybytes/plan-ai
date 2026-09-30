import React, { useMemo, useState } from "react";
import { Box, Button, Divider, Paper, Typography } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { format } from "date-fns";
import {
  WorkspaceResponse,
  useGetWorkspaceMembersQuery,
  workspaceApi,
} from "../../../store/apis/workspaceApi";
import { setToastMessage } from "../../../store/slices/app/appSlice";
import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import { apiErrorMessage } from "../../../utils/apiError";
import { reportUnexpectedError } from "../../../utils/reportError";
import { downloadTextFile, fileSafeName } from "../../../utils/downloadFile";
import TransferOwnershipDialog from "./TransferOwnershipDialog";
import DeleteWorkspaceDialog from "./DeleteWorkspaceDialog";

interface WorkspaceDataPanelProps {
  workspace: WorkspaceResponse;
}

const ActionRow: React.FC<{
  title: string;
  description: string;
  action: React.ReactNode;
}> = ({ title, description, action }) => (
  <Box
    sx={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 2,
      flexWrap: "wrap",
      py: 2,
    }}
  >
    <Box sx={{ flex: "1 1 320px" }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>
    </Box>
    {action}
  </Box>
);

/** Owner-only actions: export everything, hand the workspace over, delete it. */
const WorkspaceDataPanel: React.FC<WorkspaceDataPanelProps> = ({ workspace }) => {
  const { t } = useTranslation();
  // Thunk-aware dispatch, to run an RTK Query endpoint once without subscribing to it.
  const dispatch = useDispatch<ThunkDispatch<unknown, unknown, UnknownAction>>();
  const [isExporting, setIsExporting] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { data: team } = useGetWorkspaceMembersQuery();

  const transferCandidates = useMemo(
    () =>
      (team?.members ?? []).filter(
        (member) => member.status === "ACTIVE" && member.role !== "OWNER" && !!member.userId,
      ),
    [team],
  );

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Not subscribed, so the export leaves the cache as soon as it is saved.
      const data = await dispatch(
        workspaceApi.endpoints.exportWorkspaceData.initiate(undefined, {
          forceRefetch: true,
          subscribe: false,
        }),
      ).unwrap();
      const date = format(new Date(), "yyyy-MM-dd");
      downloadTextFile(
        `${fileSafeName(workspace.name)}-export-${date}.json`,
        JSON.stringify(data, null, 2),
        "application/json",
      );
      dispatch(
        setToastMessage({ severity: "success", message: t("workspaceSecurity.data.export.done") }),
      );
    } catch (error) {
      // Also catches a failure to build or save the file, which is always unexpected.
      reportUnexpectedError("workspace.export", error, { workspaceId: workspace.id });
      dispatch(
        setToastMessage({
          severity: "error",
          message: apiErrorMessage(error, t("workspaceSecurity.data.export.failed")),
        }),
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Paper elevation={1} sx={{ p: 3 }}>
      <Typography variant="h6">{t("workspaceSecurity.data.title")}</Typography>

      <ActionRow
        title={t("workspaceSecurity.data.export.title")}
        description={t("workspaceSecurity.data.export.description")}
        action={
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => void handleExport()}
            disabled={isExporting}
          >
            {t("workspaceSecurity.data.export.button")}
          </Button>
        }
      />
      <Divider />
      <ActionRow
        title={t("workspaceSecurity.data.transfer.title")}
        description={t("workspaceSecurity.data.transfer.description")}
        action={
          <Button
            variant="outlined"
            color="warning"
            startIcon={<SwapHorizIcon />}
            onClick={() => setTransferOpen(true)}
          >
            {t("workspaceSecurity.data.transfer.button")}
          </Button>
        }
      />
      <Divider />
      <ActionRow
        title={t("workspaceSecurity.data.delete.title")}
        description={t("workspaceSecurity.data.delete.description")}
        action={
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteForeverIcon />}
            onClick={() => setDeleteOpen(true)}
          >
            {t("workspaceSecurity.data.delete.button")}
          </Button>
        }
      />

      <TransferOwnershipDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        candidates={transferCandidates}
      />
      <DeleteWorkspaceDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        workspaceId={workspace.id}
        workspaceName={workspace.name}
      />
    </Paper>
  );
};

export default WorkspaceDataPanel;
