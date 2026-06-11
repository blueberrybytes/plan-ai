import React from "react";
import { Box, Typography } from "@mui/material";
import SlideFrame from "./SlideFrame";
import AnimatedText from "./AnimatedText";
import SlideBadge from "./SlideBadge";
import { SlideProps } from "../SlideRenderer";

// Bullet List
export const BulletListSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  const rawBullets = data.bullets;
  let bullets: string[] = [];
  if (Array.isArray(rawBullets)) {
    bullets = rawBullets.map(String);
  } else if (typeof rawBullets === "string") {
    bullets = rawBullets
      .split("\n")
      .map((b) => b.trim())
      .filter(Boolean);
  }

  const totalChars = bullets.reduce((sum, b) => sum + b.length, 0);
  const effectiveLength = totalChars + bullets.length * 50;

  let fontSize = 18;
  let gapSize = 2;
  let lineHeight = 1.6;
  let titleMb = data.subtitle ? 1 : 4;

  if (effectiveLength > 1200) {
    fontSize = 11;
    gapSize = 0.5;
    lineHeight = 1.3;
    titleMb = data.subtitle ? 1 : 2;
  } else if (effectiveLength > 900) {
    fontSize = 12;
    gapSize = 0.75;
    lineHeight = 1.4;
    titleMb = data.subtitle ? 1 : 2;
  } else if (effectiveLength > 700) {
    fontSize = 13;
    gapSize = 1;
    lineHeight = 1.4;
    titleMb = data.subtitle ? 1 : 2;
  } else if (effectiveLength > 500) {
    fontSize = 15;
    gapSize = 1.5;
    lineHeight = 1.5;
    titleMb = data.subtitle ? 1 : 3;
  } else if (effectiveLength > 300) {
    fontSize = 16;
    gapSize = 2;
    lineHeight = 1.5;
  }

  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
      <AnimatedText
        animate={animate}
        sx={{
          fontSize: 36,
          fontWeight: 700,
          mb: titleMb,
          color: primary,
          fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
        }}
      >
        {data.title as string}
      </AnimatedText>
      {data.subtitle && typeof data.subtitle === "string" ? (
        <AnimatedText
          animate={animate}
          sx={{
            fontSize: 20,
            color: "inherit",
            opacity: 0.7,
            mb: gapSize > 1 ? 4 : 2,
            fontWeight: 500,
          }}
        >
          {data.subtitle}
        </AnimatedText>
      ) : null}
      <Box sx={{ display: "flex", flexDirection: "column", gap: gapSize }}>
        {bullets.map((bullet, i) => (
          <Box
            key={i}
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: 2,
              animation: animate ? `slideInUp 0.6s ease-out forwards ${0.2 + i * 0.1}s` : "none",
              opacity: animate ? 0 : 1,
            }}
          >
            <Box
              sx={{
                width: Math.max(5, fontSize * 0.4),
                height: Math.max(5, fontSize * 0.4),
                borderRadius: "50%",
                bgcolor: primary,
                mt: fontSize > 14 ? 1 : 0.6,
                flexShrink: 0,
                boxShadow: `0 0 10px ${primary}80`,
              }}
            />
            <Typography
              sx={{ fontSize: fontSize, color: "inherit", opacity: 0.85, lineHeight: lineHeight }}
            >
              {bullet}
            </Typography>
          </Box>
        ))}
      </Box>
    </SlideFrame>
  );
};

export default BulletListSlide;
