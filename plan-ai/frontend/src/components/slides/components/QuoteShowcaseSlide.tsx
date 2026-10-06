import React from "react";
import { Box } from "@mui/material";
import SlideImage from "./SlideImage";
import SlideFrame from "./SlideFrame";
import AnimatedText from "./AnimatedText";
import SlideBadge from "./SlideBadge";
import { SlideProps } from "../SlideRenderer";
import { blendOver, DEFAULT_SLIDE_COLORS, readableOn } from "../slideColors";

// Quote Showcase
export const QuoteShowcaseSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  // The text column is the slide background with 40% black on top. On a light
  // theme that is a mid grey where light text cannot be read, so the text
  // colour is chosen by contrast against the real colour of the column.
  const columnBg = blendOver(
    brandColors?.background || DEFAULT_SLIDE_COLORS.background,
    "#000000",
    0.4,
  );
  const quoteColor = columnBg ? readableOn(columnBg, "#f8fafc", "#0f172a") : "#f8fafc";
  const authorColor = readableOn(columnBg, primary, quoteColor);
  const statement = typeof data.statement === "string" ? data.statement.trim() : "";

  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale} hideLogo>
      {/* Out of the padded flow of the frame so both halves reach the slide edges. */}
      <Box sx={{ position: "absolute", inset: 0, display: "flex" }}>
        <Box sx={{ width: "50%" }}>
          <SlideImage
            src={(data.imageUrl as string) || ""}
            alt={String(data.imageQuery || "Featured Image")}
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
          {statement ? (
            <AnimatedText
              animate={animate}
              sx={{
                fontSize: 32,
                fontWeight: 500,
                fontStyle: "italic",
                color: quoteColor,
                lineHeight: 1.4,
                fontFamily: `'${fonts?.heading || "Inter"}', serif`,
              }}
            >
              &quot;{statement}&quot;
            </AnimatedText>
          ) : null}
          {data.author && typeof data.author === "string" ? (
            <AnimatedText
              animate={animate}
              sx={{ fontSize: 18, fontWeight: 700, color: authorColor, mt: 4 }}
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
