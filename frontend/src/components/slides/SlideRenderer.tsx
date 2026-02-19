import React from "react";
import { Box, Typography } from "@mui/material";

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
  };
  fonts?: {
    heading?: string;
    body?: string;
  };
  scale?: number;
}

const SlideFrame: React.FC<SlideFrameProps> = ({ children, brandColors, fonts, scale = 1 }) => {
  const bg = brandColors?.background || "#0f172a";

  return (
    <Box
      sx={{
        width: 960 * scale,
        height: 540 * scale,
        bgcolor: bg,
        borderRadius: 2,
        overflow: "hidden",
        position: "relative",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        transform: `scale(1)`,
        transformOrigin: "top left",
      }}
    >
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
  };
  fonts?: {
    heading?: string;
    body?: string;
  };
  scale?: number;
  animate?: boolean;
}

// Title Only
// Title Only
export const TitleOnlySlide: React.FC<SlideProps> = ({
  data,
  brandColors,
  fonts,
  scale,
  animate,
}) => {
  const primary = brandColors?.primary || "#6366f1";
  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Box sx={{ textAlign: "center" }}>
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
// Text Block
export const TextBlockSlide: React.FC<SlideProps> = ({ data, brandColors, scale, animate }) => {
  const primary = brandColors?.primary || "#6366f1";
  return (
    <SlideFrame brandColors={brandColors} scale={scale}>
      <AnimatedText animate={animate} sx={{ fontSize: 36, fontWeight: 700, mb: 3, color: primary }}>
        {data.title as string}
      </AnimatedText>
      <AnimatedText animate={animate} sx={{ fontSize: 18, lineHeight: 1.7, color: "#cbd5e1" }}>
        {data.body as string}
      </AnimatedText>
    </SlideFrame>
  );
};

// Text + Image
// Text + Image
export const TextImageSlide: React.FC<SlideProps> = ({
  data,
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
          <img
            src={
              (data.imageUrl as string) ||
              `https://image.pollinations.ai/prompt/${encodeURIComponent(String(data.imageQuery || "abstract background"))}?width=800&height=600&nologo=true`
            }
            alt={String(data.imageQuery || "Image")}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </Box>
      </Box>
    </SlideFrame>
  );
};

// Bullet List
export const BulletListSlide: React.FC<SlideProps> = ({ data, brandColors, fonts, scale }) => {
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
      <Typography
        sx={{
          fontSize: 36,
          fontWeight: 700,
          mb: 4,
          color: primary,
          fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
        }}
      >
        {data.title as string}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {bullets.map((bullet, i) => (
          <Box key={i} sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: primary,
                mt: 1,
                flexShrink: 0,
              }}
            />
            <Typography sx={{ fontSize: 18, color: "#cbd5e1" }}>{bullet}</Typography>
          </Box>
        ))}
      </Box>
    </SlideFrame>
  );
};

// Two Columns
export const TwoColumnsSlide: React.FC<SlideProps> = ({ data, brandColors, fonts, scale }) => {
  const primary = brandColors?.primary || "#6366f1";
  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Typography
        sx={{
          fontSize: 36,
          fontWeight: 700,
          mb: 4,
          color: primary,
          textAlign: "center",
          fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
        }}
      >
        {data.title as string}
      </Typography>
      <Box sx={{ display: "flex", gap: 4 }}>
        <Box
          sx={{
            flex: 1,
            p: 3,
            borderRadius: 2,
            bgcolor: "rgba(99,102,241,0.06)",
            border: "1px solid rgba(99,102,241,0.15)",
          }}
        >
          {data.leftTitle ? (
            <Typography sx={{ fontSize: 20, fontWeight: 600, mb: 1.5, color: "#e2e8f0" }}>
              {String(data.leftTitle)}
            </Typography>
          ) : null}
          <Typography sx={{ fontSize: 15, lineHeight: 1.7, color: "#94a3b8" }}>
            {data.leftBody as string}
          </Typography>
        </Box>
        <Box
          sx={{
            flex: 1,
            p: 3,
            borderRadius: 2,
            bgcolor: "rgba(16,185,129,0.06)",
            border: "1px solid rgba(16,185,129,0.15)",
          }}
        >
          {data.rightTitle ? (
            <Typography sx={{ fontSize: 20, fontWeight: 600, mb: 1.5, color: "#e2e8f0" }}>
              {String(data.rightTitle)}
            </Typography>
          ) : null}
          <Typography sx={{ fontSize: 15, lineHeight: 1.7, color: "#94a3b8" }}>
            {data.rightBody as string}
          </Typography>
        </Box>
      </Box>
    </SlideFrame>
  );
};

// Team Grid
export const TeamGridSlide: React.FC<SlideProps> = ({ data, brandColors, fonts, scale }) => {
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
  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Typography
        sx={{
          fontSize: 36,
          fontWeight: 700,
          mb: 4,
          color: primary,
          textAlign: "center",
          fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
        }}
      >
        {data.title as string}
      </Typography>
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
              p: 2,
              borderRadius: 2,
              bgcolor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                bgcolor: primary,
                mx: "auto",
                mb: 1.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                fontWeight: 700,
                color: "#fff",
              }}
            >
              {member.name.charAt(0)}
            </Box>
            <Typography sx={{ fontSize: 16, fontWeight: 600, color: "#e2e8f0" }}>
              {member.name}
            </Typography>
            <Typography sx={{ fontSize: 13, color: primary, mb: 0.5 }}>{member.role}</Typography>
            <Typography sx={{ fontSize: 12, color: "#64748b" }}>{member.bio}</Typography>
          </Box>
        ))}
      </Box>
    </SlideFrame>
  );
};

// Showcase
export const ShowcaseSlide: React.FC<SlideProps> = ({ data, brandColors, fonts, scale }) => {
  const primary = brandColors?.primary || "#6366f1";
  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Typography
        sx={{
          fontSize: 32,
          fontWeight: 700,
          mb: 3,
          color: primary,
          textAlign: "center",
          fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
        }}
      >
        {data.title as string}
      </Typography>
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
        <img
          src={
            (data.imageUrl as string) ||
            `https://image.pollinations.ai/prompt/${encodeURIComponent(String(data.imageQuery || "professional showcase image"))}?width=1200&height=600&nologo=true`
          }
          alt={String(data.imageQuery || "Featured Image")}
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
export const StatsSlide: React.FC<SlideProps> = ({ data, brandColors, fonts, scale }) => {
  const primary = brandColors?.primary || "#6366f1";
  const rawStats = data.stats;
  const stats: { label: string; value: string }[] = Array.isArray(rawStats)
    ? rawStats.map((s: unknown) => {
        const obj = s as Record<string, unknown>;
        return { label: String(obj.label || ""), value: String(obj.value || "") };
      })
    : [];
  return (
    <SlideFrame brandColors={brandColors} fonts={fonts} scale={scale}>
      <Typography
        sx={{
          fontSize: 36,
          fontWeight: 700,
          mb: 5,
          color: primary,
          textAlign: "center",
          fontFamily: `'${fonts?.heading || "Inter"}', sans-serif`,
        }}
      >
        {data.title as string}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, 1fr)`,
          gap: 3,
        }}
      >
        {stats.map((stat, i) => (
          <Box
            key={i}
            sx={{
              textAlign: "center",
              p: 3,
              borderRadius: 2,
              bgcolor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Typography
              sx={{
                fontSize: 40,
                fontWeight: 800,
                background: `linear-gradient(135deg, ${primary}, #a78bfa)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                mb: 0.5,
              }}
            >
              {stat.value}
            </Typography>
            <Typography sx={{ fontSize: 14, color: "#94a3b8", fontWeight: 500 }}>
              {stat.label}
            </Typography>
          </Box>
        ))}
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
