import React from "react";
import { Box } from "@mui/material";
import SlideImage from "./SlideImage";
import SlideFrame from "./SlideFrame";
import AnimatedText from "./AnimatedText";
import SlideBadge from "./SlideBadge";
import { SlideProps } from "../SlideRenderer";

export const TextImageSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Box sx={{ display: "flex", gap: 5, alignItems: "center", height: "100%" }}>
        <Box sx={{ flex: 1 }}>
          <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
          <AnimatedText
            animate={animate}
            sx={{
              fontSize: 32,
              fontWeight: 700,
              mb: 2,
              color: primary,
              fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
            }}
          >
            {data.title as string}
          </AnimatedText>
          <AnimatedText animate={animate} sx={{ fontSize: 16, lineHeight: 1.7, color: "#cbd5e1" }}>
            {data.body as string}
          </AnimatedText>
        </Box>
        <Box
          sx={{
            flex: 1,
            height: "100%",
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: "rgba(99,102,241,0.1)",
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
      </Box>
    </SlideFrame>
  );
};

export default TextImageSlide;
