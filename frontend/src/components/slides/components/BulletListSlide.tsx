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
  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
      <AnimatedText
        animate={animate}
        sx={{
          fontSize: 36,
          fontWeight: 700,
          mb: data.subtitle ? 1 : 4,
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
            mb: 4,
            fontWeight: 500,
          }}
        >
          {data.subtitle}
        </AnimatedText>
      ) : null}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: primary,
                mt: 1,
                flexShrink: 0,
                boxShadow: `0 0 10px ${primary}80`,
              }}
            />
            <Typography sx={{ fontSize: 18, color: "inherit", opacity: 0.85, lineHeight: 1.6 }}>
              {bullet}
            </Typography>
          </Box>
        ))}
      </Box>
    </SlideFrame>
  );
};

export default BulletListSlide;
