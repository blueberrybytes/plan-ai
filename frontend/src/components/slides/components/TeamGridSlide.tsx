import React from "react";
import { Box, Typography } from "@mui/material";
import SlideFrame from "./SlideFrame";
import AnimatedText from "./AnimatedText";
import SlideBadge from "./SlideBadge";
import { SlideProps } from "../SlideRenderer";

// Team Grid
export const TeamGridSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  const rawMembers = data.members;
  const members: { name: string; role: string; bio: string }[] = Array.isArray(rawMembers)
    ? rawMembers.map((m: unknown) => {
        const obj = m as Record<string, unknown>;
        return {
          name: String(obj.name || ""),
          role: String(obj.role || ""),
          bio: String(obj.bio || ""),
        };
      })
    : [];
  const cardBg =
    brandColors?.cardStyle === "glass"
      ? "rgba(255,255,255,0.03)"
      : brandColors?.cardStyle === "outline"
        ? "transparent"
        : "rgba(0,0,0,0.2)";

  const cardBorder =
    brandColors?.cardStyle === "glass"
      ? "1px solid rgba(255,255,255,0.1)"
      : brandColors?.cardStyle === "outline"
        ? `1px solid ${primary}40`
        : "1px solid transparent";

  const cardFilter = brandColors?.cardStyle === "glass" ? "blur(12px)" : "none";

  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Box sx={{ textAlign: "center" }}>
        <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
        <AnimatedText
          animate={animate}
          sx={{
            fontSize: 36,
            fontWeight: 700,
            mb: 4,
            color: primary,
            fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
          }}
        >
          {data.title as string}
        </AnimatedText>
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(members.length, 4)}, 1fr)`,
          gap: 3,
        }}
      >
        {members.map((member, i) => (
          <Box
            key={i}
            sx={{
              textAlign: "center",
              p: 3,
              borderRadius: 3,
              bgcolor: cardBg,
              border: cardBorder,
              backdropFilter: cardFilter,
              boxShadow:
                brandColors?.cardStyle === "glass" ? "0 8px 32px rgba(0,0,0,0.15)" : "none",
              animation: animate ? `slideInUp 0.6s ease-out forwards ${0.2 + i * 0.1}s` : "none",
              opacity: animate ? 0 : 1,
            }}
          >
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${primary}, #a78bfa)`,
                backgroundSize: "200% 200%",
                mx: "auto",
                mb: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                fontWeight: 800,
                color: "#fff",
                boxShadow: `0 4px 14px ${primary}60`,
              }}
            >
              {member.name.charAt(0)}
            </Box>
            <Typography sx={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>
              {member.name}
            </Typography>
            <Typography sx={{ fontSize: 14, color: primary, mb: 1, fontWeight: 500 }}>
              {member.role}
            </Typography>
            <Typography sx={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>
              {member.bio}
            </Typography>
          </Box>
        ))}
      </Box>
    </SlideFrame>
  );
};

export default TeamGridSlide;
