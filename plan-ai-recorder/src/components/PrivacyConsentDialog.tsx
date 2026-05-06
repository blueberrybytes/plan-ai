import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
} from "@mui/material";

interface PrivacyConsentDialogProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export const PrivacyConsentDialog: React.FC<PrivacyConsentDialogProps> = ({
  open,
  onAccept,
  onDecline,
}) => {
  return (
    <Dialog open={open} maxWidth="sm" fullWidth disableEscapeKeyDown>
      <DialogTitle fontWeight="bold" sx={{ bgcolor: "background.paper" }}>
        Data Privacy & AI Processing Consent
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: "background.default", p: 3 }}>
        <Typography variant="body2" paragraph sx={{ mb: 3 }}>
          Plan AI uses advanced Artificial Intelligence to process your recorded
          meetings and generate intelligent summaries. To provide this service, we
          must collect and transmit your recorded audio.
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" fontWeight="bold" color="primary" gutterBottom>
            • What data is collected?
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            When you click "Start Recording", the app captures your selected
            system audio and microphone input.
          </Typography>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" fontWeight="bold" color="primary" gutterBottom>
            • Who is this data sent to?
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Your audio recordings are securely transmitted to our backend
            servers and then processed by our third-party AI transcription
            partner, <strong>Groq</strong>, to convert speech to text. Your data is strictly
            used for transcription and is <strong>not</strong> used to train global AI models.
          </Typography>
        </Box>

        <Typography variant="body2" sx={{ mt: 3, fontWeight: 500 }}>
          By clicking "I Agree", you consent to the collection and sharing of
          your audio data with Plan AI and Groq for transcription purposes.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ p: 2, bgcolor: "background.paper" }}>
        <Button onClick={onDecline} color="inherit">
          Decline & Exit
        </Button>
        <Button onClick={onAccept} variant="contained" color="primary" disableElevation>
          I Agree
        </Button>
      </DialogActions>
    </Dialog>
  );
};
