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
  className,
  ...props
}) => {
  // A text that sets its own font is a title. SlideFrame gives the body font of
  // the theme to every other text and leaves this class alone.
  const hasOwnFont = typeof sx === "object" && sx !== null && "fontFamily" in sx;
  const classes = [className, hasOwnFont ? "slide-heading" : ""].filter(Boolean).join(" ");

  if (!animate) {
    return (
      <Typography sx={sx} className={classes || undefined} {...props}>
        {children}
      </Typography>
    );
  }

  return (
    // flexShrink 0: with overflow hidden a flex column could shrink this box to
    // nothing and clip the text, which the plain Typography above never does.
    <Box sx={{ overflow: "hidden", display: "block", flexShrink: 0 }}>
      <style>{typingKeyframes}</style>
      <Typography
        sx={{
          ...sx,
          animation: "slideInUp 0.8s ease-out forwards",
          opacity: 0, // Start invisible, animation handles fade in
        }}
        className={classes || undefined}
        {...props}
      >
        {children}
      </Typography>
    </Box>
  );
};

export default AnimatedText;
