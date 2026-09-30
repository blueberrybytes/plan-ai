import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  AuditLogEntryResponse,
  useLazyGetWorkspaceAuditLogQuery,
} from "../../../store/apis/workspaceApi";
import {
  AUDIT_ACTION_GROUPS,
  auditActionLabelKey,
  buildAuditCsv,
  formatAuditDetails,
  formatAuditTarget,
} from "./auditLogFormat";
import { downloadTextFile, fileSafeName } from "../../../utils/downloadFile";
import { reportUnexpectedError } from "../../../utils/reportError";

const PAGE_SIZE = 50;

interface AuditLogPanelProps {
  workspaceName: string;
}

/** Audit log of the active workspace: filter by action, load older pages, export as CSV. */
const AuditLogPanel: React.FC<AuditLogPanelProps> = ({ workspaceName }) => {
  const { t } = useTranslation();
  const [actionGroup, setActionGroup] = useState("");
  const [entries, setEntries] = useState<AuditLogEntryResponse[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [fetchPage, { isFetching }] = useLazyGetWorkspaceAuditLogQuery();
  // Ignores answers to an older request when the filter changes quickly.
  const requestId = useRef(0);

  const loadPage = useCallback(
    async (cursor?: string) => {
      const id = ++requestId.current;
      setHasError(false);
      try {
        const page = await fetchPage({
          limit: PAGE_SIZE,
          cursor,
          action: actionGroup ? `${actionGroup}.` : undefined,
        }).unwrap();
        if (id !== requestId.current) return;
        setEntries((previous) => (cursor ? [...previous, ...page.entries] : page.entries));
        setNextCursor(page.nextCursor);
      } catch (error) {
        reportUnexpectedError("workspace.auditLog", error);
        if (id === requestId.current) setHasError(true);
      }
    },
    [fetchPage, actionGroup],
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const actionLabel = (action: string): string => {
    const key = auditActionLabelKey(action);
    return key ? t(key) : action;
  };

  const actorLabel = (entry: AuditLogEntryResponse): string =>
    entry.actorEmail || entry.actorUserId || t("workspaceSecurity.auditLog.system");

  const handleDownloadCsv = () => {
    const csv = buildAuditCsv(entries, {
      headers: [
        t("workspaceSecurity.auditLog.columns.time"),
        t("workspaceSecurity.auditLog.columns.who"),
        t("workspaceSecurity.auditLog.columns.action"),
        t("workspaceSecurity.auditLog.columns.target"),
        t("workspaceSecurity.auditLog.columns.details"),
      ],
      actionLabel,
      actorLabel,
    });
    const date = format(new Date(), "yyyy-MM-dd");
    downloadTextFile(
      `audit-log-${fileSafeName(workspaceName)}-${date}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  };

  return (
    <Paper elevation={1} sx={{ p: 3 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 2,
          flexWrap: "wrap",
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="h6">{t("workspaceSecurity.auditLog.title")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t("workspaceSecurity.auditLog.description")}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="audit-action-filter">
              {t("workspaceSecurity.auditLog.filterLabel")}
            </InputLabel>
            <Select
              labelId="audit-action-filter"
              label={t("workspaceSecurity.auditLog.filterLabel")}
              value={actionGroup}
              onChange={(event) => setActionGroup(event.target.value)}
            >
              <MenuItem value="">{t("workspaceSecurity.auditLog.filterAll")}</MenuItem>
              {AUDIT_ACTION_GROUPS.map((group) => (
                <MenuItem key={group} value={group}>
                  {t(`workspaceSecurity.auditLog.groups.${group}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleDownloadCsv}
            disabled={entries.length === 0}
          >
            {t("workspaceSecurity.auditLog.downloadCsv")}
          </Button>
        </Box>
      </Box>

      {hasError ? (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => void loadPage()}>
              {t("workspaceSecurity.auditLog.retry")}
            </Button>
          }
        >
          {t("workspaceSecurity.auditLog.loadFailed")}
        </Alert>
      ) : null}

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t("workspaceSecurity.auditLog.columns.time")}</TableCell>
              <TableCell>{t("workspaceSecurity.auditLog.columns.who")}</TableCell>
              <TableCell>{t("workspaceSecurity.auditLog.columns.action")}</TableCell>
              <TableCell>{t("workspaceSecurity.auditLog.columns.target")}</TableCell>
              <TableCell>{t("workspaceSecurity.auditLog.columns.details")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  {format(new Date(entry.createdAt), "yyyy-MM-dd HH:mm")}
                </TableCell>
                <TableCell>{actorLabel(entry)}</TableCell>
                <TableCell>{actionLabel(entry.action)}</TableCell>
                <TableCell sx={{ wordBreak: "break-all" }}>{formatAuditTarget(entry)}</TableCell>
                <TableCell sx={{ wordBreak: "break-word", maxWidth: 360 }}>
                  {formatAuditDetails(entry.metadata)}
                </TableCell>
              </TableRow>
            ))}
            {!isFetching && !hasError && entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    {t("workspaceSecurity.auditLog.empty")}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ display: "flex", justifyContent: "center", mt: 2, minHeight: 40 }}>
        {isFetching ? (
          <CircularProgress size={24} />
        ) : nextCursor ? (
          <Button onClick={() => void loadPage(nextCursor)}>
            {t("workspaceSecurity.auditLog.loadMore")}
          </Button>
        ) : null}
      </Box>
    </Paper>
  );
};

export default AuditLogPanel;
