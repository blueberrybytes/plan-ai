import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Link,
  Typography,
} from "@mui/material";
import LinkIcon from "@mui/icons-material/Link";

interface ScrapedUrlsDialogProps {
  urls: string[] | null;
  onClose: () => void;
}

const ScrapedUrlsDialog: React.FC<ScrapedUrlsDialogProps> = ({ urls, onClose }) => {
  return (
    <Dialog open={Boolean(urls)} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Scraped Pages</DialogTitle>
      <DialogContent dividers>
        {!urls || urls.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No specific URLs were recorded for this context.
          </Typography>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" paragraph>
              The following {urls.length} pages were aggregated into this context:
            </Typography>
            <List dense>
              {urls.map((url, index) => (
                <ListItem key={index}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <LinkIcon fontSize="small" color="action" />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Link
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        color="inherit"
                        underline="hover"
                        sx={{ wordBreak: "break-all" }}
                      >
                        {url}
                      </Link>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ScrapedUrlsDialog;
