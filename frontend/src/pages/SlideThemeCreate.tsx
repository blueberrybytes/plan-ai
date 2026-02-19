import React, { useState } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Card,
  CardActionArea,
  CardContent,
  Grid,
  Divider,
} from "@mui/material";
import { ArrowBack as ArrowBackIcon, Save as SaveIcon } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import SlideRenderer from "../components/slides/SlideRenderer";
import { SLIDE_TYPES } from "../components/slides/slideTypes";
import { THEME_PRESETS, FONT_OPTIONS, ThemePreset } from "../components/slides/themePresets";
import { useCreateTemplateMutation } from "../store/apis/slideApi";

const SlideThemeCreate: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [createTemplate, { isLoading }] = useCreateTemplateMutation();

  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [secondaryColor, setSecondaryColor] = useState("#a78bfa");
  const [backgroundColor, setBackgroundColor] = useState("#0f172a");
  const [headingFont, setHeadingFont] = useState("Inter");
  const [bodyFont, setBodyFont] = useState("Inter");
  const [themeName, setThemeName] = useState("");
  const [previewSlide, setPreviewSlide] = useState(0);

  const applyPreset = (preset: ThemePreset) => {
    setPrimaryColor(preset.primaryColor);
    setSecondaryColor(preset.secondaryColor);
    setBackgroundColor(preset.backgroundColor);
    setHeadingFont(preset.headingFont);
    setBodyFont(preset.bodyFont);
    if (!themeName) setThemeName(preset.name);
  };

  const handleSave = async () => {
    if (!themeName.trim()) return;
    try {
      await createTemplate({
        name: themeName,
        primaryColor,
        secondaryColor,
        backgroundColor,
        headingFont,
        bodyFont,
      }).unwrap();
      navigate("/slides/themes");
    } catch {
      // error handled by RTK Query
    }
  };

  const brandColors = {
    primary: primaryColor,
    secondary: secondaryColor,
    background: backgroundColor,
  };
  const currentSlideType = SLIDE_TYPES[previewSlide];

  return (
    <SidebarLayout>
      <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        {/* Left: Controls */}
        <Box
          sx={{
            width: 380,
            flexShrink: 0,
            borderRight: 1,
            borderColor: "divider",
            overflowY: "auto",
            bgcolor: "background.paper",
            p: 3,
          }}
        >
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/slides")} sx={{ mb: 2 }}>
            {t("slides.actions.back")}
          </Button>

          <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
            {t("slides.themes.create")}
          </Typography>

          {/* Theme Name */}
          <TextField
            label={t("slides.themes.form.name")}
            fullWidth
            value={themeName}
            onChange={(e) => setThemeName(e.target.value)}
            sx={{ mb: 3 }}
          />

          {/* Colors */}
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            {t("slides.themes.form.colors")}
          </Typography>
          <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {t("slides.themes.form.primaryColor")}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  style={{
                    width: 40,
                    height: 40,
                    border: "none",
                    cursor: "pointer",
                    borderRadius: 4,
                  }}
                />
                <TextField
                  size="small"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  sx={{ flex: 1 }}
                />
              </Box>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {t("slides.themes.form.secondaryColor")}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  style={{
                    width: 40,
                    height: 40,
                    border: "none",
                    cursor: "pointer",
                    borderRadius: 4,
                  }}
                />
                <TextField
                  size="small"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  sx={{ flex: 1 }}
                />
              </Box>
            </Box>
          </Box>

          <Box sx={{ mb: 3 }}>
            <Typography variant="caption" color="text.secondary">
              {t("slides.themes.form.backgroundColor")}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                style={{
                  width: 40,
                  height: 40,
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              />
              <TextField
                size="small"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                fullWidth
              />
            </Box>
          </Box>

          {/* Typography */}
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            {t("slides.themes.form.typography")}
          </Typography>
          <TextField
            select
            label={t("slides.themes.form.headingFont")}
            fullWidth
            value={headingFont}
            onChange={(e) => setHeadingFont(e.target.value)}
            sx={{ mb: 2 }}
          >
            {FONT_OPTIONS.map((font) => (
              <MenuItem key={font} value={font} sx={{ fontFamily: font }}>
                {font}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label={t("slides.themes.form.bodyFont")}
            fullWidth
            value={bodyFont}
            onChange={(e) => setBodyFont(e.target.value)}
            sx={{ mb: 3 }}
          >
            {FONT_OPTIONS.map((font) => (
              <MenuItem key={font} value={font} sx={{ fontFamily: font }}>
                {font}
              </MenuItem>
            ))}
          </TextField>

          <Divider sx={{ mb: 3 }} />

          {/* Presets */}
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
            {t("slides.themes.form.presets")}
          </Typography>
          <Grid container spacing={1} sx={{ mb: 3 }}>
            {THEME_PRESETS.map((preset) => (
              <Grid item xs={6} key={preset.name}>
                <Card variant="outlined" sx={{ cursor: "pointer" }}>
                  <CardActionArea onClick={() => applyPreset(preset)}>
                    <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                      <Box sx={{ display: "flex", gap: 0.5, mb: 0.5 }}>
                        <Box
                          sx={{
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            bgcolor: preset.primaryColor,
                            border: "1px solid",
                            borderColor: "divider",
                          }}
                        />
                        <Box
                          sx={{
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            bgcolor: preset.secondaryColor,
                            border: "1px solid",
                            borderColor: "divider",
                          }}
                        />
                        <Box
                          sx={{
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            bgcolor: preset.backgroundColor,
                            border: "1px solid",
                            borderColor: "divider",
                          }}
                        />
                      </Box>
                      <Typography variant="caption" fontWeight={600} noWrap>
                        {preset.name}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Button
            variant="contained"
            fullWidth
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={!themeName.trim() || isLoading}
            size="large"
          >
            {isLoading ? t("slides.themes.form.saving") : t("slides.themes.form.save")}
          </Button>
        </Box>

        {/* Right: Live Preview */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "#1a1a2e",
            p: 4,
            overflow: "auto",
          }}
        >
          <SlideRenderer
            typeKey={currentSlideType.key}
            data={currentSlideType.sampleData}
            brandColors={brandColors}
            scale={0.75}
          />

          {/* Slide type switcher */}
          <Box sx={{ display: "flex", gap: 1, mt: 3, flexWrap: "wrap", justifyContent: "center" }}>
            {SLIDE_TYPES.map((st, i) => (
              <Button
                key={st.key}
                size="small"
                variant={previewSlide === i ? "contained" : "outlined"}
                onClick={() => setPreviewSlide(i)}
                sx={{
                  fontSize: 11,
                  minWidth: 0,
                  px: 1.5,
                  color: previewSlide === i ? undefined : "#94a3b8",
                  borderColor: previewSlide === i ? undefined : "rgba(148,163,184,0.3)",
                }}
              >
                {t(`slides.slideTypes.${st.key}`, st.name)}
              </Button>
            ))}
          </Box>
        </Box>
      </Box>
    </SidebarLayout>
  );
};

export default SlideThemeCreate;
