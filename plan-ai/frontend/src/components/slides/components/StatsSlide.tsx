import React from "react";
import { Box, Typography, useTheme } from "@mui/material";
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
  const muiTheme = useTheme();
  const bg = brandColors?.background || "#0f172a";
  const isDark = muiTheme.palette.getContrastText(bg) === "#fff";
  const rawStats = data.stats;
  const stats: { label: string; value: string }[] = Array.isArray(rawStats)
    ? rawStats.map((s: unknown) => {
        const obj = s as Record<string, unknown>;
        return { label: String(obj.label || ""), value: String(obj.value || "") };
      })
    : [];
  const cardBg =
    brandColors?.cardStyle === "glass"
      ? isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)"
      : brandColors?.cardStyle === "outline"
        ? "transparent"
        : isDark
          ? "rgba(255,255,255,0.06)"
          : "rgba(0,0,0,0.04)";

  const cardBorder =
    brandColors?.cardStyle === "glass"
      ? isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.1)"
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
              borderTop: `4px solid ${primary}`,
              backdropFilter: cardFilter,
              boxShadow:
                brandColors?.cardStyle === "glass" ? "0 8px 32px rgba(0,0,0,0.15)" : "none",
              animation: animate ? `slideInUp 0.6s ease-out forwards ${0.2 + i * 0.1}s` : "none",
              opacity: animate ? 0 : 1,
            }}
          >
            <Typography
              sx={{
                fontSize: stat.value.length > 8 ? 32 : 48,
                fontWeight: 800,
                // Use inherit so SlideFrame's contrast-derived text color applies
                // correctly regardless of theme background (dark or light).
                color: "inherit",
                mb: 1.5,
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
                color: primary,
                fontWeight: 700,
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
