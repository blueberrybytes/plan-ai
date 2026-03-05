import React from "react";
import { Box } from "@mui/material";
import { SlideProps } from "../SlideRenderer";
import SlideFrame from "./SlideFrame";
import SlideBadge from "./SlideBadge";
import DynamicIcon from "./DynamicIcon";
import AnimatedText from "./AnimatedText";

// Title Only
export const TitleOnlySlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Box sx={{ textAlign: "center" }}>
        <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
        {data.iconName && typeof data.iconName === "string" ? (
          <Box
            sx={{
              display: "inline-flex",
              mb: 3,
              p: 2,
              borderRadius: "50%",
              bgcolor: `${primary}15`,
            }}
          >
            <DynamicIcon name={String(data.iconName)} sx={{ fontSize: 64, color: primary }} />
          </Box>
        ) : null}
        <AnimatedText
          animate={animate}
          sx={{
            fontSize: 48,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            mb: 2,
            background: `linear-gradient(135deg, ${primary}, #a78bfa)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
          }}
        >
          {data.title as string}
        </AnimatedText>
        {data.subtitle ? (
          <AnimatedText
            animate={animate}
            sx={{ fontSize: 22, color: "inherit", opacity: 0.7, fontWeight: 400 }}
          >
            {String(data.subtitle)}
          </AnimatedText>
        ) : null}
      </Box>
    </SlideFrame>
  );
};

export default TitleOnlySlide;
