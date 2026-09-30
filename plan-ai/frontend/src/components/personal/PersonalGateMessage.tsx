import React from "react";
import { Box, Button, Paper, Typography } from "@mui/material";
import { Person as PersonIcon } from "@mui/icons-material";

interface PersonalGateMessageProps {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}

/** Shown on the trackers page when they cannot load yet, with the one step to take. */
const PersonalGateMessage: React.FC<PersonalGateMessageProps> = ({
  title,
  body,
  actionLabel,
  onAction,
}) => (
  <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 }, borderRadius: 2, textAlign: "center" }}>
    <PersonIcon sx={{ fontSize: 40, opacity: 0.5, mb: 1 }} />
    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
      {title}
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>
      {body}
    </Typography>
    <Box>
      <Button variant="contained" onClick={onAction}>
        {actionLabel}
      </Button>
    </Box>
  </Paper>
);

export default PersonalGateMessage;
