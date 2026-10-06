import React, { useState, useEffect } from "react";
import { Box } from "@mui/material";
import ImageIcon from "@mui/icons-material/Image";
import { fetchProxiedSlideImage } from "./slideImageCache";

export interface SlideImageProps {
  src: string;
  alt: string;
  primary?: string;
  style?: React.CSSProperties;
}

const SlideImage: React.FC<SlideImageProps> = ({ src, alt, primary = "#6366f1", style }) => {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [dataUri, setDataUri] = useState<string>("");

  useEffect(() => {
    let isMounted = true;

    const loadImage = async () => {
      setStatus("loading");
      if (!src) {
        setStatus("error");
        return;
      }
      const resolved = await fetchProxiedSlideImage(src);
      if (isMounted) setDataUri(resolved);
    };

    loadImage();

    return () => {
      isMounted = false;
    };
  }, [src]);

  return (
    <Box sx={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Placeholder, shown while loading or when there is no image. The image prompt is never shown. */}
      {status !== "loaded" && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            bgcolor: `${primary}22`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "inherit",
          }}
        >
          <ImageIcon sx={{ fontSize: 48, color: primary, opacity: 0.6 }} />
        </Box>
      )}
      {/* Actual image */}
      {dataUri && (
        <img
          src={dataUri}
          alt={alt}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          style={{
            ...style,
            opacity: status === "loaded" ? 1 : 0,
            transition: "opacity 0.4s ease",
          }}
        />
      )}
    </Box>
  );
};

export default SlideImage;
