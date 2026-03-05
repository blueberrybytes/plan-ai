import React from "react";
import AnimatedText from "./AnimatedText";

export const SlideBadge: React.FC<{ text?: string; primary?: string; animate?: boolean }> = ({
  text,
  primary = "#6366f1",
  animate,
}) => {
  if (!text) return null;

  return (
    <AnimatedText
      animate={animate}
      sx={{
        display: "inline-block",
        px: 1.5,
        py: 0.5,
        borderRadius: 1,
        bgcolor: `${primary}1A`, // 10% opacity
        color: primary,
        fontSize: "0.80rem",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        border: `1px solid ${primary}33`, // 20% opacity
        mb: 2,
      }}
    >
      {text}
    </AnimatedText>
  );
};

export default SlideBadge;
