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
  
  const titleStr = String(data.title || "");
  const bodyStr = String(data.body || "");
  const effectiveLength = titleStr.length + bodyStr.length;
  
  const isVeryLong = effectiveLength > 500;
  const isLong = effectiveLength > 300;

  const titleSize = isVeryLong ? 24 : isLong ? 28 : 32;
  const bodySize = isVeryLong ? 13 : isLong ? 15 : 16;
  const lineH = isVeryLong ? 1.5 : 1.7;

  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Box sx={{ display: "flex", gap: 5, alignItems: "center", height: "100%" }}>
        <Box sx={{ flex: 1, maxHeight: "100%", overflow: "hidden" }}>
          <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
          <AnimatedText
            animate={animate}
            sx={{
              fontSize: titleSize,
              fontWeight: 700,
              mb: 2,
              color: primary,
              fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
            }}
          >
            {titleStr}
          </AnimatedText>
          <AnimatedText
            animate={animate}
            sx={{
              fontSize: bodySize,
              lineHeight: lineH,
              color: "inherit",
              whiteSpace: "pre-wrap",
              opacity: 0.85,
            }}
          >
            {bodyStr}
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
