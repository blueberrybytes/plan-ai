import React, { useState, useEffect } from "react";
import {
  Box,
  IconButton,
  Fade,
  Slide,
  Zoom,
  Grow,
  CircularProgress,
  Typography,
  Tooltip,
  Select,
  MenuItem,
} from "@mui/material";
import { Helmet } from "react-helmet-async";
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
} from "@mui/icons-material";
import { useParams, useSearchParams } from "react-router-dom";
import SlideRenderer from "../components/slides/SlideRenderer";
import { useGetPublicPresentationQuery } from "../store/apis/slideApi";

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
  } = useGetPublicPresentationQuery(presentationId || "", {
    skip: !presentationId,
    refetchOnMountOrArgChange: true,
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const animation = searchParams.get("animation") || "fade";

  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("left");
  const [fadeIn, setFadeIn] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scale, setScale] = useState(1);

  // Swipe detection states
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEndHandler = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    const slideCount = Array.isArray(presentation?.slidesJson)
      ? (presentation?.slidesJson as SlideData[]).length
      : 0;

    if (isLeftSwipe && currentSlide < slideCount - 1) {
      handleSlideChange(currentSlide + 1);
    } else if (isRightSwipe && currentSlide > 0) {
      handleSlideChange(currentSlide - 1);
    }
  };

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

  const handleSlideChange = React.useCallback(
    (newIndex: number) => {
      setSlideDirection(newIndex > currentSlide ? "left" : "right");
      if (animation === "none") {
        setCurrentSlide(newIndex);
        return;
      }
      setFadeIn(false);
      setTimeout(() => {
        setCurrentSlide(newIndex);
        setFadeIn(true);
      }, 200); // 200ms fade out before switching
    },
    [currentSlide, animation],
  );

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
  }, [presentation, currentSlide, handleSlideChange]);

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
  const brandTheme = presentation.theme;
  const brandColors = brandTheme
    ? {
        primary: brandTheme.primaryColor || "#6366f1",
        secondary: brandTheme.secondaryColor || "#a78bfa",
        background: brandTheme.backgroundColor || "#0f172a",
        backgroundStyle:
          (brandTheme.backgroundStyle as "solid" | "gradient" | "mesh" | "minimal") || undefined,
        cardStyle: (brandTheme.cardStyle as "flat" | "glass" | "outline") || undefined,
        logoUrl: brandTheme.logoUrl || null,
      }
    : undefined;

  const fonts = brandTheme
    ? {
        heading: brandTheme.headingFont || undefined,
        body: brandTheme.bodyFont || undefined,
      }
    : undefined;

  const renderTransition = (children: React.ReactElement) => {
    switch (animation) {
      case "slide":
        return (
          <Slide direction={slideDirection} in={fadeIn} timeout={300}>
            {children}
          </Slide>
        );
      case "zoom":
        return (
          <Zoom in={fadeIn} timeout={400}>
            {children}
          </Zoom>
        );
      case "grow":
        return (
          <Grow in={fadeIn} timeout={500} style={{ transformOrigin: "center center" }}>
            {children}
          </Grow>
        );
      case "none":
        return <>{children}</>;
      case "fade":
      default:
        return (
          <Fade in={fadeIn} timeout={300}>
            {children}
          </Fade>
        );
    }
  };

  return (
    <Box
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEndHandler}
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        bgcolor: brandColors?.background || "#1a1a2e",
        transition: "background-color 0.5s",
        overflow: "hidden" /* Prevent pull-to-refresh or native swipe bounces if possible */,
      }}
    >
      <Helmet>
        <title>{`${presentation.title} | Plan AI`}</title>
        <meta name="description" content={`View presentation: ${presentation.title}`} />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={window.location.href} />
        <meta property="og:title" content={presentation.title} />
        <meta property="og:description" content={`View presentation: ${presentation.title}`} />
        <meta
          property="og:image"
          content={
            brandTheme?.logoUrl ||
            "https://plan-ai.blueberrybytes.com/logos/android-chrome-512x512.png"
          }
        />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={window.location.href} />
        <meta name="twitter:title" content={presentation.title} />
        <meta name="twitter:description" content={`View presentation: ${presentation.title}`} />
        <meta
          name="twitter:image"
          content={
            brandTheme?.logoUrl ||
            "https://plan-ai.blueberrybytes.com/logos/android-chrome-512x512.png"
          }
        />
      </Helmet>
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
            display: isFullscreen ? "none" : "inline-flex",
          }}
        >
          <ChevronLeftIcon fontSize="large" />
        </IconButton>

        {/* Slide with dynamic animation */}
        {renderTransition(
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
          </Box>,
        )}

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
            display: isFullscreen ? "none" : "inline-flex",
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
              display: "inline-flex",
            }}
          >
            {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
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
            display: isFullscreen ? "none" : "block",
          }}
        >
          {currentSlide + 1} / {slides.length}
        </Box>

        {/* Top-Left Controls (Overlay) */}
        <Box
          sx={{
            position: "absolute",
            top: 20,
            left: 20,
            display: isFullscreen ? "none" : "flex",
            gap: 2,
            zIndex: 10,
          }}
        >
          {/* Animation Selector */}
          <Select
            size="small"
            value={animation}
            onChange={(e) => {
              setSearchParams((prev) => {
                prev.set("animation", e.target.value);
                return prev;
              });
            }}
            sx={{
              color: "rgba(255,255,255,0.6)",
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: "rgba(255,255,255,0.2)",
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: "rgba(255,255,255,0.5)",
              },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: "white",
              },
              "& .MuiSvgIcon-root": {
                color: "rgba(255,255,255,0.6)",
              },
              height: 36,
              fontSize: 14,
              bgcolor: "rgba(0,0,0,0.2)",
            }}
          >
            <MenuItem value="fade">Fade Transition</MenuItem>
            <MenuItem value="slide">Slide Transition</MenuItem>
            <MenuItem value="zoom">Zoom / Prezi effect</MenuItem>
            <MenuItem value="grow">Grow out</MenuItem>
            <MenuItem value="none">No effect</MenuItem>
          </Select>

          {/* Theme Selector Removed */}
        </Box>
      </Box>
    </Box>
  );
};

export default PublicSlideView;
