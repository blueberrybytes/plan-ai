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
  const mermaidTheme = React.useMemo(
    () => ({
      primaryColor: primary,
      backgroundColor: brandColors?.background || "#0f172a",
    }),
    [primary, brandColors?.background],
  );

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
          bgcolor: "rgba(0,0,0,0.15)", // Inherited backdrop instead of forcing MUI paper color
          borderRadius: 2,
          overflow: "hidden",
          p: 2,
          "& svg": {
            display: "block",
            maxWidth: "100%",
            maxHeight: "100%",
          },
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
