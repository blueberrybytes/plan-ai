import React from "react";
import { Box, Typography, Button, Card, CardContent, Grid, IconButton, Chip } from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import SlideRenderer from "../components/slides/SlideRenderer";
import { SLIDE_TYPES } from "../components/slides/slideTypes";
import { useGetTemplatesQuery, useDeleteTemplateMutation } from "../store/apis/slideApi";

const SlideThemes: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: templates = [], isLoading } = useGetTemplatesQuery();
  const [deleteTemplate] = useDeleteTemplateMutation();

  const handleDelete = async (id: string) => {
    if (window.confirm(t("slides.themes.deleteConfirm"))) {
      await deleteTemplate(id);
    }
  };

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1400, mx: "auto" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/slides")}>
            {t("slides.actions.back")}
          </Button>
          <Typography variant="h5" fontWeight={700} sx={{ flex: 1 }}>
            {t("slides.themes.title")}
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate("/slides/themes/create")}
          >
            {t("slides.themes.create")}
          </Button>
        </Box>

        {isLoading ? (
          <Typography color="text.secondary">{t("slides.themes.loading")}</Typography>
        ) : templates.length === 0 ? (
          <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
            <Typography color="text.secondary">{t("slides.themes.empty")}</Typography>
          </Card>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {templates.map((tmpl) => {
              const brandColors = {
                primary: tmpl.primaryColor || "#6366f1",
                secondary: tmpl.secondaryColor || "#a78bfa",
                background: tmpl.backgroundColor || "#0f172a",
              };
              return (
                <Card key={tmpl.id} variant="outlined">
                  <CardContent>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 2,
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <Typography variant="h6" fontWeight={700}>
                          {tmpl.name}
                        </Typography>
                        <Box sx={{ display: "flex", gap: 0.5 }}>
                          <Box
                            sx={{
                              width: 20,
                              height: 20,
                              borderRadius: "50%",
                              bgcolor: brandColors.primary,
                              border: "1px solid",
                              borderColor: "divider",
                            }}
                          />
                          <Box
                            sx={{
                              width: 20,
                              height: 20,
                              borderRadius: "50%",
                              bgcolor: brandColors.secondary,
                              border: "1px solid",
                              borderColor: "divider",
                            }}
                          />
                        </Box>
                        {tmpl.headingFont && (
                          <Chip label={tmpl.headingFont} size="small" variant="outlined" />
                        )}
                        {tmpl.bodyFont && tmpl.bodyFont !== tmpl.headingFont && (
                          <Chip label={tmpl.bodyFont} size="small" variant="outlined" />
                        )}
                      </Box>
                      <IconButton onClick={() => handleDelete(tmpl.id)} size="small">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>

                    {/* Slide previews for this theme */}
                    <Grid container spacing={2}>
                      {SLIDE_TYPES.map((st) => (
                        <Grid item xs={12} sm={6} md={4} lg={3} key={st.key}>
                          <Box sx={{ transform: "scale(1)", transformOrigin: "top left" }}>
                            <SlideRenderer
                              typeKey={st.key}
                              data={st.sampleData}
                              brandColors={brandColors}
                              scale={0.28}
                            />
                          </Box>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ mt: 0.5, display: "block" }}
                          >
                            {t(`slides.slideTypes.${st.key}`, st.name)}
                          </Typography>
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        )}
      </Box>
    </SidebarLayout>
  );
};

export default SlideThemes;
