import React from "react";
import { Box, Typography, useTheme } from "@mui/material";
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
  const muiTheme = useTheme();
  const bg = brandColors?.background || "#0f172a";
  const isDark = muiTheme.palette.getContrastText(bg) === "#fff";

  const cardBg =
    brandColors?.cardStyle === "glass"
      ? isDark
        ? "rgba(255,255,255,0.03)"
        : "rgba(0,0,0,0.03)"
      : brandColors?.cardStyle === "outline"
        ? "transparent"
        : isDark
          ? "rgba(0,0,0,0.2)"
          : "rgba(0,0,0,0.04)";

  const cardBorder =
    brandColors?.cardStyle === "glass"
      ? isDark
        ? "1px solid rgba(255,255,255,0.1)"
        : "1px solid rgba(0,0,0,0.1)"
      : brandColors?.cardStyle === "outline"
        ? `1px solid ${primary}40`
        : "1px solid transparent";

  const cardFilter = brandColors?.cardStyle === "glass" ? "blur(12px)" : "none";

  const leftBodyText = (data.leftBody as string) ?? "";
  const rightBodyText = (data.rightBody as string) ?? "";

  // Dynamically shrink font when content is long so it fits the card
  const maxChars = Math.max(leftBodyText.length, rightBodyText.length);
  const bodyFontSize = maxChars > 600 ? 13 : maxChars > 400 ? 14 : maxChars > 250 ? 15 : 16;

  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Box sx={{ textAlign: "center", flexShrink: 0 }}>
        <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
        <AnimatedText
          animate={animate}
          sx={{
            fontSize: 36,
            fontWeight: 700,
            mb: 2,
            color: primary,
            fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
          }}
        >
          {data.title as string}
        </AnimatedText>
      </Box>
      <Box sx={{ display: "flex", gap: 4, flex: 1, minHeight: 0 }}>
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
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          {data.leftTitle ? (
            <Typography
              sx={{ fontSize: 20, fontWeight: 700, mb: 1.5, color: primary, flexShrink: 0 }}
            >
              {String(data.leftTitle)}
            </Typography>
          ) : null}
          <Typography
            sx={{
              fontSize: bodyFontSize,
              lineHeight: 1.6,
              color: "inherit",
              opacity: 0.85,
              whiteSpace: "pre-wrap",
              overflow: "hidden",
            }}
          >
            {leftBodyText}
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
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          {data.rightTitle ? (
            <Typography
              sx={{ fontSize: 20, fontWeight: 700, mb: 1.5, color: primary, flexShrink: 0 }}
            >
              {String(data.rightTitle)}
            </Typography>
          ) : null}
          <Typography
            sx={{
              fontSize: bodyFontSize,
              lineHeight: 1.6,
              color: "inherit",
              opacity: 0.85,
              whiteSpace: "pre-wrap",
              overflow: "hidden",
            }}
          >
            {rightBodyText}
          </Typography>
        </Box>
      </Box>
    </SlideFrame>
  );
};

export default TwoColumnsSlide;
