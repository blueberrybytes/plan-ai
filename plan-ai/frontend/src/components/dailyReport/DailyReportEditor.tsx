import React, { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, CircularProgress, Paper, TextField, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { useGetPeriodNoteQuery, useUpdateNoteMutation, type Note } from "../../store/apis/notesApi";
import { dailyReportApi, useExtractDailyReportMutation } from "../../store/apis/dailyReportApi";
import { useDispatch } from "react-redux";
import { localDateKey } from "../notes/noteUtils";
import { apiErrorCode, useDailyReportToast } from "./useDailyReportToast";

/**
 * Today's report is the member's day note, the same one the Notes page and
 * the phone show. Saving and reading it asks the AI for task changes.
 */
const DailyReportEditor: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const toast = useDailyReportToast();
  const today = useMemo(() => localDateKey(), []);
  // Always refetched on mount: the cached copy can be older than the last save.
  const {
    data: loaded,
    isFetching,
    isError,
    refetch,
  } = useGetPeriodNoteQuery({ period: "DAY", date: today }, { refetchOnMountOrArgChange: true });
  const [updateNote, { isLoading: saving }] = useUpdateNoteMutation();
  const [extract, { isLoading: reading }] = useExtractDailyReportMutation();
  const [note, setNote] = useState<Note | null>(null);
  const [body, setBody] = useState("");
  const [missingKey, setMissingKey] = useState(false);

  // A fresh copy from the server replaces the text only when it is newer.
  useEffect(() => {
    if (isFetching || !loaded) return;
    if (!note || loaded.version > note.version || loaded.id !== note.id) {
      setNote(loaded);
      setBody(loaded.body);
    }
  }, [loaded, note, isFetching]);

  const dirty = !!note && body !== note.body;
  const locale = i18n.language.startsWith("es") ? es : enUS;

  const save = async (): Promise<Note | null> => {
    if (!note) return null;
    if (!dirty) return note;
    try {
      const saved = await updateNote({
        id: note.id,
        patch: { body, baseVersion: note.version },
      }).unwrap();
      setNote(saved);
      return saved;
    } catch (error) {
      if ((error as { status?: unknown })?.status === 409) {
        const current = (error as { data?: { current?: Note | null } }).data?.current;
        if (current) {
          setNote(current);
          setBody(current.body);
        } else {
          void refetch();
        }
        toast.show("info", t("dailyReport.editor.conflict"));
      } else {
        toast.error(error, "dailyReport.editor.saveError", "dailyReport.save");
      }
      return null;
    }
  };

  const saveOnly = async () => {
    if (await save()) toast.show("success", t("dailyReport.editor.saved"));
  };

  const saveAndRead = async () => {
    if (!body.trim()) {
      toast.show("info", t("dailyReport.editor.empty"));
      return;
    }
    const saved = await save();
    if (!saved) return;
    setMissingKey(false);
    try {
      const result = await extract(saved.id).unwrap();
      if (result.proposals.length === 0) {
        toast.show(
          "info",
          t(
            result.skipped === "unchanged"
              ? "dailyReport.editor.unchanged"
              : "dailyReport.editor.noProposals",
          ),
        );
      }
    } catch (error) {
      const code = apiErrorCode(error);
      if (code === "missing_api_key") setMissingKey(true);
      else if (code?.startsWith("daily_report_")) {
        dispatch(dailyReportApi.util.invalidateTags(["DailyReportStatus"]));
      } else toast.error(error, "dailyReport.proposals.error", "dailyReport.extract");
    }
  };

  if (isFetching && !note) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }
  if (isError || !note) return <Alert severity="error">{t("dailyReport.loadError")}</Alert>;

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {t("dailyReport.editor.title", {
          date: format(new Date(`${today}T12:00:00`), "EEEE d MMMM", { locale }),
        })}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {t("dailyReport.editor.hint")}
      </Typography>
      <TextField
        multiline
        minRows={6}
        maxRows={20}
        fullWidth
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={t("dailyReport.editor.placeholder")}
        sx={{ mt: 1.5 }}
        inputProps={{ maxLength: 100000 }}
      />
      {missingKey && (
        <Alert
          severity="warning"
          sx={{ mt: 1.5 }}
          action={
            <Button color="inherit" size="small" onClick={() => navigate("/team?tab=settings")}>
              {t("dailyReport.missingKeyAction")}
            </Button>
          }
        >
          {t("dailyReport.missingKey")}
        </Alert>
      )}
      <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end", mt: 1.5, flexWrap: "wrap" }}>
        <Button onClick={() => void saveOnly()} disabled={!dirty || saving || reading}>
          {t("dailyReport.editor.save")}
        </Button>
        <Button
          variant="contained"
          onClick={() => void saveAndRead()}
          disabled={saving || reading}
          startIcon={reading ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {reading ? t("dailyReport.editor.reading") : t("dailyReport.editor.saveAndRead")}
        </Button>
      </Box>
    </Paper>
  );
};

export default DailyReportEditor;
