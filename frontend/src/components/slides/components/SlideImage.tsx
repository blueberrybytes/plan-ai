import React, { useState } from "react";
import { Box, Typography } from "@mui/material";
import ImageIcon from "@mui/icons-material/Image";

export interface SlideImageProps {
  src: string;
  alt: string;
  query?: string;
  primary?: string;
  style?: React.CSSProperties;
}

const SlideImage: React.FC<SlideImageProps> = ({ src, alt, query, primary = "#6366f1", style }) => {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  return (
    <Box sx={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Placeholder — shown while loading or on error */}
      {status !== "loaded" && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(135deg, ${primary}22 0%, ${primary}44 100%)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            borderRadius: "inherit",
          }}
        >
          <ImageIcon sx={{ fontSize: 48, color: primary, opacity: 0.6 }} />
          {query && (
            <Typography
              sx={{
                fontSize: 13,
                color: "inherit",
                opacity: 0.7,
                textAlign: "center",
                px: 2,
                maxWidth: 200,
                lineHeight: 1.4,
              }}
            >
              {query}
            </Typography>
          )}
        </Box>
      )}
      {/* Actual image */}
      <img
        src={src}
        alt={alt}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        style={{
          ...style,
          opacity: status === "loaded" ? 1 : 0,
          transition: "opacity 0.4s ease",
        }}
      />
    </Box>
  );
};

export default SlideImage;
