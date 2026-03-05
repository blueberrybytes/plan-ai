import React from "react";
import { Box, Typography } from "@mui/material";
import SlideImage from "./SlideImage";
import SlideFrame from "./SlideFrame";
import AnimatedText from "./AnimatedText";
import SlideBadge from "./SlideBadge";
import { SlideProps } from "../SlideRenderer";

// Showcase
export const ShowcaseSlide: React.FC<SlideProps> = ({
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
        <AnimatedText
          animate={animate}
          sx={{
            fontSize: 32,
            fontWeight: 700,
            mb: 3,
            color: primary,
            fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
          }}
        >
          {data.title as string}
        </AnimatedText>
      </Box>
      <Box
        sx={{
          flex: 1,
          borderRadius: 2,
          overflow: "hidden",
          bgcolor: "rgba(99,102,241,0.08)",
          mb: 2,
          minHeight: 240,
        }}
      >
        <SlideImage
          src={(data.imageUrl as string) || ""}
          alt={String(data.imageQuery || "Featured Image")}
          query={String(data.imageQuery || "")}
          primary={primary}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </Box>
      <Typography sx={{ fontSize: 16, color: "#94a3b8", textAlign: "center", lineHeight: 1.6 }}>
        {data.caption as string}
      </Typography>
    </SlideFrame>
  );
};

export default ShowcaseSlide;
