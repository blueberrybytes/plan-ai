import React from "react";
import { Box, Typography, Button, Card, CardContent, Grid, Chip, IconButton } from "@mui/material";
import {
  Add as AddIcon,
  Palette as PaletteIcon,
  ViewCarousel as ViewCarouselIcon,
  Slideshow as SlideshowIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useGetPresentationsQuery, useDeletePresentationMutation } from "../store/apis/slideApi";

const Slides: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: presentations = [], isLoading } = useGetPresentationsQuery();
  const [deletePresentation] = useDeletePresentationMutation();

  const handleDelete = async (id: string) => {
    if (window.confirm(t("slides.presentations.deleteConfirm"))) {
      await deletePresentation(id);
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
          <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
            <SlideshowIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
            <Typography color="text.secondary">{t("slides.presentations.empty")}</Typography>
          </Card>
        ) : (
          <Grid container spacing={2}>
            {presentations.map((pres) => (
              <Grid item xs={12} sm={6} md={4} key={pres.id}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                      <SlideshowIcon color="primary" fontSize="small" />
                      <Typography variant="h6" fontWeight={600} noWrap>
                        {pres.title}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(pres.createdAt).toLocaleDateString()}
                    </Typography>
                    <Chip
                      label={pres.status}
                      size="small"
                      color={pres.status === "DRAFT" ? "default" : "success"}
                      sx={{ mt: 1 }}
                    />
                  </CardContent>
                  <Box sx={{ display: "flex", justifyContent: "flex-end", px: 1, pb: 1, gap: 0.5 }}>
                    <IconButton size="small">
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(pres.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </SidebarLayout>
  );
};

export default Slides;
