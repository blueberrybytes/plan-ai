import React, { useState } from "react";
import { Box, Typography, Button, IconButton, CircularProgress } from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from "@mui/icons-material";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import SlideRenderer from "../components/slides/SlideRenderer";
import { useGetPresentationQuery, useGetTemplateQuery } from "../store/apis/slideApi";
import { exportToPptx } from "../services/pptxExportService";

interface SlideData {
  slideTypeKey: string;
  parameters: Record<string, unknown>;
}

const SlideView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isStreaming = searchParams.get("streaming") === "true";

  const { presentationId } = useParams<{ presentationId: string }>();
  const { data: presentation, isLoading } = useGetPresentationQuery(presentationId || "");
  const { data: template } = useGetTemplateQuery(presentation?.templateId || "", {
    skip: !presentation?.templateId,
  });

  const [currentSlide, setCurrentSlide] = useState(0);

  // Keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        const slideCount = Array.isArray(presentation?.slidesJson)
          ? presentation.slidesJson.length
          : 1;
        setCurrentSlide((prev) => Math.min(slideCount - 1, prev + 1));
      } else if (e.key === "ArrowLeft") {
        setCurrentSlide((prev) => Math.max(0, prev - 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [presentation]);

  if (isLoading) {
    return (
      <SidebarLayout>
        <Box
          sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}
        >
          <CircularProgress />
        </Box>
      </SidebarLayout>
    );
  }

  if (!presentation) {
    return (
      <SidebarLayout>
        <Box sx={{ p: 4 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/slides")}>
            {t("slides.actions.back")}
          </Button>
          <Typography sx={{ mt: 2 }}>Presentation not found.</Typography>
        </Box>
      </SidebarLayout>
    );
  }

  const slides = (presentation.slidesJson as SlideData[]) || [];
  const brandColors = template
    ? {
        primary: template.primaryColor || "#6366f1",
        secondary: template.secondaryColor || "#a78bfa",
        background: template.backgroundColor || "#0f172a",
      }
    : undefined;

  const fonts = template
    ? { heading: template.headingFont || "Inter", body: template.bodyFont || "Inter" }
    : undefined;

  const slide = slides[currentSlide];

  const handleDownload = async () => {
    if (!presentation || !slides.length || !brandColors || !fonts) return;
    try {
      await exportToPptx({
        title: presentation.title,
        slides,
        theme: {
          primaryColor: brandColors.primary,
          secondaryColor: brandColors.secondary,
          backgroundColor: brandColors.background,
          headingFont: fonts.heading,
          bodyFont: fonts.body,
        },
      });
    } catch (error) {
      console.error("Failed to export PPTX", error);
      alert("Failed to export presentation.");
    }
  };

  return (
    <SidebarLayout>
      <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", bgcolor: "#1a1a2e" }}>
        {/* Top bar */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 3,
            py: 1.5,
            bgcolor: "rgba(0,0,0,0.3)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate("/slides")}
              sx={{ color: "#94a3b8" }}
            >
              {t("slides.actions.back")}
            </Button>
            <Typography variant="h6" sx={{ color: "#e2e8f0", fontWeight: 600 }}>
              {presentation.title}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Typography variant="body2" sx={{ color: "#64748b" }}>
              {currentSlide + 1} / {slides.length}
            </Typography>
            <Button variant="outlined" size="small" onClick={handleDownload}>
              Download PPTX
            </Button>
          </Box>
        </Box>

        {/* Main slide area */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            p: 4,
          }}
        >
          {/* Previous button */}
          <IconButton
            onClick={() => setCurrentSlide((i) => Math.max(0, i - 1))}
            disabled={currentSlide === 0}
            sx={{
              position: "absolute",
              left: 24,
              color: "#94a3b8",
              bgcolor: "rgba(255,255,255,0.05)",
              "&:hover": { bgcolor: "rgba(255,255,255,0.1)" },
            }}
          >
            <ChevronLeftIcon fontSize="large" />
          </IconButton>

          {/* Slide */}
          {slide && (
            <SlideRenderer
              typeKey={slide.slideTypeKey}
              data={slide.parameters}
              brandColors={brandColors}
              fonts={fonts}
              scale={0.85}
              animate={isStreaming}
            />
          )}

          {/* Next button */}
          <IconButton
            onClick={() => setCurrentSlide((i) => Math.min(slides.length - 1, i + 1))}
            disabled={currentSlide >= slides.length - 1}
            sx={{
              position: "absolute",
              right: 24,
              color: "#94a3b8",
              bgcolor: "rgba(255,255,255,0.05)",
              "&:hover": { bgcolor: "rgba(255,255,255,0.1)" },
            }}
          >
            <ChevronRightIcon fontSize="large" />
          </IconButton>
        </Box>

        {/* Bottom thumbnails */}
        <Box
          sx={{
            display: "flex",
            gap: 1.5,
            justifyContent: "center",
            py: 2,
            px: 3,
            bgcolor: "rgba(0,0,0,0.3)",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            overflowX: "auto",
          }}
        >
          {slides.map((s, i) => (
            <Box
              key={i}
              onClick={() => setCurrentSlide(i)}
              sx={{
                cursor: "pointer",
                border: i === currentSlide ? "2px solid" : "2px solid transparent",
                borderColor: i === currentSlide ? "primary.main" : "transparent",
                borderRadius: 1,
                opacity: i === currentSlide ? 1 : 0.6,
                transition: "all 0.15s ease",
                "&:hover": { opacity: 1 },
              }}
            >
              <SlideRenderer
                typeKey={s.slideTypeKey}
                data={s.parameters}
                brandColors={brandColors}
                fonts={fonts}
                scale={0.12}
              />
            </Box>
          ))}
        </Box>
      </Box>
    </SidebarLayout>
  );
};

export default SlideView;
