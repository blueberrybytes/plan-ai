import React, { useState, useEffect } from "react";
import { Box, IconButton, Fade, CircularProgress, Typography, Tooltip } from "@mui/material";
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Download as DownloadIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
} from "@mui/icons-material";
import { useParams } from "react-router-dom";
import SlideRenderer from "../components/slides/SlideRenderer";
import { useGetPublicPresentationQuery } from "../store/apis/slideApi";
import { exportToPptx } from "../services/pptxExportService";

interface SlideData {
  slideTypeKey: string;
  parameters: Record<string, unknown>;
}

const PublicSlideView: React.FC = () => {
  const { presentationId } = useParams<{ presentationId: string }>();
  const {
    data: presentation,
    isLoading,
    error,
  } = useGetPublicPresentationQuery(presentationId || "", { skip: !presentationId });

  const [currentSlide, setCurrentSlide] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scale, setScale] = useState(1);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Responsive scaling
  useEffect(() => {
    const handleResize = () => {
      // Base slide dimensions
      const BASE_WIDTH = 960;
      const BASE_HEIGHT = 540;

      // Available space (add some padding)
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const padding = isFullscreen ? 0 : 40; // No padding in fullscreen for max impact, or minimal

      const availableWidth = vw - padding;
      const availableHeight = vh - padding;

      const scaleX = availableWidth / BASE_WIDTH;
      const scaleY = availableHeight / BASE_HEIGHT;

      // Fit within screen (contain)
      const newScale = Math.min(scaleX, scaleY);
      setScale(newScale);
    };

    window.addEventListener("resize", handleResize);
    handleResize(); // Init

    return () => window.removeEventListener("resize", handleResize);
  }, [isFullscreen]);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((e) => {
        console.error(`Error attempting to enable fullscreen: ${e.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const handleSlideChange = (newIndex: number) => {
    setFadeIn(false);
    setTimeout(() => {
      setCurrentSlide(newIndex);
      setFadeIn(true);
    }, 200); // 200ms fade out before switching
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!presentation) return;

      if (e.key === "ArrowRight") {
        const slideCount = Array.isArray(presentation.slidesJson)
          ? (presentation.slidesJson as SlideData[]).length
          : 0;
        if (currentSlide < slideCount - 1) {
          handleSlideChange(currentSlide + 1);
        }
      } else if (e.key === "ArrowLeft") {
        if (currentSlide > 0) {
          handleSlideChange(currentSlide - 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [presentation, currentSlide]);

  const handleDownload = async () => {
    if (!presentation) return;
    const slides = (presentation.slidesJson as SlideData[]) || [];
    const template = presentation.template;

    // Construct theme from template or defaults
    const theme = template
      ? {
          primaryColor: template.primaryColor || "#6366f1",
          secondaryColor: template.secondaryColor || "#a78bfa",
          backgroundColor: template.backgroundColor || "#0f172a",
          headingFont: template.headingFont || "Inter",
          bodyFont: template.bodyFont || "Inter",
        }
      : {
          primaryColor: "#6366f1",
          secondaryColor: "#a78bfa",
          backgroundColor: "#0f172a",
          headingFont: "Inter",
          bodyFont: "Inter",
        };

    try {
      await exportToPptx({
        title: presentation.title,
        slides,
        theme,
      });
    } catch (error) {
      console.error("Failed to export PPTX", error);
      alert("Failed to export presentation.");
    }
  };

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          bgcolor: "#1a1a2e",
          color: "white",
        }}
      >
        <CircularProgress color="inherit" />
      </Box>
    );
  }

  if (error || !presentation) {
    return (
      <Box
        sx={{
          p: 4,
          height: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          bgcolor: "#1a1a2e",
          color: "white",
        }}
      >
        <Typography variant="h5">Presentation not found or private.</Typography>
      </Box>
    );
  }

  const slides = (presentation.slidesJson as SlideData[]) || [];
  const slide = slides[currentSlide];

  // Theme for renderer
  const template = presentation.template;
  const brandColors = template
    ? {
        primary: template.primaryColor || undefined,
        secondary: template.secondaryColor || undefined,
        background: template.backgroundColor || undefined,
      }
    : undefined;
  const fonts = template
    ? {
        heading: template.headingFont || undefined,
        body: template.bodyFont || undefined,
      }
    : undefined;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        bgcolor: brandColors?.background || "#1a1a2e",
        transition: "background-color 0.5s",
      }}
    >
      {/* Main slide area */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          p: 2,
          overflow: "hidden",
        }}
      >
        {/* Previous button */}
        <IconButton
          onClick={() => handleSlideChange(Math.max(0, currentSlide - 1))}
          disabled={currentSlide === 0}
          sx={{
            position: "absolute",
            left: 20,
            zIndex: 10,
            color: "rgba(255,255,255,0.5)",
            bgcolor: "rgba(0,0,0,0.2)",
            "&:hover": { bgcolor: "rgba(0,0,0,0.4)", color: "white" },
            transition: "all 0.2s",
            opacity: currentSlide === 0 ? 0 : 1,
          }}
        >
          <ChevronLeftIcon fontSize="large" />
        </IconButton>

        {/* Slide with Fade Transition */}
        <Fade in={fadeIn} timeout={300}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              width: "100%",
              height: "100%",
              alignItems: "center",
            }}
          >
            {slide && (
              <SlideRenderer
                typeKey={slide.slideTypeKey}
                data={slide.parameters}
                brandColors={brandColors}
                fonts={fonts}
                scale={scale}
                animate={true}
              />
            )}
          </Box>
        </Fade>

        {/* Next button */}
        <IconButton
          onClick={() => handleSlideChange(Math.min(slides.length - 1, currentSlide + 1))}
          disabled={currentSlide >= slides.length - 1}
          sx={{
            position: "absolute",
            right: 20,
            zIndex: 10,
            color: "rgba(255,255,255,0.5)",
            bgcolor: "rgba(0,0,0,0.2)",
            "&:hover": { bgcolor: "rgba(0,0,0,0.4)", color: "white" },
            transition: "all 0.2s",
            opacity: currentSlide >= slides.length - 1 ? 0 : 1,
          }}
        >
          <ChevronRightIcon fontSize="large" />
        </IconButton>

        {/* Fullscreen Button (Overlay) */}
        <Tooltip title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}>
          <IconButton
            onClick={handleToggleFullscreen}
            sx={{
              position: "absolute",
              top: 20,
              right: 60,
              color: "rgba(255,255,255,0.4)",
              "&:hover": { color: "white" },
            }}
          >
            {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </IconButton>
        </Tooltip>

        {/* Download Button (Overlay) */}
        <Tooltip title="Download PPTX">
          <IconButton
            onClick={handleDownload}
            sx={{
              position: "absolute",
              top: 20,
              right: 20,
              color: "rgba(255,255,255,0.4)",
              "&:hover": { color: "white" },
            }}
          >
            <DownloadIcon />
          </IconButton>
        </Tooltip>

        {/* Slide Counter (Overlay) */}
        <Box
          sx={{
            position: "absolute",
            bottom: 20,
            right: 30,
            color: "rgba(255,255,255,0.4)",
            fontSize: 14,
            fontFamily: "monospace",
          }}
        >
          {currentSlide + 1} / {slides.length}
        </Box>
      </Box>
    </Box>
  );
};

export default PublicSlideView;
