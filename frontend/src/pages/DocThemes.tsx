import React from "react";
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  IconButton,
  Skeleton,
  Chip,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import {
  useGetDocThemesQuery,
  useDeleteDocThemeMutation,
  type DocThemeResponse,
} from "../store/apis/docThemeApi";

const DocThemes: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: themes = [], isLoading } = useGetDocThemesQuery();
  const [deleteTheme] = useDeleteDocThemeMutation();

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(t("docThemes.deleteConfirm"))) {
      await deleteTheme(id);
    }
  };

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: "auto" }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/docs")} sx={{ mb: 3 }}>
          {t("common.back")}
        </Button>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4 }}>
          <Typography variant="h4" fontWeight={700}>
            {t("docThemes.title")}
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate("/docs/themes/create")}
          >
            {t("docThemes.actions.create")}
          </Button>
        </Box>

        {isLoading ? (
          <Grid container spacing={2}>
            {[1, 2, 3].map((i) => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 2 }} />
              </Grid>
            ))}
          </Grid>
        ) : themes.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 10 }}>
            <Typography variant="h6" color="text.secondary">
              {t("docThemes.empty")}
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={2}>
            {themes.map((theme: DocThemeResponse) => (
              <Grid item xs={12} sm={6} md={4} key={theme.id}>
                <Card variant="outlined" sx={{ "&:hover": { borderColor: "primary.main" } }}>
                  {/* Color preview bar */}
                  <Box
                    sx={{
                      height: 8,
                      background: `linear-gradient(90deg, ${theme.primaryColor} 0%, ${theme.accentColor} 50%, ${theme.backgroundColor} 100%)`,
                    }}
                  />
                  <CardContent>
                    <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                      {theme.name}
                    </Typography>
                    <Box sx={{ display: "flex", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
                      {[
                        theme.primaryColor,
                        theme.accentColor,
                        theme.backgroundColor,
                        theme.textColor,
                      ].map((c) => (
                        <Box
                          key={c}
                          sx={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            bgcolor: c,
                            border: "1px solid",
                            borderColor: "divider",
                          }}
                        />
                      ))}
                    </Box>
                    <Chip
                      label={theme.headingFont}
                      size="small"
                      variant="outlined"
                      sx={{ mr: 0.5 }}
                    />
                    <Chip label={theme.bodyFont} size="small" variant="outlined" />
                  </CardContent>
                  <Box sx={{ display: "flex", justifyContent: "flex-end", px: 1, pb: 1, gap: 0.5 }}>
                    <IconButton
                      size="small"
                      onClick={() => navigate(`/docs/themes/${theme.id}/edit`)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={(e) => handleDelete(theme.id, e)}>
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

export default DocThemes;
