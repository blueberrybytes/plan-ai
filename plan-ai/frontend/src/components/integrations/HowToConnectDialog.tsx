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
  Link,
} from "@mui/material";
import { Trans, useTranslation } from "react-i18next";

export type HowToProvider = "jira" | "linear" | "trello";

// Help links live in code, not in the translation strings, so the strings carry no HTML attributes.
const PROVIDER_HELP_LINKS: Record<HowToProvider, string | undefined> = {
  jira: "https://id.atlassian.com/manage-profile/security/api-tokens",
  linear: undefined,
  trello: "https://trello.com/app-key",
};

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

  // Each provider currently has 4 steps defined in the localization keys
  const stepKeys = ([1, 2, 3, 4] as const).map(
    (stepNumber) => `integrationsPage.helpDialog.providers.${provider}.step${stepNumber}`,
  );

  // Only these tags are rendered from the translation strings. Anything else stays plain text.
  // The link tag is called "anchor" because Trans treats "link" as a void HTML element.
  const helpLink = PROVIDER_HELP_LINKS[provider];
  const stepComponents = {
    strong: <strong />,
    code: <code />,
    anchor: helpLink ? (
      <Link href={helpLink} target="_blank" rel="noopener noreferrer" />
    ) : (
      <span />
    ),
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
          {stepKeys.map((stepKey, index) => (
            <ListItem key={stepKey} alignItems="flex-start" sx={{ px: 0 }}>
              <Typography
                variant="body1"
                sx={{ mr: 2, fontWeight: "bold", color: "text.secondary" }}
              >
                {index + 1}.
              </Typography>
              <ListItemText
                primaryTypographyProps={{ variant: "body1" }}
                primary={<Trans i18nKey={stepKey} components={stepComponents} />}
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
