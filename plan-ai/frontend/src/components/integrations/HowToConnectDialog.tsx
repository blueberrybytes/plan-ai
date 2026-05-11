import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";
import { useTranslation } from "react-i18next";

export type HowToProvider = "jira" | "linear" | "trello";

interface HowToConnectDialogProps {
  open: boolean;
  onClose: () => void;
  provider: HowToProvider | null;
}

export const HowToConnectDialog: React.FC<HowToConnectDialogProps> = ({
  open,
  onClose,
  provider,
}) => {
  const { t } = useTranslation();

  if (!provider) return null;

  const getSteps = () => {
    // Each provider currently has 4 steps defined in the localization keys
    type StepKey = `integrationsPage.helpDialog.providers.${HowToProvider}.step${1 | 2 | 3 | 4}`;

    return ([1, 2, 3, 4] as const).map((stepNumber) =>
      t(`integrationsPage.helpDialog.providers.${provider}.step${stepNumber}` as StepKey),
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {t("integrationsPage.helpDialog.title", {
          provider: provider.charAt(0).toUpperCase() + provider.slice(1),
        })}
      </DialogTitle>
      <DialogContent dividers>
        <List sx={{ pt: 0 }}>
          {getSteps().map((stepHtml, index) => (
            <ListItem key={index} alignItems="flex-start" sx={{ px: 0 }}>
              <Typography
                variant="body1"
                sx={{ mr: 2, fontWeight: "bold", color: "text.secondary" }}
              >
                {index + 1}.
              </Typography>
              <ListItemText
                primaryTypographyProps={{ variant: "body1" }}
                primary={<span dangerouslySetInnerHTML={{ __html: stepHtml }} />}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          {t("integrationsPage.helpDialog.close")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
