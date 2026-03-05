import React from "react";
import { Box, Typography } from "@mui/material";
import SlideFrame from "./SlideFrame";
import AnimatedText from "./AnimatedText";
import SlideBadge from "./SlideBadge";
import { SlideProps } from "../SlideRenderer";

// Two Columns
export const TwoColumnsSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  const cardBg =
    brandColors?.cardStyle === "glass"
      ? "rgba(255,255,255,0.03)"
      : brandColors?.cardStyle === "outline"
        ? "transparent"
        : "rgba(0,0,0,0.2)";

  const cardBorder =
    brandColors?.cardStyle === "glass"
      ? "1px solid rgba(255,255,255,0.1)"
      : brandColors?.cardStyle === "outline"
        ? `1px solid ${primary}40`
        : "1px solid transparent";

  const cardFilter = brandColors?.cardStyle === "glass" ? "blur(12px)" : "none";

  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Box sx={{ textAlign: "center" }}>
        <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
        <AnimatedText
          animate={animate}
          sx={{
            fontSize: 36,
            fontWeight: 700,
            mb: 4,
            color: primary,
            fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
          }}
        >
          {data.title as string}
        </AnimatedText>
      </Box>
      <Box sx={{ display: "flex", gap: 4 }}>
        <Box
          sx={{
            flex: 1,
            p: 4,
            borderRadius: 3,
            bgcolor: cardBg,
            border: cardBorder,
            backdropFilter: cardFilter,
            boxShadow: brandColors?.cardStyle === "glass" ? "0 8px 32px rgba(0,0,0,0.2)" : "none",
            animation: animate ? `slideInUp 0.6s ease-out forwards 0.2s` : "none",
            opacity: animate ? 0 : 1,
          }}
        >
          {data.leftTitle ? (
            <Typography sx={{ fontSize: 22, fontWeight: 700, mb: 2, color: primary }}>
              {String(data.leftTitle)}
            </Typography>
          ) : null}
          <Typography sx={{ fontSize: 16, lineHeight: 1.7, color: "#e2e8f0" }}>
            {data.leftBody as string}
          </Typography>
        </Box>
        <Box
          sx={{
            flex: 1,
            p: 4,
            borderRadius: 3,
            bgcolor: cardBg,
            border: cardBorder,
            backdropFilter: cardFilter,
            boxShadow: brandColors?.cardStyle === "glass" ? "0 8px 32px rgba(0,0,0,0.2)" : "none",
            animation: animate ? `slideInUp 0.6s ease-out forwards 0.3s` : "none",
            opacity: animate ? 0 : 1,
          }}
        >
          {data.rightTitle ? (
            <Typography sx={{ fontSize: 22, fontWeight: 700, mb: 2, color: primary }}>
              {String(data.rightTitle)}
            </Typography>
          ) : null}
          <Typography sx={{ fontSize: 16, lineHeight: 1.7, color: "#e2e8f0" }}>
            {data.rightBody as string}
          </Typography>
        </Box>
      </Box>
    </SlideFrame>
  );
};

export default TwoColumnsSlide;
