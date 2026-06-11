import React, { useState, useEffect } from "react";
import { Box, Typography, Fade } from "@mui/material";
import { AutoAwesome as AutoAwesomeIcon } from "@mui/icons-material";

const THINKING_MESSAGES = [
  "Analyzing your request...",
  "Querying the knowledge base...",
  "Gathering context...",
  "Synthesizing information...",
  "Crafting your response...",
  "Formatting output...",
];

const ThinkingIndicator: React.FC = () => {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % THINKING_MESSAGES.length);
        setFade(true);
      }, 500); // wait for fade out
    }, 2500); // stay visible for 2s

    return () => clearInterval(interval);
  }, []);

  return (
    <Box sx={{ display: "flex", alignItems: "center", minHeight: "28px" }}>
      <AutoAwesomeIcon
        color="primary"
        sx={{
          mr: 1.5,
          fontSize: 20,
          animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          "@keyframes pulse": {
            "0%, 100%": { opacity: 1 },
            "50%": { opacity: 0.5 },
          },
        }}
      />
      <Fade in={fade} timeout={500}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            background: (theme) =>
              `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main || theme.palette.primary.light})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {THINKING_MESSAGES[index]}
        </Typography>
      </Fade>
    </Box>
  );
};

export default ThinkingIndicator;
