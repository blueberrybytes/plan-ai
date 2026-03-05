import React from "react";
import { Box } from "@mui/material";

/**
 * Renders a 16:9 slide frame that looks like a real presentation slide.
 * All slide type renderers are composed inside this wrapper.
 */
export interface SlideFrameProps {
  children: React.ReactNode;
  brandColors?: {
    primary?: string;
    secondary?: string;
    background?: string;
    backgroundStyle?: "solid" | "gradient" | "mesh" | "minimal";
    cardStyle?: "flat" | "glass" | "outline";
  };
  fonts?: {
    heading?: string;
    body?: string;
  };
  scale?: number;
}

const SlideFrame: React.FC<SlideFrameProps> = ({ children, brandColors, fonts, scale = 1 }) => {
  const bg = brandColors?.background || "#0f172a";
  const primary = brandColors?.primary || "#6366f1";
  const secondary = brandColors?.secondary || "#a78bfa";
  const bgStyle = brandColors?.backgroundStyle || "solid";

  let backgroundImage = "none";
  if (bgStyle === "gradient") {
    // Elegant soft gradient blending the background with a 15% tint
    backgroundImage = `linear-gradient(135deg, ${primary}1A 0%, ${secondary}1A 100%)`;
  } else if (bgStyle === "mesh") {
    // Complex, rich, Apple-like mesh gradient
    backgroundImage = `
      radial-gradient(circle at 15% 50%, ${primary}26, transparent 40%),
      radial-gradient(circle at 85% 30%, ${secondary}26, transparent 40%),
      radial-gradient(circle at 50% 100%, ${primary}1A, transparent 50%)
    `;
  } else if (bgStyle === "minimal") {
    // A very subtle repeating grid pattern for minimal themes
    backgroundImage = `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0V0zm20 20h20v20H20V20zM0 20h20v20H0V20z' fill='%23ffffff' fill-opacity='0.02' fill-rule='evenodd'/%3E%3C/svg%3E")`;
  }

  return (
    <Box
      sx={{
        width: 960 * scale,
        height: 540 * scale,
        bgcolor: bg,
        backgroundImage,
        borderRadius: 2,
        overflow: "hidden",
        position: "relative",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        transform: `scale(1)`,
        transformOrigin: "top left",
      }}
    >
      {/* Optional: Add a subtle animated grain overlay for mesh/gradient */}
      {(bgStyle === "mesh" || bgStyle === "gradient") && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            opacity: 0.15,
            pointerEvents: "none",
            mixBlendMode: "overlay",
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />
      )}
      <Box
        sx={{
          width: 960,
          height: 540,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          p: 6,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          color: "#f1f5f9",
          fontFamily: `'${fonts?.body || "Inter"}', sans-serif`,
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default SlideFrame;
