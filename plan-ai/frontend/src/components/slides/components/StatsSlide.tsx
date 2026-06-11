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
      ? isDark
        ? "rgba(255,255,255,0.05)"
        : "rgba(0,0,0,0.03)"
      : brandColors?.cardStyle === "outline"
        ? "transparent"
        : isDark
          ? "rgba(255,255,255,0.06)"
          : "rgba(0,0,0,0.04)";

  const cardBorder =
    brandColors?.cardStyle === "glass"
      ? isDark
        ? "1px solid rgba(255,255,255,0.12)"
        : "1px solid rgba(0,0,0,0.1)"
      : brandColors?.cardStyle === "outline"
        ? `1px solid ${primary}40`
        : "1px solid transparent";

  const cardFilter = brandColors?.cardStyle === "glass" ? "blur(12px)" : "none";

  // --- Layout budget ---
  // SlideFrame is always 960×540px (before scale). We need to fit:
  //   badge (~24px) + title (~44px) + gap + card grid — all within the 540px height.
  // Compute columns and row count so nothing clips.
  const count = stats.length;
  const cols = count <= 3 ? count : count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);

  // Available height for the card grid (in px units, matching SlideFrame's 540px canvas)
  // Padding: SlideFrame p=6 → ~48px each side. Badge ~24px. Title ~44px. Gap 12px.
  const CANVAS_H = 540;
  const PADDING_V = 48;
  const BADGE_H = 24;
  const TITLE_H = 44;
  const TITLE_MB = 16;
  const ROW_GAP = 12;
  const usedByHeader = PADDING_V + BADGE_H + TITLE_H + TITLE_MB;
  const availableForGrid = CANVAS_H - usedByHeader - PADDING_V;
  const totalRowGaps = (rows - 1) * ROW_GAP;
  const cardHeightPx = Math.floor((availableForGrid - totalRowGaps) / rows);

  // Value font: scale down for taller values and more rows
  const valueFontSize = rows > 1 ? (count >= 5 ? 22 : 26) : count >= 3 ? 28 : 36;

  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Box sx={{ textAlign: "center" }}>
        <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
        <AnimatedText
          animate={animate}
          sx={{
            fontSize: 28,
            fontWeight: 700,
            mb: `${TITLE_MB}px`,
            color: "inherit",
            fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
            lineHeight: 1.2,
          }}
        >
          {data.title as string}
        </AnimatedText>
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: `${ROW_GAP}px`,
          flex: 1,
          alignItems: "stretch",
        }}
      >
        {stats.map((stat, i) => (
          <Box
            key={i}
            sx={{
              textAlign: "center",
              p: 2,
              borderRadius: 3,
              bgcolor: cardBg,
              border: cardBorder,
              borderTop: `4px solid ${primary}`,
              backdropFilter: cardFilter,
              boxShadow:
                brandColors?.cardStyle === "glass" ? "0 8px 32px rgba(0,0,0,0.15)" : "none",
              animation: animate ? `slideInUp 0.6s ease-out forwards ${0.2 + i * 0.1}s` : "none",
              opacity: animate ? 0 : 1,
              height: `${cardHeightPx}px`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <Typography
              sx={{
                fontSize: valueFontSize,
                fontWeight: 800,
                color: "inherit",
                lineHeight: 1.1,
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              {stat.value}
            </Typography>
            <Typography
              sx={{
                fontSize: count >= 5 ? 10 : 12,
                color: primary,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                wordBreak: "break-word",
                mt: 0.5,
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
