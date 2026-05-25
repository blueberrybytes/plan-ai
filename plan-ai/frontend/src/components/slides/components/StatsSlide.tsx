import React from "react";
import { Box, Typography } from "@mui/material";
import SlideFrame from "./SlideFrame";
import AnimatedText from "./AnimatedText";
import SlideBadge from "./SlideBadge";
import { SlideProps } from "../SlideRenderer";

// Stats
export const StatsSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  const secondary = brandColors?.secondary || primary;
  const rawStats = data.stats;
  const stats: { label: string; value: string }[] = Array.isArray(rawStats)
    ? rawStats.map((s: unknown) => {
        const obj = s as Record<string, unknown>;
        return { label: String(obj.label || ""), value: String(obj.value || "") };
      })
    : [];
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
            mb: 6,
            color: "inherit",
            fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
          }}
        >
          {data.title as string}
        </AnimatedText>
      </Box>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 4,
          alignItems: "stretch",
        }}
      >
        {stats.map((stat, i) => (
          <Box
            key={i}
            sx={{
              flex: "1 1 min(200px, 100%)", // allow expanding but with base width
              minWidth: 180,
              maxWidth: 280,
              textAlign: "center",
              p: 4,
              borderRadius: 4,
              bgcolor: cardBg,
              border: cardBorder,
              backdropFilter: cardFilter,
              boxShadow:
                brandColors?.cardStyle === "glass" ? "0 8px 32px rgba(0,0,0,0.15)" : "none",
              animation: animate ? `slideInUp 0.6s ease-out forwards ${0.2 + i * 0.1}s` : "none",
              opacity: animate ? 0 : 1,
            }}
          >
            <Typography
              sx={{
                fontSize: stat.value.length > 8 ? 32 : 48, // scale down long values like "~19.7M Tokens"
                fontWeight: 800,
                color: primary,
                mb: 1,
                lineHeight: 1.1,
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              {stat.value}
            </Typography>
            <Typography
              sx={{
                fontSize: 14,
                color: "inherit",
                opacity: 0.7,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                wordBreak: "break-word",
              }}
            >
              {stat.label}
            </Typography>
          </Box>
        ))}
      </Box>
    </SlideFrame>
  );
};

export default StatsSlide;
