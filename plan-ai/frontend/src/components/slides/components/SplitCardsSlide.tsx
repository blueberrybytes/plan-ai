import React from "react";
import { Box, Typography, useTheme } from "@mui/material";
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
  const muiTheme = useTheme();
  const bg = brandColors?.background || "#0f172a";
  const isDark = muiTheme.palette.getContrastText(bg) === "#fff";

  const cardBg = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)";

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

  const isCramped = cards.length >= 3;

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
            py: isCramped ? 4.5 : 6,
            pr: 6,
            pl: 2,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", m: "auto 0" }}>
            <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
            <AnimatedText
              animate={animate}
              sx={{
                fontSize: isCramped ? 24 : 34,
                fontWeight: 800,
                mb: isCramped ? 1.5 : 4,
                color: "inherit",
                lineHeight: 1.2,
                fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
              }}
            >
              {data.title as string}
            </AnimatedText>

            <Box sx={{ display: "flex", flexDirection: "column", gap: isCramped ? 1 : 2 }}>
              {cards.map((card, i) => (
                <Box
                  key={i}
                  sx={{
                    p: isCramped ? 1.25 : 2.5,
                    bgcolor: cardBg,
                    border: `1px solid ${primary}22`,
                    borderRadius: 2,
                    borderLeft: `4px solid ${primary}`,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      mb: isCramped ? 0.25 : 1,
                    }}
                  >
                    <DynamicIcon
                      name={card.iconName}
                      sx={{ color: primary, fontSize: isCramped ? 16 : 18 }}
                    />
                    <Typography
                      sx={{ fontSize: isCramped ? 13 : 16, fontWeight: 700, color: "inherit" }}
                    >
                      {card.title}
                    </Typography>
                  </Box>
                  <Typography
                    sx={{
                      fontSize: isCramped ? 11.5 : 14,
                      color: "inherit",
                      opacity: 0.85,
                      lineHeight: 1.3,
                      ml: isCramped ? 3.5 : 4,
                    }}
                  >
                    {card.body}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </SlideFrame>
  );
};

export default SplitCardsSlide;
