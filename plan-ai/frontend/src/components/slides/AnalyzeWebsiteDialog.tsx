import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  CircularProgress,
  Card,
  CardActionArea,
  CardMedia,
} from "@mui/material";
import { useAnalyzeWebsiteForThemeMutation } from "../../store/apis/brandThemeApi";

interface AnalyzeWebsiteDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (data: {
    suggestedName: string;
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    headingFont: string;
    bodyFont: string;
    logoUrl?: string;
  }) => void;
}

export const AnalyzeWebsiteDialog: React.FC<AnalyzeWebsiteDialogProps> = ({
  open,
  onClose,
  onApply,
}) => {
  const [url, setUrl] = useState("");
  const [analyze, { isLoading }] = useAnalyzeWebsiteForThemeMutation();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any>(null);
  const [selectedLogo, setSelectedLogo] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!url) return;
    try {
      const res = await analyze({ url }).unwrap();
      setResult(res);
      if (res.candidateLogos && res.candidateLogos.length > 0) {
        setSelectedLogo(res.candidateLogos[0]);
      } else {
        setSelectedLogo(null);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to analyze website. Make sure the URL is valid.");
    }
  };

  const handleApply = () => {
    if (result) {
      onApply({
        suggestedName: result.suggestedName || "",
        primaryColor: result.primaryColor,
        secondaryColor: result.secondaryColor,
        backgroundColor: result.backgroundColor,
        headingFont: result.headingFont,
        bodyFont: result.bodyFont,
        logoUrl: selectedLogo || undefined,
      });
    }
    handleClose();
  };

  const handleClose = () => {
    setUrl("");
    setResult(null);
    setSelectedLogo(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Import Theme from Website</DialogTitle>
      <DialogContent dividers>
        {!result ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Enter the URL of your company&apos;s website. Our AI will analyze the styles, fonts, and images to generate a brand theme automatically.
            </Typography>
            <TextField
              fullWidth
              label="Website URL"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
              autoFocus
            />
            {isLoading && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 2, color: "primary.main" }}>
                <CircularProgress size={24} />
                <Typography>Analyzing website (this may take a few seconds)...</Typography>
              </Box>
            )}
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Theme Extracted Successfully!
            </Typography>

            <Box sx={{ display: "flex", gap: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">Primary</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box sx={{ width: 24, height: 24, borderRadius: 1, bgcolor: result.primaryColor }} />
                  <Typography variant="body2">{result.primaryColor}</Typography>
                </Box>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Secondary</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box sx={{ width: 24, height: 24, borderRadius: 1, bgcolor: result.secondaryColor }} />
                  <Typography variant="body2">{result.secondaryColor}</Typography>
                </Box>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Background</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box sx={{ width: 24, height: 24, borderRadius: 1, bgcolor: result.backgroundColor, border: "1px solid #ccc" }} />
                  <Typography variant="body2">{result.backgroundColor}</Typography>
                </Box>
              </Box>
            </Box>

            <Box sx={{ display: "flex", gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary">Heading Font</Typography>
                <Typography variant="body2" fontWeight={600}>{result.headingFont}</Typography>
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary">Body Font</Typography>
                <Typography variant="body2">{result.bodyFont}</Typography>
              </Box>
            </Box>

            {result.candidateLogos && result.candidateLogos.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                  Select a Logo (or choose none)
                </Typography>
                <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 1 }}>
                  {result.candidateLogos.map((logo: string, idx: number) => (
                    <Card
                      key={idx}
                      variant="outlined"
                      sx={{
                        minWidth: 100,
                        width: 100,
                        height: 100,
                        borderColor: selectedLogo === logo ? "primary.main" : "divider",
                        borderWidth: selectedLogo === logo ? 2 : 1,
                      }}
                    >
                      <CardActionArea
                        onClick={() => setSelectedLogo(logo)}
                        sx={{ width: "100%", height: "100%" }}
                      >
                        <CardMedia
                          component="img"
                          image={logo}
                          sx={{ objectFit: "contain", width: "100%", height: "100%", p: 1 }}
                        />
                      </CardActionArea>
                    </Card>
                  ))}
                  <Card
                    variant="outlined"
                    sx={{
                      minWidth: 100,
                      width: 100,
                      height: 100,
                      borderColor: selectedLogo === null ? "primary.main" : "divider",
                      borderWidth: selectedLogo === null ? 2 : 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CardActionArea
                      onClick={() => setSelectedLogo(null)}
                      sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <Typography variant="caption">None</Typography>
                    </CardActionArea>
                  </Card>
                </Box>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        {!result ? (
          <Button onClick={handleAnalyze} variant="contained" disabled={isLoading || !url}>
            Analyze URL
          </Button>
        ) : (
          <Button onClick={handleApply} variant="contained" color="primary">
            Apply Theme
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
