import React from "react";
import { Box, Typography } from "@mui/material";
import SlideImage from "./SlideImage";
import SlideFrame from "./SlideFrame";
import AnimatedText from "./AnimatedText";
import SlideBadge from "./SlideBadge";
import DynamicIcon from "./DynamicIcon";
import { SlideProps } from "../SlideRenderer";

// Image Width List
export const ImageWithListSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  const rawFeatures = data.features;
  const features: { title: string; description?: string; iconName?: string }[] = Array.isArray(
    rawFeatures,
  )
    ? rawFeatures.map((f: unknown) => {
        const obj = f as Record<string, unknown>;
        return {
          title: String(obj.title || ""),
          description: obj.description ? String(obj.description) : undefined,
          iconName: obj.iconName ? String(obj.iconName) : undefined,
        };
      })
    : [];

  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Box sx={{ mb: 2 }}>
        <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
        <AnimatedText
          animate={animate}
          sx={{
            fontSize: data.body ? 30 : 36,
            fontWeight: 800,
            color: "inherit",
            fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
          }}
        >
          {data.title as string}
        </AnimatedText>
        {data.body && typeof data.body === "string" ? (
          <AnimatedText
            animate={animate}
            sx={{
              fontSize: 16,
              color: "inherit",
              opacity: 0.7,
              mt: 1,
              maxWidth: "80%",
              whiteSpace: "pre-wrap",
            }}
          >
            {data.body}
          </AnimatedText>
        ) : null}
      </Box>

      <Box sx={{ display: "flex", gap: 4, flex: 1, minHeight: 0 }}>
        <Box
          sx={{
            width: "40%",
            borderRadius: 3,
            overflow: "hidden",
            bgcolor: "rgba(99,102,241,0.05)",
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
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            py: 1,
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: features.length > 3 ? 0.75 : 2.5,
              m: "auto 0",
            }}
          >
            {features.map((feat, i) => (
              <Box
                key={i}
                sx={{
                  display: "flex",
                  gap: features.length > 3 ? 1 : 1.5,
                  bgcolor: "rgba(255,255,255,0.02)",
                  p: features.length > 3 ? 1 : 1.5,
                  borderRadius: 2,
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    bgcolor: `${primary}22`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <DynamicIcon name={feat.iconName} sx={{ color: primary }} />
                </Box>
                <Box>
                  <Typography
                    sx={{
                      fontSize: features.length > 3 ? 14 : 16,
                      fontWeight: 700,
                      color: "inherit",
                      mb: 0.25,
                      lineHeight: 1.2,
                      whiteSpace: features.length > 3 ? "nowrap" : "normal",
                      overflow: features.length > 3 ? "hidden" : "visible",
                      textOverflow: features.length > 3 ? "ellipsis" : "clip",
                    }}
                  >
                    {String(feat.title)}
                  </Typography>
                  {feat.description && (
                    <Typography
                      sx={{
                        fontSize: features.length > 3 ? 12 : 13,
                        color: "inherit",
                        opacity: 0.7,
                        lineHeight: 1.3,
                        whiteSpace: "pre-wrap",
                        display: features.length > 3 ? "-webkit-box" : "block",
                        WebkitLineClamp: features.length > 3 ? 3 : undefined,
                        WebkitBoxOrient: features.length > 3 ? "vertical" : undefined,
                        overflow: features.length > 3 ? "hidden" : "visible",
                      }}
                    >
                      {String(feat.description)}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </SlideFrame>
  );
};

export default ImageWithListSlide;
