import React from "react";
import { Box, Typography } from "@mui/material";
import SlideFrame from "./SlideFrame";
import AnimatedText from "./AnimatedText";
import SlideBadge from "./SlideBadge";
import DynamicIcon from "./DynamicIcon";
import { SlideProps } from "../SlideRenderer";

// Three Columns
export const ThreeColumnsSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  const rawCols = data.columns;
  const columns: { title: string; body: string; iconName?: string }[] = Array.isArray(rawCols)
    ? rawCols.map((c: unknown) => {
        const obj = c as Record<string, unknown>;
        return {
          title: String(obj.title || ""),
          body: String(obj.body || ""),
          iconName: obj.iconName ? String(obj.iconName) : undefined,
        };
      })
    : [];

  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Box sx={{ textAlign: "center", mb: 6 }}>
        <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
        <AnimatedText
          animate={animate}
          sx={{
            fontSize: 38,
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.2,
            fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
          }}
        >
          {data.title as string}
        </AnimatedText>
        {data.subtitle && typeof data.subtitle === "string" ? (
          <AnimatedText
            animate={animate}
            sx={{
              fontSize: 18,
              color: "inherit",
              opacity: 0.7,
              mt: 2,
              maxWidth: "70%",
              mx: "auto",
            }}
          >
            {data.subtitle}
          </AnimatedText>
        ) : null}
      </Box>

      <Box sx={{ display: "flex", gap: 4, px: 2, pb: 4 }}>
        {columns.map((col, i) => (
          <Box key={i} sx={{ flex: 1, textAlign: "center" }}>
            <Box
              sx={{
                display: "inline-flex",
                p: 2,
                borderRadius: "50%",
                bgcolor: `${primary}15`,
                mb: 3,
              }}
            >
              <DynamicIcon name={col.iconName} sx={{ fontSize: 36, color: primary }} />
            </Box>
            <Typography sx={{ fontSize: 20, fontWeight: 700, color: "#fff", mb: 1.5 }}>
              {String(col.title)}
            </Typography>
            <Typography sx={{ fontSize: 15, color: "inherit", opacity: 0.85, lineHeight: 1.6 }}>
              {String(col.body)}
            </Typography>
          </Box>
        ))}
      </Box>
    </SlideFrame>
  );
};

export default ThreeColumnsSlide;
