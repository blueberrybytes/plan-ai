import React from "react";
import { Alert, Button } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

/** Reading notes with AI needs an OpenRouter key in the personal workspace. */
const MissingKeyAlert: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Alert
      severity="warning"
      action={
        <Button color="inherit" size="small" onClick={() => navigate("/team?tab=settings")}>
          {t("trackers.missingKey.action")}
        </Button>
      }
    >
      {t("trackers.missingKey.body")}
    </Alert>
  );
};

export default MissingKeyAlert;
