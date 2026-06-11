import React from "react";
import { Box, Grid, Paper, Typography, useTheme } from "@mui/material";
import { AutoAwesome as AutoAwesomeIcon } from "@mui/icons-material";

export interface ChatSuggestion {
  label: string;
  prompt: string;
}

interface ChatEmptyStateProps {
  title: string;
  subtitle: string;
  suggestions?: ChatSuggestion[];
  onSelect: (prompt: string) => void;
}

/**
 * Welcome screen shown in an empty chat: big icon, title/subtitle, and a grid
 * of clickable suggestion cards. Used by ChatHome and the per-Project Assistant.
 */
const ChatEmptyState: React.FC<ChatEmptyStateProps> = ({
  title,
  subtitle,
  suggestions,
  onSelect,
}) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        textAlign: "center",
        opacity: 0.9,
      }}
    >
      <Box
        sx={{
          width: 64,
          height: 64,
          borderRadius: "20px",
          bgcolor: "rgba(67,97,238,0.15)",
          color: "primary.main",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mb: 3,
        }}
      >
        <AutoAwesomeIcon sx={{ fontSize: 32 }} />
      </Box>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
        {title}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 5, fontWeight: 400 }}>
        {subtitle}
      </Typography>
      {suggestions && suggestions.length > 0 && (
        <Grid container spacing={2} maxWidth="md">
          {suggestions.map((s, i) => (
            <Grid item xs={12} sm={6} key={i}>
              <Paper
                elevation={0}
                onClick={() => onSelect(s.prompt)}
                sx={{
                  p: 3,
                  textAlign: "left",
                  cursor: "pointer",
                  bgcolor: "background.paper",
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 3,
                  transition: "all 0.2s ease",
                  "&:hover": {
                    borderColor: "primary.main",
                    transform: "translateY(-2px)",
                    boxShadow: theme.shadows[2],
                  },
                }}
              >
                <Typography variant="subtitle1" fontWeight="600">
                  {s.label}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {s.prompt}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
};

export default ChatEmptyState;
