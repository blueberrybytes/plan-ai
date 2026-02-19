import React from "react";
import { Box, Typography, Button, Card, CardContent, Grid, IconButton } from "@mui/material";
import {
  Add as AddIcon,
  Palette as PaletteIcon,
  ViewCarousel as ViewCarouselIcon,
  Slideshow as SlideshowIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  Download as DownloadIcon,
  Language as LanguageIcon,
  AutoAwesome as AutoAwesomeIcon,
  GridView as GridViewIcon,
} from "@mui/icons-material";

import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import SlideRenderer from "../components/slides/SlideRenderer";
import {
  useGetPresentationsQuery,
  useDeletePresentationMutation,
  type PresentationResponse,
} from "../store/apis/slideApi";
import { exportToPptx } from "../services/pptxExportService";
import EditPresentationDialog from "../components/slides/EditPresentationDialog";

interface SlideData {
  slideTypeKey: string;
  parameters: Record<string, unknown>;
}

const Slides: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: presentations = [], isLoading } = useGetPresentationsQuery();
  const [deletePresentation] = useDeletePresentationMutation();

  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [selectedPresentation, setSelectedPresentation] =
    React.useState<PresentationResponse | null>(null);

  const handleEditClose = () => {
    setEditDialogOpen(false);
    setSelectedPresentation(null);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm(t("slides.presentations.deleteConfirm"))) {
      await deletePresentation(id);
    }
  };

  const handleDownload = async (pres: PresentationResponse) => {
    if (!pres.slidesJson) return;
    try {
      await exportToPptx({
        title: pres.title,
        slides: pres.slidesJson as SlideData[],
        theme: pres.template
          ? {
              primaryColor: pres.template.primaryColor || "#000000",
              secondaryColor: pres.template.secondaryColor || "#666666",
              backgroundColor: pres.template.backgroundColor || "#ffffff",
              headingFont: pres.template.headingFont || "Arial",
              bodyFont: pres.template.bodyFont || "Arial",
            }
          : {
              primaryColor: "#000000",
              secondaryColor: "#666666",
              backgroundColor: "#ffffff",
              headingFont: "Arial",
              bodyFont: "Arial",
            },
      });
    } catch (e) {
      console.error("Export failed", e);
      alert("Failed to export presentation.");
    }
  };

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: "auto" }}>
        {/* Header */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4 }}>
          <Typography variant="h4" fontWeight={700}>
            {t("slides.title")}
          </Typography>
        </Box>

        {/* Action Buttons */}
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 5 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            size="large"
            onClick={() => navigate("/slides/create")}
          >
            {t("slides.actions.createSlides")}
          </Button>
          <Button
            variant="outlined"
            startIcon={<ViewCarouselIcon />}
            size="large"
            onClick={() => navigate("/slides/types")}
          >
            {t("slides.actions.viewSlideTypes")}
          </Button>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            size="large"
            onClick={() => navigate("/slides/themes/create")}
          >
            {t("slides.actions.createTheme")}
          </Button>
          <Button
            variant="outlined"
            startIcon={<PaletteIcon />}
            size="large"
            onClick={() => navigate("/slides/themes")}
          >
            {t("slides.actions.viewThemes")}
          </Button>
        </Box>

        {/* Presentations List */}
        <Typography variant="h5" fontWeight={600} sx={{ mb: 2 }}>
          {t("slides.presentations.title")}
        </Typography>

        {isLoading ? (
          <Typography color="text.secondary">{t("slides.presentations.loading")}</Typography>
        ) : presentations.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              py: 10,
              px: 4,
              borderRadius: 3,
              border: "1px dashed",
              borderColor: "divider",
              bgcolor: "rgba(255,255,255,0.02)",
            }}
          >
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, rgba(67,97,238,0.15) 0%, rgba(167,139,250,0.15) 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 3,
              }}
            >
              <SlideshowIcon sx={{ fontSize: 40, color: "primary.main" }} />
            </Box>
            <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
              {t("slides.presentations.emptyTitle")}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 440 }}>
              {t("slides.presentations.emptyDescription")}
            </Typography>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
              <Button
                variant="contained"
                size="large"
                startIcon={<AutoAwesomeIcon />}
                onClick={() => navigate("/slides/create")}
              >
                {t("slides.presentations.emptyCtaPrimary")}
              </Button>
              <Button
                variant="outlined"
                size="large"
                startIcon={<GridViewIcon />}
                onClick={() => navigate("/slides/types")}
              >
                {t("slides.presentations.emptyCtaSecondary")}
              </Button>
            </Box>
          </Box>
        ) : (
          <Grid container spacing={2}>
            {presentations.map((pres) => (
              <Grid item xs={12} sm={6} md={4} key={pres.id}>
                <Card
                  variant="outlined"
                  sx={{ cursor: "pointer", position: "relative" }}
                  onClick={() => navigate(`/slides/view/${pres.id}`)}
                >
                  {/* First slide thumbnail */}
                  {(() => {
                    const slides = Array.isArray(pres.slidesJson)
                      ? (pres.slidesJson as SlideData[])
                      : [];
                    const first = slides[0];
                    const brandColors = pres.template
                      ? {
                          primary: pres.template.primaryColor || undefined,
                          secondary: pres.template.secondaryColor || undefined,
                          background: pres.template.backgroundColor || undefined,
                        }
                      : undefined;
                    const fonts = pres.template
                      ? {
                          heading: pres.template.headingFont || undefined,
                          body: pres.template.bodyFont || undefined,
                        }
                      : undefined;

                    return first ? (
                      <Box
                        sx={{
                          overflow: "hidden",
                          borderBottom: 1,
                          borderColor: "divider",
                          bgcolor: brandColors?.background || "#0f172a",
                          display: "flex",
                          justifyContent: "center",
                        }}
                      >
                        <SlideRenderer
                          typeKey={first.slideTypeKey}
                          data={first.parameters}
                          scale={0.25}
                          brandColors={brandColors}
                          fonts={fonts}
                        />
                      </Box>
                    ) : null;
                  })()}
                  <CardContent>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                      <SlideshowIcon color="primary" fontSize="small" />
                      <Typography variant="h6" fontWeight={600} noWrap>
                        {pres.title}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {new Date(pres.createdAt).toLocaleDateString()}
                    </Typography>
                  </CardContent>
                  <Box sx={{ display: "flex", justifyContent: "flex-end", px: 1, pb: 1, gap: 0.5 }}>
                    <IconButton
                      size="small"
                      title="Download PPTX"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(pres);
                      }}
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>

                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/slides/view/${pres.id}`);
                      }}
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      title="Public Link"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`/p/${pres.id}`, "_blank");
                      }}
                    >
                      <LanguageIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(pres.id);
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
      <EditPresentationDialog
        open={editDialogOpen}
        onClose={handleEditClose}
        presentation={selectedPresentation}
      />
    </SidebarLayout>
  );
};

export default Slides;
