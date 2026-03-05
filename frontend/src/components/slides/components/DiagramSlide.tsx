import React from "react";
import { Box, Typography } from "@mui/material";
import MermaidRenderer from "../../common/MermaidRenderer";
import { SlideProps } from "../SlideRenderer";
import SlideFrame from "./SlideFrame";
import AnimatedText from "./AnimatedText";
import SlideBadge from "./SlideBadge";

// Diagram
export const DiagramSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";

  // Create a minimal theme object expected by MermaidRenderer
  const mermaidTheme = {
    primaryColor: primary,
    backgroundColor: brandColors?.background || "#0f172a",
    textColor: "#f8fafc", // Typically light since slides default dark/themed bg
  };

  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Box sx={{ textAlign: "center", mb: 2 }}>
        <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
        <AnimatedText
          animate={animate}
          sx={{
            fontSize: 32,
            fontWeight: 700,
            mb: 1,
            color: primary,
            fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
          }}
        >
          {data.title as string}
        </AnimatedText>
      </Box>
      <Box
        sx={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          bgcolor: "background.paper", // Often white/light depending on MUI theme, giving the diagram a clean backdrop within the dark slide
          borderRadius: 2,
          overflow: "hidden",
          p: 2,
          "& svg": {
            maxWidth: "100%",
            maxHeight: "100%",
            height: "auto",
            width: "auto",
          },
        }}
        onClick={(e) => {
          // Prevent clicks on diagram tools from propagating and triggering slide advances if used interactively
          e.stopPropagation();
        }}
      >
        {data.mermaidCode ? (
          <MermaidRenderer chart={data.mermaidCode as string} theme={mermaidTheme} />
        ) : (
          <Typography color="text.secondary">No diagram data provided</Typography>
        )}
      </Box>
    </SlideFrame>
  );
};

export default DiagramSlide;
