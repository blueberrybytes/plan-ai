import React from "react";
import { Box, Typography } from "@mui/material";
import SlideImage from "./SlideImage";
import SlideFrame from "./SlideFrame";
import AnimatedText from "./AnimatedText";
import SlideBadge from "./SlideBadge";
import { SlideProps } from "../SlideRenderer";

// Split KPI
export const SplitKpiSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  const rawKpis = data.kpis;
  const kpis: { value: string; label: string; description?: string }[] = Array.isArray(rawKpis)
    ? rawKpis.map((k: unknown) => {
        const obj = k as Record<string, unknown>;
        return {
          value: String(obj.value || ""),
          label: String(obj.label || ""),
          description: obj.description ? String(obj.description) : undefined,
        };
      })
    : [];

  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Box
        sx={{
          display: "flex",
          gap: 6,
          alignItems: "stretch",
          height: "100%",
          ml: -6,
          mt: -6,
          mb: -6,
        }}
      >
        <Box sx={{ width: "45%", position: "relative" }}>
          <SlideImage
            src={(data.imageUrl as string) || ""}
            alt={String(data.imageQuery || "Featured Image")}
            query={String(data.imageQuery || "")}
            primary={primary}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: "8px 0 0 8px",
            }}
          />
        </Box>
        <Box
          sx={{
            flex: 1,
            py: 8,
            pr: 6,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
          <AnimatedText
            animate={animate}
            sx={{
              fontSize: 40,
              fontWeight: 800,
              mb: 6,
              color: "#fff",
              lineHeight: 1.2,
              fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
            }}
          >
            {data.title as string}
          </AnimatedText>

          <Box sx={{ display: "flex", gap: 4, flexWrap: "wrap", mt: 2 }}>
            {kpis.map((kpi, i) => (
              <Box key={i} sx={{ flex: 1, minWidth: "120px" }}>
                <Typography
                  sx={{
                    fontSize: 42,
                    fontWeight: 900,
                    color: primary,
                    mb: 1,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {kpi.value}
                </Typography>
                <Typography sx={{ fontSize: 16, fontWeight: 600, color: "#fff", mb: 0.5 }}>
                  {kpi.label}
                </Typography>
                {kpi.description && (
                  <Typography sx={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.4 }}>
                    {kpi.description}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </SlideFrame>
  );
};

export default SplitKpiSlide;
