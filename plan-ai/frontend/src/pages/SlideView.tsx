import React, { useState } from "react";
import {
  Box,
  Typography,
  Button,
  IconButton,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  SelectChangeEvent,
  Tooltip,
  Menu,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Language as LanguageIcon,
  Info as InfoIcon,
  Edit as EditIcon,
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  KeyboardArrowLeft as MoveLeftIcon,
  KeyboardArrowRight as MoveRightIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import SlideRenderer from "../components/slides/SlideRenderer";
import { useGetPresentationQuery, useUpdatePresentationMutation } from "../store/apis/slideApi";
import { useGetBrandThemesQuery } from "../store/apis/brandThemeApi";
import { exportToPptx } from "../services/pptxExportService";
import EditSlideTextDialog from "../components/slides/EditSlideTextDialog";
import AddSlideDialog from "../components/slides/AddSlideDialog";
interface SlideData {
  slideTypeKey: string;
  parameters: Record<string, unknown>;
}

const SlideView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { presentationId } = useParams<{ presentationId: string }>();
  const { data: presentation, isLoading } = useGetPresentationQuery(presentationId || "", {
    skip: !presentationId,
  });

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isEditSlideOpen, setIsEditSlideOpen] = useState(false);
  const [isAddSlideOpen, setIsAddSlideOpen] = useState(false);
  const [showPromptInfo, setShowPromptInfo] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Thumbnail Menu State
  const [thumbnailMenuAnchor, setThumbnailMenuAnchor] = useState<null | HTMLElement>(null);
  const [thumbnailMenuIndex, setThumbnailMenuIndex] = useState<number | null>(null);

  const [updatePresentation] = useUpdatePresentationMutation();
  const { data: themes = [] } = useGetBrandThemesQuery();

  const handleThemeChange = async (event: SelectChangeEvent<string>) => {
    if (!presentation) return;
    const selectedValue = event.target.value;
    try {
      if (selectedValue === "") {
        await updatePresentation({ id: presentation.id, data: { themeId: null } }).unwrap();
      } else {
        const existingTheme = themes.find((t) => t.id === selectedValue);
        if (existingTheme) {
          await updatePresentation({
            id: presentation.id,
            data: { themeId: existingTheme.id },
          }).unwrap();
        }
      }
    } catch (err) {
      console.error("Failed to update theme", err);
    }
  };

  // Auto-advance to new slides if streaming and user hasn't navigated back?
  // Let's just notify or show them.

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

  if (isLoading || (!presentation && isLoading)) {
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

  // Show "Generating..." if status is generating but no slides yet
  const isGenerating =
    presentation?.status === "GENERATING" || presentation?.status === "GENERATING_IMAGES";
  const slides = (presentation?.slidesJson as SlideData[]) || [];

  if (isGenerating && slides.length === 0) {
    return (
      <SidebarLayout>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            height: "100vh",
            gap: 2,
          }}
        >
          <CircularProgress size={60} />
          <Typography variant="h5" color="text.secondary" sx={{ animation: "pulse 1.5s infinite" }}>
            {t("slides.create.generating")}...
          </Typography>
          <Typography variant="body2" color="text.disabled">
            Creation in progress. Slides will appear here live.
          </Typography>
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

  const brandColors = presentation?.theme
    ? {
        primary: presentation.theme.primaryColor || "#6366f1",
        secondary: presentation.theme.secondaryColor || "#a78bfa",
        background: presentation.theme.backgroundColor || "#0f172a",
        backgroundStyle:
          (presentation.theme.backgroundStyle as "solid" | "gradient" | "mesh" | "minimal") ||
          undefined,
        cardStyle: (presentation.theme.cardStyle as "flat" | "glass" | "outline") || undefined,
        logoUrl: presentation.theme.logoUrl || null,
      }
    : undefined;

  const fonts = presentation?.theme
    ? {
        heading: presentation.theme.headingFont || "Inter",
        body: presentation.theme.bodyFont || "Inter",
      }
    : undefined;

  const slide = slides[currentSlide];

  const handleDownload = async () => {
    if (!presentation || !slides.length || !brandColors || !fonts) return;
    setIsExporting(true);
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
          logoUrl: brandColors.logoUrl || undefined,
        },
      });
    } catch (error) {
      console.error("Failed to export PPTX", error);
      alert("Failed to export presentation.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveSlide = async (updatedSlideData: SlideData) => {
    if (!presentation || !slides.length) return;
    const newSlides = [...slides];
    newSlides[currentSlide] = updatedSlideData;

    try {
      await updatePresentation({
        id: presentation.id,
        data: { slidesJson: newSlides },
      }).unwrap();
      setIsEditSlideOpen(false);
    } catch (error) {
      console.error("Failed to save slide", error);
      alert("Failed to save slide modifications.");
    }
  };

  const handleDeleteSlide = async () => {
    if (!presentation || slides.length <= 1) {
      alert("Cannot delete the last remaining slide in the presentation.");
      return;
    }

    if (!window.confirm("Are you sure you want to permanently delete this slide?")) {
      return;
    }

    const newSlides = [...slides];
    newSlides.splice(currentSlide, 1);

    try {
      await updatePresentation({
        id: presentation.id,
        data: { slidesJson: newSlides },
      }).unwrap();

      if (currentSlide >= newSlides.length) {
        setCurrentSlide(Math.max(0, newSlides.length - 1));
      }
    } catch (error) {
      console.error("Failed to delete slide", error);
      alert("Failed to delete slide.");
    }
  };

  const handleMoveSlide = async (index: number, direction: "left" | "right") => {
    if (!presentation || slides.length <= 1) return;
    const newIndex = direction === "left" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= slides.length) return;

    const newSlides = [...slides];
    const [movedSlide] = newSlides.splice(index, 1);
    newSlides.splice(newIndex, 0, movedSlide);

    try {
      await updatePresentation({
        id: presentation.id,
        data: { slidesJson: newSlides },
      }).unwrap();

      if (currentSlide === index) {
        setCurrentSlide(newIndex);
      } else if (currentSlide === newIndex && direction === "left") {
        setCurrentSlide(currentSlide + 1);
      } else if (currentSlide === newIndex && direction === "right") {
        setCurrentSlide(currentSlide - 1);
      }
    } catch (error) {
      console.error("Failed to move slide", error);
      alert("Failed to reorder slide.");
    }
    handleCloseThumbnailMenu();
  };

  const handleDeleteSlideAtIndex = async (index: number) => {
    if (!presentation || slides.length <= 1) {
      alert("Cannot delete the last remaining slide in the presentation.");
      return;
    }

    if (!window.confirm("Are you sure you want to permanently delete this slide?")) {
      return;
    }

    const newSlides = [...slides];
    newSlides.splice(index, 1);

    try {
      await updatePresentation({
        id: presentation.id,
        data: { slidesJson: newSlides },
      }).unwrap();

      if (currentSlide === index) {
        setCurrentSlide(Math.min(index, newSlides.length - 1));
      } else if (currentSlide > index) {
        setCurrentSlide(currentSlide - 1);
      }
    } catch (error) {
      console.error("Failed to delete slide", error);
      alert("Failed to delete slide.");
    }
    handleCloseThumbnailMenu();
  };

  const handleOpenThumbnailMenu = (event: React.MouseEvent<HTMLElement>, index: number) => {
    event.stopPropagation();
    setThumbnailMenuAnchor(event.currentTarget);
    setThumbnailMenuIndex(index);
  };

  const handleCloseThumbnailMenu = () => {
    setThumbnailMenuAnchor(null);
    setThumbnailMenuIndex(null);
  };

  const handleOpenPublicLink = async () => {
    if (!presentation?.id) return;
    const win = window.open("", "_blank");
    if (win) win.location.href = `/p/${presentation.id}`;
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

            <FormControl size="small" sx={{ minWidth: 150, ml: 2, m: 0 }}>
              <Select
                value={presentation?.themeId || ""}
                onChange={handleThemeChange}
                displayEmpty
                sx={{
                  color: "#e2e8f0",
                  height: 36,
                  "& .MuiSelect-icon": { color: "#94a3b8" },
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.2)" },
                  "&:hover .MuiOutlinedInput-notchedOutline": {
                    borderColor: "rgba(255,255,255,0.4)",
                  },
                }}
              >
                <MenuItem value="">Default / No Theme</MenuItem>
                {themes.length === 0 ? (
                  <MenuItem disabled value="none">
                    <em>{t("docThemes.empty", "No themes available")}</em>
                  </MenuItem>
                ) : (
                  themes.map((theme) => (
                    <MenuItem key={theme.id} value={theme.id}>
                      {theme.name}
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Button
              startIcon={<AddIcon />}
              onClick={() => setIsAddSlideOpen(true)}
              sx={{ color: "#94a3b8", borderColor: "rgba(148,163,184,0.3)" }}
            >
              {t("slides.actions.addSlide", "Add Slide")}
            </Button>
            <Button
              startIcon={<EditIcon />}
              onClick={() => setIsEditSlideOpen(true)}
              sx={{ color: "#94a3b8", borderColor: "rgba(148,163,184,0.3)" }}
            >
              {t("slides.actions.editSlide")}
            </Button>
            {presentation?.prompt && (
              <Tooltip title="View Original Prompt">
                <IconButton
                  onClick={() => setShowPromptInfo(!showPromptInfo)}
                  sx={{ color: showPromptInfo ? "primary.light" : "#64748b" }}
                >
                  <InfoIcon />
                </IconButton>
              </Tooltip>
            )}
            <Typography variant="body2" sx={{ color: "#64748b" }}>
              {currentSlide + 1} / {slides.length}
            </Typography>
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={handleDeleteSlide}
              sx={{
                color: "#ef4444",
                borderColor: "rgba(239,68,68,0.5)",
                "&:hover": {
                  borderColor: "#ef4444",
                  bgcolor: "rgba(239,68,68,0.1)",
                },
              }}
            >
              🗑 Delete
            </Button>
            <Tooltip title={t("slides.publicMode", "Public Mode")}>
              <IconButton onClick={handleOpenPublicLink} sx={{ color: "#94a3b8" }}>
                <LanguageIcon />
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              size="small"
              onClick={handleDownload}
              disabled={isExporting}
              startIcon={isExporting ? <CircularProgress size={16} color="inherit" /> : null}
              sx={{ bgcolor: "primary.main" }}
            >
              {isExporting ? "Exporting..." : "Download PPTX"}
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
              key={currentSlide}
              typeKey={slide.slideTypeKey}
              data={slide.parameters}
              brandColors={brandColors}
              fonts={fonts}
              scale={0.85}
              animate={true}
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
                position: "relative",
                cursor: "pointer",
                border: i === currentSlide ? "2px solid" : "2px solid transparent",
                borderColor: i === currentSlide ? "primary.main" : "transparent",
                borderRadius: 1,
                opacity: i === currentSlide ? 1 : 0.6,
                transition: "all 0.15s ease",
                "&:hover": { opacity: 1 },
                "&:hover .thumbnail-options": { opacity: 1 },
              }}
            >
              <IconButton
                className="thumbnail-options"
                size="small"
                onClick={(e) => handleOpenThumbnailMenu(e, i)}
                sx={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  bgcolor: "rgba(0,0,0,0.6)",
                  color: "white",
                  opacity: i === currentSlide || thumbnailMenuIndex === i ? 1 : 0,
                  transition: "opacity 0.2s",
                  "&:hover": { bgcolor: "rgba(0,0,0,0.8)" },
                  zIndex: 10,
                }}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
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

        {/* Thumbnail Options Menu */}
        <Menu
          anchorEl={thumbnailMenuAnchor}
          open={Boolean(thumbnailMenuAnchor) && thumbnailMenuIndex !== null}
          onClose={handleCloseThumbnailMenu}
          transformOrigin={{ horizontal: "right", vertical: "top" }}
          anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        >
          <MenuItem
            onClick={() =>
              thumbnailMenuIndex !== null && handleMoveSlide(thumbnailMenuIndex, "left")
            }
            disabled={thumbnailMenuIndex === 0}
          >
            <ListItemIcon>
              <MoveLeftIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Move Left</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() =>
              thumbnailMenuIndex !== null && handleMoveSlide(thumbnailMenuIndex, "right")
            }
            disabled={thumbnailMenuIndex === slides.length - 1}
          >
            <ListItemIcon>
              <MoveRightIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Move Right</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() =>
              thumbnailMenuIndex !== null && handleDeleteSlideAtIndex(thumbnailMenuIndex)
            }
            disabled={slides.length <= 1}
            sx={{ color: "error.main" }}
          >
            <ListItemIcon>
              <DeleteIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        </Menu>
      </Box>

      {/* Prompt Info Overlay */}
      {showPromptInfo && presentation?.prompt && (
        <Box
          sx={{
            position: "absolute",
            top: 70,
            right: 24,
            width: 400,
            bgcolor: "rgba(15, 23, 42, 0.95)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(99, 102, 241, 0.2)",
            borderRadius: 2,
            p: 3,
            zIndex: 100,
            boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          }}
        >
          <Typography variant="overline" color="primary.light" sx={{ display: "block", mb: 1 }}>
            Original Generation Prompt
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto" }}
          >
            {presentation.prompt}
          </Typography>
        </Box>
      )}

      {isEditSlideOpen && slide && presentation && (
        <EditSlideTextDialog
          open={isEditSlideOpen}
          onClose={() => setIsEditSlideOpen(false)}
          slideData={slide}
          onSave={handleSaveSlide}
          slideIndex={currentSlide}
          presentationId={presentation.id}
        />
      )}

      {isAddSlideOpen && presentation && (
        <AddSlideDialog
          open={isAddSlideOpen}
          onClose={() => setIsAddSlideOpen(false)}
          presentationId={presentation.id}
          currentSlideIndex={currentSlide}
          totalSlides={slides.length}
          onSlideAdded={(newIndex) => setCurrentSlide(newIndex)}
        />
      )}
    </SidebarLayout>
  );
};

export default SlideView;
