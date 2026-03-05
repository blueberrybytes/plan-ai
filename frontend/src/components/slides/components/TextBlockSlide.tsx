import React from "react";
import { Box } from "@mui/material";
import SlideFrame from "./SlideFrame";
import AnimatedText from "./AnimatedText";
import SlideBadge from "./SlideBadge";
import DynamicIcon from "./DynamicIcon";
import { SlideProps } from "../SlideRenderer";

// Text Block
export const TextBlockSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  return (
    <SlideFrame brandColors={brandColors} scale={scale}>
      <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
        {data.iconName && typeof data.iconName === "string" ? (
          <DynamicIcon name={data.iconName} sx={{ fontSize: 40, color: primary }} />
        ) : null}
        <AnimatedText animate={animate} sx={{ fontSize: 36, fontWeight: 700, color: primary }}>
          {data.title as string}
        </AnimatedText>
      </Box>
      {data.subtitle && typeof data.subtitle === "string" ? (
        <AnimatedText
          animate={animate}
          sx={{ fontSize: 20, color: "#94a3b8", mb: 3, fontWeight: 500 }}
        >
          {data.subtitle}
        </AnimatedText>
      ) : null}
      <AnimatedText animate={animate} sx={{ fontSize: 18, lineHeight: 1.7, color: "#cbd5e1" }}>
        {data.body as string}
      </AnimatedText>
    </SlideFrame>
  );
};

export default TextBlockSlide;
