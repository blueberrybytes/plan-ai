import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import FolderIcon from "@mui/icons-material/Folder";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import PublicIcon from "@mui/icons-material/Public";
import GitHubIcon from "@mui/icons-material/GitHub";
import YouTubeIcon from "@mui/icons-material/YouTube";
import DescriptionIcon from "@mui/icons-material/Description";

interface ContextInfoDialogProps {
  open: boolean;
  onClose: () => void;
}

const ContextInfoDialog: React.FC<ContextInfoDialogProps> = ({ open, onClose }) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>What is a Context?</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body1" paragraph>
          A <strong>Context</strong> (o Base de Conocimiento) is a custom folder where you aggregate
          all relevant information for a specific project, client, or topic.
        </Typography>
        <Typography variant="body1" paragraph>
          Plan AI&apos;s models use this Context through Retrieval-Augmented Generation (RAG) to
          enrich the final output—giving the AI hyper-specific knowledge about your codebase or
          project requirements.
        </Typography>

        <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, fontWeight: 600 }}>
          You can inject information via:
        </Typography>
        <List dense>
          <ListItem>
            <ListItemIcon>
              <FolderIcon color="primary" />
            </ListItemIcon>
            <ListItemText
              primary="File Uploads & Drive"
              secondary="PDF, DOC, DOCX, PPTX, TXT, CSV, JSON, XML, XLSX, MD"
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <YouTubeIcon color="error" />
            </ListItemIcon>
            <ListItemText
              primary="YouTube & Video Analysis"
              secondary="Extract transcripts directly from YouTube URLs."
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <GitHubIcon color="inherit" />
            </ListItemIcon>
            <ListItemText
              primary="GitHub Repositories"
              secondary="Sync code and architecture specs directly from developers."
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <DescriptionIcon color="warning" />
            </ListItemIcon>
            <ListItemText
              primary="Manual Text Entry"
              secondary="Write or paste raw text contexts instantly."
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <PublicIcon color="info" />
            </ListItemIcon>
            <ListItemText
              primary="Web Scraping"
              secondary="Pull structural content automatically from any public URL."
            />
          </ListItem>
        </List>

        <Box sx={{ mt: 2, p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
          <Typography variant="body2" sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
            <AutoAwesomeIcon fontSize="small" color="secondary" sx={{ mt: 0.3 }} />
            <span>
              <strong>Pro Tip:</strong> When you start a new AI Chat or prompt a Diagram, attach a
              Context. The AI will look up these documents to provide responses strictly grounded in
              your own data, drastically reducing hallucinations.
            </span>
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary" variant="contained">
          Understood
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ContextInfoDialog;
