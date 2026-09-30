import React, { useCallback, useEffect, useState } from "react";
import { Box, CircularProgress } from "@mui/material";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import PersonalConsentDialog from "../components/personal/PersonalConsentDialog";
import PersonalGateMessage from "../components/personal/PersonalGateMessage";
import { usePersonalMode } from "../components/personal/usePersonalMode";
import { useSwitchToPersonal } from "../components/personal/useSwitchToPersonal";
import TrackersDashboard from "../components/trackers/TrackersDashboard";

/** Trackers of the personal workspace. Needs personal mode and current consent. */
const Trackers: React.FC = () => {
  const { t } = useTranslation();
  const { status, isLoading, isError, refetch, inPersonalWorkspace, hideCalories } =
    usePersonalMode();
  const switchToPersonal = useSwitchToPersonal();
  const [consentOpen, setConsentOpen] = useState(false);
  // A tracker route refused with consent_outdated before the status caught up.
  const [consentBlocked, setConsentBlocked] = useState(false);

  const needsConsent = Boolean(
    status && (!status.enabled || status.consentOutdated || consentBlocked),
  );

  useEffect(() => {
    if (needsConsent) setConsentOpen(true);
  }, [needsConsent]);

  const handleConsentOutdated = useCallback(() => {
    setConsentBlocked(true);
    void refetch();
  }, [refetch]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      );
    }
    if (isError || !status?.available) return <Navigate to="/home" replace />;
    if (needsConsent) {
      return (
        <PersonalGateMessage
          title={t(status.enabled ? "trackers.gate.outdatedTitle" : "trackers.gate.consentTitle")}
          body={t(status.enabled ? "trackers.gate.outdatedBody" : "trackers.gate.consentBody")}
          actionLabel={t("trackers.gate.consentAction")}
          onAction={() => setConsentOpen(true)}
        />
      );
    }
    if (!inPersonalWorkspace) {
      return (
        <PersonalGateMessage
          title={t("trackers.gate.switchTitle")}
          body={t("trackers.gate.switchBody")}
          actionLabel={t("trackers.gate.switchAction")}
          onAction={() => void switchToPersonal(status.workspaceId)}
        />
      );
    }
    return (
      <TrackersDashboard hideCalories={hideCalories} onConsentOutdated={handleConsentOutdated} />
    );
  };

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1400, mx: "auto", width: "100%" }}>
        {renderContent()}
      </Box>
      <PersonalConsentDialog
        open={consentOpen}
        onClose={() => setConsentOpen(false)}
        onEnabled={(next) => {
          setConsentOpen(false);
          setConsentBlocked(false);
          if (!inPersonalWorkspace) void switchToPersonal(next.workspaceId);
        }}
      />
    </SidebarLayout>
  );
};

export default Trackers;
