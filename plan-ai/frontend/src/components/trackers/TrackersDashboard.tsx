import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add as AddIcon, SettingsOutlined as SettingsIcon } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import {
  useGetTrackerStatsQuery,
  useListTrackerEntriesQuery,
  useListTrackersQuery,
  useUpdateTrackerMutation,
  type Tracker,
} from "../../store/apis/trackersApi";
import PersonalSettingsDialog from "../personal/PersonalSettingsDialog";
import PendingProposals from "./PendingProposals";
import QuickLogInput from "./QuickLogInput";
import TrackerFormDialog from "./TrackerFormDialog";
import TrackerGrid from "./TrackerGrid";
import TrackerHistoryDialog from "./TrackerHistoryDialog";
import TrackersEmptyState from "./TrackersEmptyState";
import TrackersFooter from "./TrackersFooter";
import type { TrackerPresetId } from "./trackerPresets";
import { apiErrorCode, localToday } from "./trackerUtils";
import { useTrackerToast } from "./useTrackerToast";

interface TrackersDashboardProps {
  hideCalories: boolean;
  /** A tracker route answered consent_outdated. */
  onConsentOutdated: () => void;
}

interface FormTarget {
  key: number;
  tracker: Tracker | null;
  preset?: TrackerPresetId;
}

/** Quick log, proposals and one card per tracker. */
const TrackersDashboard: React.FC<TrackersDashboardProps> = ({
  hideCalories,
  onConsentOutdated,
}) => {
  const { t } = useTranslation();
  const toast = useTrackerToast();
  const today = useMemo(() => localToday(), []);
  const [showArchived, setShowArchived] = useState(false);
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [historyTracker, setHistoryTracker] = useState<Tracker | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [foodDatabase, setFoodDatabase] = useState<boolean | null>(null);

  const trackersQuery = useListTrackersQuery(showArchived ? { includeArchived: true } : undefined);
  const { data: stats = [] } = useGetTrackerStatsQuery({ today });
  const { data: todayEntries = [] } = useListTrackerEntriesQuery({
    from: today,
    to: today,
    status: "CONFIRMED",
  });
  const [updateTracker] = useUpdateTrackerMutation();
  const trackers = trackersQuery.data ?? [];
  const hasActive = trackers.some((tracker) => !tracker.archived);

  useEffect(() => {
    if (apiErrorCode(trackersQuery.error) === "consent_outdated") onConsentOutdated();
  }, [trackersQuery.error, onConsentOutdated]);

  const openForm = (tracker: Tracker | null, preset?: TrackerPresetId) =>
    setFormTarget({ key: Date.now(), tracker, preset });

  const restore = async (tracker: Tracker) => {
    try {
      await updateTracker({ id: tracker.id, patch: { archived: false } }).unwrap();
      toast.success("trackers.toast.restored");
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {t("trackers.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("trackers.subtitle")}
          </Typography>
        </Box>
        <Tooltip title={t("personal.settings.title")}>
          <IconButton
            aria-label={t("personal.settings.title")}
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon />
          </IconButton>
        </Tooltip>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => openForm(null)}>
          {t("trackers.newTracker")}
        </Button>
      </Box>

      {hasActive && <QuickLogInput onResult={(result) => setFoodDatabase(result.foodDatabase)} />}
      <PendingProposals hideCalories={hideCalories} />

      {trackersQuery.isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : trackers.length === 0 && !showArchived ? (
        <TrackersEmptyState onPick={(preset) => openForm(null, preset.id)} />
      ) : (
        <TrackerGrid
          trackers={trackers}
          stats={stats}
          todayEntries={todayEntries}
          hideCalories={hideCalories}
          onEdit={(tracker) => openForm(tracker)}
          onHistory={setHistoryTracker}
          onRestore={(tracker) => void restore(tracker)}
        />
      )}

      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 240 }}>
          <TrackersFooter foodDatabase={foodDatabase} />
        </Box>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
          }
          label={<Typography variant="body2">{t("trackers.showArchived")}</Typography>}
        />
      </Box>

      {formTarget && (
        <TrackerFormDialog
          key={formTarget.key}
          open
          tracker={formTarget.tracker}
          initialPreset={formTarget.preset}
          onClose={() => setFormTarget(null)}
        />
      )}
      <TrackerHistoryDialog
        tracker={historyTracker}
        hideCalories={hideCalories}
        onClose={() => setHistoryTracker(null)}
      />
      <PersonalSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Stack>
  );
};

export default TrackersDashboard;
