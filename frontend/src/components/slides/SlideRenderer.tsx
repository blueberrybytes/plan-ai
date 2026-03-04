import React, { useState } from "react";
import { Box, Typography, SxProps, Theme } from "@mui/material";
import ImageIcon from "@mui/icons-material/Image";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import DownloadIcon from "@mui/icons-material/Download";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import PsychologyIcon from "@mui/icons-material/Psychology";
import SettingsIcon from "@mui/icons-material/Settings";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CircleIcon from "@mui/icons-material/Circle";

const iconMap: Record<string, React.FC<{ sx?: SxProps<Theme> }>> = {
  AutoAwesome: AutoAwesomeIcon,
  TextFields: TextFieldsIcon,
  Download: DownloadIcon,
  Lightbulb: LightbulbIcon,
  Psychology: PsychologyIcon,
  Settings: SettingsIcon,
  CheckCircle: CheckCircleIcon,
};

export const DynamicIcon = ({ name, sx }: { name?: string; sx?: SxProps<Theme> }) => {
  if (!name) return <CircleIcon sx={sx} />;
  const IconComponent = iconMap[name] || CheckCircleIcon;
  return <IconComponent sx={sx} />;
};

/**
 * Image with a styled gradient placeholder shown while loading or on error.
 */
interface SlideImageProps {
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
                color: "#94a3b8",
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

const typingKeyframes = `
  @keyframes slideInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

const AnimatedText: React.FC<React.ComponentProps<typeof Typography> & { animate?: boolean }> = ({
  animate,
  children,
  sx,
  ...props
}) => {
  if (!animate) {
    return (
      <Typography sx={sx} {...props}>
        {children}
      </Typography>
    );
  }

  return (
    <Box sx={{ overflow: "hidden", display: "block" }}>
      <style>{typingKeyframes}</style>
      <Typography
        sx={{
          ...sx,
          animation: "slideInUp 0.8s ease-out forwards",
          opacity: 0, // Start invisible, animation handles fade in
        }}
        {...props}
      >
        {children}
      </Typography>
    </Box>
  );
};

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

/**
 * Renders a 16:9 slide frame that looks like a real presentation slide.
 * All slide type renderers are composed inside this wrapper.
 */
interface SlideFrameProps {
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

// ─── Individual Slide Type Renderers ─────────────────────────────────

interface SlideProps {
  data: Record<string, unknown>;
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
  animate?: boolean;
}

// Title Only
export const TitleOnlySlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Box sx={{ textAlign: "center" }}>
        <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
        {data.iconName && typeof data.iconName === "string" ? (
          <Box
            sx={{
              display: "inline-flex",
              mb: 3,
              p: 2,
              borderRadius: "50%",
              bgcolor: `${primary}15`,
            }}
          >
            <DynamicIcon name={String(data.iconName)} sx={{ fontSize: 64, color: primary }} />
          </Box>
        ) : null}
        <AnimatedText
          animate={animate}
          sx={{
            fontSize: 48,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            mb: 2,
            background: `linear-gradient(135deg, ${primary}, #a78bfa)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
          }}
        >
          {data.title as string}
        </AnimatedText>
        {data.subtitle ? (
          <AnimatedText animate={animate} sx={{ fontSize: 22, color: "#94a3b8", fontWeight: 400 }}>
            {String(data.subtitle)}
          </AnimatedText>
        ) : null}
      </Box>
    </SlideFrame>
  );
};

// Text Block
export const TextBlockSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  return (
    <SlideFrame brandColors={brandColors} scale={scale}>
      <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
        {data.iconName && typeof data.iconName === "string" ? (
          <DynamicIcon name={data.iconName} sx={{ fontSize: 40, color: primary }} />
        ) : null}
        <AnimatedText animate={animate} sx={{ fontSize: 36, fontWeight: 700, color: primary }}>
          {data.title as string}
        </AnimatedText>
      </Box>
      {data.subtitle && typeof data.subtitle === "string" ? (
        <AnimatedText
          animate={animate}
          sx={{ fontSize: 20, color: "#94a3b8", mb: 3, fontWeight: 500 }}
        >
          {data.subtitle}
        </AnimatedText>
      ) : null}
      <AnimatedText animate={animate} sx={{ fontSize: 18, lineHeight: 1.7, color: "#cbd5e1" }}>
        {data.body as string}
      </AnimatedText>
    </SlideFrame>
  );
};

// Text + Image
export const TextImageSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Box sx={{ display: "flex", gap: 5, alignItems: "center", height: "100%" }}>
        <Box sx={{ flex: 1 }}>
          <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
          <AnimatedText
            animate={animate}
            sx={{
              fontSize: 32,
              fontWeight: 700,
              mb: 2,
              color: primary,
              fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
            }}
          >
            {data.title as string}
          </AnimatedText>
          <AnimatedText animate={animate} sx={{ fontSize: 16, lineHeight: 1.7, color: "#cbd5e1" }}>
            {data.body as string}
          </AnimatedText>
        </Box>
        <Box
          sx={{
            flex: 1,
            height: "100%",
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: "rgba(99,102,241,0.1)",
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
      </Box>
    </SlideFrame>
  );
};

// Bullet List
export const BulletListSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  const rawBullets = data.bullets;
  let bullets: string[] = [];
  if (Array.isArray(rawBullets)) {
    bullets = rawBullets.map(String);
  } else if (typeof rawBullets === "string") {
    bullets = rawBullets
      .split("\n")
      .map((b) => b.trim())
      .filter(Boolean);
  }
  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
      <AnimatedText
        animate={animate}
        sx={{
          fontSize: 36,
          fontWeight: 700,
          mb: data.subtitle ? 1 : 4,
          color: primary,
          fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
        }}
      >
        {data.title as string}
      </AnimatedText>
      {data.subtitle && typeof data.subtitle === "string" ? (
        <AnimatedText
          animate={animate}
          sx={{
            fontSize: 20,
            color: "#94a3b8",
            mb: 4,
            fontWeight: 500,
          }}
        >
          {data.subtitle}
        </AnimatedText>
      ) : null}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {bullets.map((bullet, i) => (
          <Box
            key={i}
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: 2,
              animation: animate ? `slideInUp 0.6s ease-out forwards ${0.2 + i * 0.1}s` : "none",
              opacity: animate ? 0 : 1,
            }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: primary,
                mt: 1,
                flexShrink: 0,
                boxShadow: `0 0 10px ${primary}80`,
              }}
            />
            <Typography sx={{ fontSize: 18, color: "#cbd5e1", lineHeight: 1.6 }}>
              {bullet}
            </Typography>
          </Box>
        ))}
      </Box>
    </SlideFrame>
  );
};

// Two Columns
export const TwoColumnsSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
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
      <Box sx={{ display: "flex", gap: 4 }}>
        <Box
          sx={{
            flex: 1,
            p: 4,
            borderRadius: 3,
            bgcolor: cardBg,
            border: cardBorder,
            backdropFilter: cardFilter,
            boxShadow: brandColors?.cardStyle === "glass" ? "0 8px 32px rgba(0,0,0,0.2)" : "none",
            animation: animate ? `slideInUp 0.6s ease-out forwards 0.2s` : "none",
            opacity: animate ? 0 : 1,
          }}
        >
          {data.leftTitle ? (
            <Typography sx={{ fontSize: 22, fontWeight: 700, mb: 2, color: primary }}>
              {String(data.leftTitle)}
            </Typography>
          ) : null}
          <Typography sx={{ fontSize: 16, lineHeight: 1.7, color: "#e2e8f0" }}>
            {data.leftBody as string}
          </Typography>
        </Box>
        <Box
          sx={{
            flex: 1,
            p: 4,
            borderRadius: 3,
            bgcolor: cardBg,
            border: cardBorder,
            backdropFilter: cardFilter,
            boxShadow: brandColors?.cardStyle === "glass" ? "0 8px 32px rgba(0,0,0,0.2)" : "none",
            animation: animate ? `slideInUp 0.6s ease-out forwards 0.3s` : "none",
            opacity: animate ? 0 : 1,
          }}
        >
          {data.rightTitle ? (
            <Typography sx={{ fontSize: 22, fontWeight: 700, mb: 2, color: primary }}>
              {String(data.rightTitle)}
            </Typography>
          ) : null}
          <Typography sx={{ fontSize: 16, lineHeight: 1.7, color: "#e2e8f0" }}>
            {data.rightBody as string}
          </Typography>
        </Box>
      </Box>
    </SlideFrame>
  );
};

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

// Showcase
export const ShowcaseSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Box sx={{ textAlign: "center" }}>
        <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
        <AnimatedText
          animate={animate}
          sx={{
            fontSize: 32,
            fontWeight: 700,
            mb: 3,
            color: primary,
            fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
          }}
        >
          {data.title as string}
        </AnimatedText>
      </Box>
      <Box
        sx={{
          flex: 1,
          borderRadius: 2,
          overflow: "hidden",
          bgcolor: "rgba(99,102,241,0.08)",
          mb: 2,
          minHeight: 240,
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
      <Typography sx={{ fontSize: 16, color: "#94a3b8", textAlign: "center", lineHeight: 1.6 }}>
        {data.caption as string}
      </Typography>
    </SlideFrame>
  );
};

// Stats
export const StatsSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  const rawStats = data.stats;
  const stats: { label: string; value: string }[] = Array.isArray(rawStats)
    ? rawStats.map((s: unknown) => {
        const obj = s as Record<string, unknown>;
        return { label: String(obj.label || ""), value: String(obj.value || "") };
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
            mb: 6,
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
          gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, 1fr)`,
          gap: 4,
        }}
      >
        {stats.map((stat, i) => (
          <Box
            key={i}
            sx={{
              textAlign: "center",
              p: 4,
              borderRadius: 4,
              bgcolor: cardBg,
              border: cardBorder,
              backdropFilter: cardFilter,
              boxShadow:
                brandColors?.cardStyle === "glass" ? "0 8px 32px rgba(0,0,0,0.15)" : "none",
              animation: animate ? `slideInUp 0.6s ease-out forwards ${0.2 + i * 0.1}s` : "none",
              opacity: animate ? 0 : 1,
            }}
          >
            <Typography
              sx={{
                fontSize: 48,
                fontWeight: 800,
                background: `linear-gradient(135deg, ${primary}, #a78bfa)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                mb: 1,
                lineHeight: 1.1,
              }}
            >
              {stat.value}
            </Typography>
            <Typography
              sx={{
                fontSize: 15,
                color: "#94a3b8",
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {stat.label}
            </Typography>
          </Box>
        ))}
      </Box>
    </SlideFrame>
  );
};

// Split KPI
export const SplitKpiSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  const rawKpis = data.kpis;
  const kpis: { value: string; label: string; description?: string }[] = Array.isArray(rawKpis)
    ? rawKpis.map((k: unknown) => {
        const obj = k as Record<string, unknown>;
        return {
          value: String(obj.value || ""),
          label: String(obj.label || ""),
          description: obj.description ? String(obj.description) : undefined,
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
        <Box sx={{ width: "45%", position: "relative" }}>
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
            py: 8,
            pr: 6,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
          <AnimatedText
            animate={animate}
            sx={{
              fontSize: 40,
              fontWeight: 800,
              mb: 6,
              color: "#fff",
              lineHeight: 1.2,
              fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
            }}
          >
            {data.title as string}
          </AnimatedText>

          <Box sx={{ display: "flex", gap: 4, flexWrap: "wrap", mt: 2 }}>
            {kpis.map((kpi, i) => (
              <Box key={i} sx={{ flex: 1, minWidth: "120px" }}>
                <Typography
                  sx={{
                    fontSize: 42,
                    fontWeight: 900,
                    color: primary,
                    mb: 1,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {kpi.value}
                </Typography>
                <Typography sx={{ fontSize: 16, fontWeight: 600, color: "#fff", mb: 0.5 }}>
                  {kpi.label}
                </Typography>
                {kpi.description && (
                  <Typography sx={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.4 }}>
                    {kpi.description}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </SlideFrame>
  );
};

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

// Three Columns
export const ThreeColumnsSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  const rawCols = data.columns;
  const columns: { title: string; body: string; iconName?: string }[] = Array.isArray(rawCols)
    ? rawCols.map((c: unknown) => {
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
      <Box sx={{ textAlign: "center", mb: 6 }}>
        <SlideBadge text={data.badge as string} primary={primary} animate={animate} />
        <AnimatedText
          animate={animate}
          sx={{
            fontSize: 38,
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.2,
            fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
          }}
        >
          {data.title as string}
        </AnimatedText>
        {data.subtitle && typeof data.subtitle === "string" ? (
          <AnimatedText
            animate={animate}
            sx={{ fontSize: 18, color: "#94a3b8", mt: 2, maxWidth: "70%", mx: "auto" }}
          >
            {data.subtitle}
          </AnimatedText>
        ) : null}
      </Box>

      <Box sx={{ display: "flex", gap: 4, px: 2, pb: 4 }}>
        {columns.map((col, i) => (
          <Box key={i} sx={{ flex: 1, textAlign: "center" }}>
            <Box
              sx={{
                display: "inline-flex",
                p: 2,
                borderRadius: "50%",
                bgcolor: `${primary}15`,
                mb: 3,
              }}
            >
              <DynamicIcon name={col.iconName} sx={{ fontSize: 36, color: primary }} />
            </Box>
            <Typography sx={{ fontSize: 20, fontWeight: 700, color: "#fff", mb: 1.5 }}>
              {String(col.title)}
            </Typography>
            <Typography sx={{ fontSize: 15, color: "#cbd5e1", lineHeight: 1.6 }}>
              {String(col.body)}
            </Typography>
          </Box>
        ))}
      </Box>
    </SlideFrame>
  );
};

// Quote Showcase
export const QuoteShowcaseSlide: React.FC<SlideProps> = ({
  data = {},
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";

  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Box sx={{ display: "flex", height: "100%", ml: -6, mt: -6, mb: -6, mr: -6 }}>
        <Box sx={{ width: "50%" }}>
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
          <AnimatedText
            animate={animate}
            sx={{
              fontSize: 32,
              fontWeight: 500,
              fontStyle: "italic",
              color: "#f8fafc",
              lineHeight: 1.4,
              fontFamily: `'${fonts?.heading || "Inter"}', serif`,
            }}
          >
            &quot;{String(data.statement)}&quot;
          </AnimatedText>
          {data.author && typeof data.author === "string" ? (
            <AnimatedText
              animate={animate}
              sx={{ fontSize: 18, fontWeight: 700, color: primary, mt: 4 }}
            >
              &mdash; {data.author}
            </AnimatedText>
          ) : null}
        </Box>
      </Box>
    </SlideFrame>
  );
};

// ─── Slide Renderer dispatcher ───────────────────────────────────────

const slideRenderers: Record<string, React.FC<SlideProps>> = {
  title_only: TitleOnlySlide,
  text_block: TextBlockSlide,
  text_image: TextImageSlide,
  bullet_list: BulletListSlide,
  two_columns: TwoColumnsSlide,
  team_grid: TeamGridSlide,
  showcase: ShowcaseSlide,
  stats: StatsSlide,
  split_kpi: SplitKpiSlide,
  split_cards: SplitCardsSlide,
  image_with_list: ImageWithListSlide,
  three_columns: ThreeColumnsSlide,
  quote_showcase: QuoteShowcaseSlide,
};

interface SlideRendererProps extends SlideProps {
  typeKey: string;
}

const SlideRenderer: React.FC<SlideRendererProps> = ({ typeKey, ...rest }) => {
  const Renderer = slideRenderers[typeKey];
  if (!Renderer) {
    return (
      <Box sx={{ p: 4, color: "error.main" }}>
        <Typography>Unknown slide type: {typeKey}</Typography>
      </Box>
    );
  }
  return <Renderer {...rest} />;
};

export default SlideRenderer;
