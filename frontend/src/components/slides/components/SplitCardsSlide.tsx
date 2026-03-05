import React from "react";
import { Box, Typography } from "@mui/material";
import SlideImage from "./SlideImage";
import SlideFrame from "./SlideFrame";
import AnimatedText from "./AnimatedText";
import SlideBadge from "./SlideBadge";
import DynamicIcon from "./DynamicIcon";
import { SlideProps } from "../SlideRenderer";

// Split Cards
export const SplitCardsSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  const rawCards = data.cards;
  const cards: { title: string; body: string; iconName?: string }[] = Array.isArray(rawCards)
    ? rawCards.map((c: unknown) => {
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
        <Box sx={{ width: "45%" }}>
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
            py: 6,
            pr: 6,
            pl: 2,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
          <AnimatedText
            animate={animate}
            sx={{
              fontSize: 34,
              fontWeight: 800,
              mb: 4,
              color: "#fff",
              lineHeight: 1.2,
              fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
            }}
          >
            {data.title as string}
          </AnimatedText>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {cards.map((card, i) => (
              <Box
                key={i}
                sx={{
                  p: 2.5,
                  bgcolor: "rgba(255,255,255,0.03)",
                  border: `1px solid ${primary}22`,
                  borderRadius: 2,
                  borderLeft: `4px solid ${primary}`,
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
                  <DynamicIcon name={card.iconName} sx={{ color: primary, fontSize: 20 }} />
                  <Typography sx={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
                    {card.title}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.5, ml: 4 }}>
                  {card.body}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </SlideFrame>
  );
};

export default SplitCardsSlide;
