import React from "react";
import { Box, Typography } from "@mui/material";

export const typingKeyframes = `
  @keyframes slideInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

const AnimatedText: React.FC<React.ComponentProps<typeof Typography> & { animate?: boolean }> = ({
  animate,
  children,
  sx,
  ...props
}) => {
  if (!animate) {
    return (
      <Typography sx={sx} {...props}>
        {children}
      </Typography>
    );
  }

  return (
    <Box sx={{ overflow: "hidden", display: "block" }}>
      <style>{typingKeyframes}</style>
      <Typography
        sx={{
          ...sx,
          animation: "slideInUp 0.8s ease-out forwards",
          opacity: 0, // Start invisible, animation handles fade in
        }}
        {...props}
      >
        {children}
      </Typography>
    </Box>
  );
};

export default AnimatedText;
