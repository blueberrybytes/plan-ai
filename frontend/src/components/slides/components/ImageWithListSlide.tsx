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
      <Box sx={{ mb: 4 }}>
        <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
        <AnimatedText
          animate={animate}
          sx={{
            fontSize: 36,
            fontWeight: 800,
            color: "#fff",
            fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
          }}
        >
          {data.title as string}
        </AnimatedText>
        {data.body && typeof data.body === "string" ? (
          <AnimatedText
            animate={animate}
            sx={{ fontSize: 16, color: "#94a3b8", mt: 1, maxWidth: "80%" }}
          >
            {data.body}
          </AnimatedText>
        ) : null}
      </Box>

      <Box sx={{ display: "flex", gap: 5, flex: 1 }}>
        <Box
          sx={{
            width: "45%",
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
            gap: 3,
            justifyContent: "center",
            pb: 4,
          }}
        >
          {features.map((feat, i) => (
            <Box
              key={i}
              sx={{
                display: "flex",
                gap: 3,
                bgcolor: "rgba(255,255,255,0.02)",
                p: 2,
                borderRadius: 2,
              }}
            >
              <Box
                sx={{
                  width: 40,
                  height: 40,
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
                <Typography sx={{ fontSize: 18, fontWeight: 700, color: "#fff", mb: 0.5 }}>
                  {String(feat.title)}
                </Typography>
                {feat.description && (
                  <Typography sx={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.5 }}>
                    {String(feat.description)}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </SlideFrame>
  );
};

export default ImageWithListSlide;
