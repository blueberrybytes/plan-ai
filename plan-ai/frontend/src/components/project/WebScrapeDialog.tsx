/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Slider,
  Box,
  CircularProgress,
  Alert,
} from "@mui/material";
import { useImportFromWebsiteMutation } from "../../store/apis/contextApi";
import { useDispatch } from "react-redux";
import { setToastMessage } from "../../store/slices/app/appSlice";

interface WebScrapeDialogProps {
  open: boolean;
  onClose: () => void;
  contextId: string;
}

const WebScrapeDialog: React.FC<WebScrapeDialogProps> = ({ open, onClose, contextId }) => {
  const dispatch = useDispatch();
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState<number>(10);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [importFromWebsite, { isLoading }] = useImportFromWebsiteMutation();

  const handleClose = () => {
    setUrl("");
    setMaxPages(1);
    setErrorText(null);
    onClose();
  };

  const validateUrl = (string: string) => {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setErrorText("URL is required.");
      return;
    }

    if (!validateUrl(trimmedUrl)) {
      setErrorText("Please enter a valid HTTP or HTTPS URL.");
      return;
    }

    try {
      const result = await importFromWebsite({
        contextId,
        body: {
          url: trimmedUrl,
          maxPages,
        },
      }).unwrap();

      dispatch(
        setToastMessage({
          severity: "success",
          message: result?.message || `Successfully scraped website!`,
        }),
      );
      handleClose();
    } catch (err: any) {
      console.error("Failed to scrape website:", err);
      setErrorText(err?.data?.message || err?.message || "Failed to scrape the website.");
    }
  };

  return (
    <Dialog open={open} onClose={isLoading ? undefined : handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Import from Website</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent dividers>
          {errorText && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {errorText}
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary" paragraph>
            Enter a website URL to extract its textual content. We will optionally look for a
            sitemap and traverse up to your specified page limit.
          </Typography>

          <TextField
            autoFocus
            fullWidth
            label="Website URL"
            placeholder="https://example.com/docs"
            variant="outlined"
            size="medium"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isLoading}
            required
            sx={{ mb: 4 }}
          />

          <Typography variant="subtitle2" gutterBottom>
            Max Pages to Scrape: {maxPages}
          </Typography>
          <Slider
            value={maxPages}
            onChange={(e, val) => setMaxPages(val as number)}
            disabled={isLoading}
            step={1}
            marks={[
              { value: 1, label: "1" },
              { value: 5, label: "5" },
              { value: 10, label: "10" },
              { value: 20, label: "20" },
            ]}
            min={1}
            max={20}
            valueLabelDisplay="auto"
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Note: Higher limits consume more AI embedding tokens and increase scrape time. Be
            careful with large generic sites.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, px: 3 }}>
          <Button onClick={handleClose} disabled={isLoading} color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isLoading || !url.trim()}
            startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {isLoading ? "Scraping..." : "Start Import"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
};

export default WebScrapeDialog;
