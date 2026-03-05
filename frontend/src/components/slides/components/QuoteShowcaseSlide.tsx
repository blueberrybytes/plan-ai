import React from "react";
import { Box } from "@mui/material";
import SlideImage from "./SlideImage";
import SlideFrame from "./SlideFrame";
import AnimatedText from "./AnimatedText";
import SlideBadge from "./SlideBadge";
import { SlideProps } from "../SlideRenderer";

// Quote Showcase
export const QuoteShowcaseSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";

  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Box sx={{ display: "flex", height: "100%", ml: -6, mt: -6, mb: -6, mr: -6 }}>
        <Box sx={{ width: "50%" }}>
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
            p: 8,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            bgcolor: "rgba(0,0,0,0.4)",
          }}
        >
          <Box sx={{ mb: 4 }}>
            <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
          </Box>
          <AnimatedText
            animate={animate}
            sx={{
              fontSize: 32,
              fontWeight: 500,
              fontStyle: "italic",
              color: "#f8fafc",
              lineHeight: 1.4,
              fontFamily: `'${fonts?.heading || "Inter"}', serif`,
            }}
          >
            &quot;{String(data.statement)}&quot;
          </AnimatedText>
          {data.author && typeof data.author === "string" ? (
            <AnimatedText
              animate={animate}
              sx={{ fontSize: 18, fontWeight: 700, color: primary, mt: 4 }}
            >
              &mdash; {data.author}
            </AnimatedText>
          ) : null}
        </Box>
      </Box>
    </SlideFrame>
  );
};

export default QuoteShowcaseSlide;
