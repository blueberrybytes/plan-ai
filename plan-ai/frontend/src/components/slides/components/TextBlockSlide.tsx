import React from "react";
import { Box } from "@mui/material";
import SlideFrame from "./SlideFrame";
import AnimatedText from "./AnimatedText";
import SlideBadge from "./SlideBadge";
import DynamicIcon from "./DynamicIcon";
import { SlideProps } from "../SlideRenderer";
import { slideTitleColor } from "../slideColors";

// Text Block
export const TextBlockSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  const titleColor = slideTitleColor(brandColors);
  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
        {data.iconName && typeof data.iconName === "string" ? (
          <DynamicIcon name={data.iconName} sx={{ fontSize: 40, color: primary }} />
        ) : null}
        {/* The wrapper lets a long title wrap next to the icon. */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <AnimatedText
            animate={animate}
            sx={{
              fontSize: 36,
              fontWeight: 700,
              color: titleColor,
              fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
            }}
          >
            {data.title as string}
          </AnimatedText>
        </Box>
      </Box>
      {data.subtitle && typeof data.subtitle === "string" ? (
        <AnimatedText
          animate={animate}
          sx={{
            fontSize: 20,
            color: "inherit",
            whiteSpace: "pre-wrap",
            opacity: 0.7,
            mb: 3,
            fontWeight: 500,
          }}
        >
          {data.subtitle}
        </AnimatedText>
      ) : null}
      <AnimatedText
        animate={animate}
        sx={{
          fontSize: 18,
          lineHeight: 1.7,
          color: "inherit",
          whiteSpace: "pre-wrap",
          opacity: 0.85,
        }}
      >
        {data.body as string}
      </AnimatedText>
    </SlideFrame>
  );
};

export default TextBlockSlide;
