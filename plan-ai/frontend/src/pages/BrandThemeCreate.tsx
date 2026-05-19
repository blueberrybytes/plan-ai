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
  IconButton,
  useTheme,
} from "@mui/material";
import { getContrastRatio } from "@mui/material/styles";
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  CloudUpload as CloudUploadIcon,
  Delete as DeleteIcon,
  Language as LanguageIcon,
} from "@mui/icons-material";
import { storage, auth } from "../firebase/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useNavigate, useParams } from "react-router-dom";
import { AnalyzeWebsiteDialog } from "../components/slides/AnalyzeWebsiteDialog";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { setToastMessage } from "../store/slices/app/appSlice";
import { selectActiveWorkspaceId } from "../store/slices/app/appSelector";
import SidebarLayout from "../components/layout/SidebarLayout";
import SlideRenderer from "../components/slides/SlideRenderer";
import { SLIDE_TYPES } from "../components/slides/slideTypes";
import { THEME_PRESETS, FONT_OPTIONS, ThemePreset } from "../components/slides/themePresets";
import {
  useCreateBrandThemeMutation,
  useUpdateBrandThemeMutation,
  useGetBrandThemeByIdQuery,
} from "../store/apis/brandThemeApi";
import { DIAGRAM_TYPES } from "../components/diagrams/diagramTypes";
import MermaidRenderer from "../components/common/MermaidRenderer";
import MarkdownRenderer from "../components/common/MarkdownRenderer";

const sampleMarkdown = `
# Plan-AI User Guide

This document describes how to use **Plan-AI**. The features available include:

## Key Features

1. Automated content generation
2. Slide generation
3. Diagram support

### System Architecture

Our platform consists of a **Frontend** built in React and a **Backend** in Node.js.

> "Plan-AI has completely transformed my workflow!" - A happy user

Here is some \`inline code\` and a table:

| Feature | Status |
|---|---|
| Docs | Active |
| Slides | Active |

`;

const BrandThemeCreate: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { id } = useParams<{ id: string }>();
  const activeWorkspaceId = useSelector(selectActiveWorkspaceId);
  const muiTheme = useTheme();

  const [createBrandTheme, { isLoading: isCreating }] = useCreateBrandThemeMutation();
  const [updateBrandTheme, { isLoading: isUpdating }] = useUpdateBrandThemeMutation();
  const { data: themeToEdit } = useGetBrandThemeByIdQuery(id ?? "", { skip: !id });

  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [secondaryColor, setSecondaryColor] = useState("#a78bfa");
  const [backgroundColor, setBackgroundColor] = useState("#0f172a");
  const [backgroundStyle, setBackgroundStyle] = useState<"solid" | "gradient" | "mesh" | "minimal">(
    "solid",
  );
  const [cardStyle, setCardStyle] = useState<"flat" | "glass" | "outline">("flat");
  const [headingFont, setHeadingFont] = useState("Inter");
  const [bodyFont, setBodyFont] = useState("Inter");
  const [themeName, setThemeName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [previewMode, setPreviewMode] = useState<"SLIDE" | "DOC" | "DIAGRAM">("SLIDE");
  const [previewSlide, setPreviewSlide] = useState(0);
  const [previewDiagram, setPreviewDiagram] = useState<string>("FLOWCHART");
  const [analyzeDialogOpen, setAnalyzeDialogOpen] = useState(false);

  React.useEffect(() => {
    if (themeToEdit) {
      setThemeName(themeToEdit.name);
      setPrimaryColor(themeToEdit.primaryColor);
      setSecondaryColor(themeToEdit.secondaryColor);
      setBackgroundColor(themeToEdit.backgroundColor);
      setBackgroundStyle(
        (themeToEdit.backgroundStyle as "solid" | "gradient" | "mesh" | "minimal") || "solid",
      );
      setCardStyle((themeToEdit.cardStyle as "flat" | "glass" | "outline") || "flat");
      setHeadingFont(themeToEdit.headingFont);
      setBodyFont(themeToEdit.bodyFont);
      setLogoUrl(themeToEdit.logoUrl || null);
    }
  }, [themeToEdit]);

  const applyPreset = (preset: ThemePreset) => {
    setPrimaryColor(preset.primaryColor);
    setSecondaryColor(preset.secondaryColor);
    setBackgroundColor(preset.backgroundColor);
    setBackgroundStyle(preset.backgroundStyle || "solid");
    setCardStyle(preset.cardStyle || "flat");
    setHeadingFont(preset.headingFont);
    setBodyFont(preset.bodyFont);
    if (!themeName) setThemeName(preset.name);
  };

  const handleSave = async () => {
    if (!themeName.trim() || !activeWorkspaceId) return;
    try {
      const payload = {
        workspaceId: activeWorkspaceId,
        name: themeName,
        logoUrl: logoUrl || undefined,
        primaryColor,
        secondaryColor,
        backgroundColor,
        backgroundStyle,
        cardStyle,
        headingFont,
        bodyFont,
        textColor: "#ffffff",
      };

      if (id) {
        await updateBrandTheme({ id, body: payload }).unwrap();
      } else {
        await createBrandTheme(payload).unwrap();
      }
      dispatch(
        setToastMessage({
          severity: "success",
          message: id ? "Brand theme updated" : "Brand theme created",
        }),
      );
      navigate("/brand-themes");
    } catch {
      dispatch(setToastMessage({ severity: "error", message: "Failed to save brand theme" }));
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!auth.currentUser) return; // need auth
    setIsUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop();
      const imageId = `logo_${Date.now()}.${ext}`;
      const logoRef = ref(storage, `themes/${auth.currentUser.uid}/logos/${imageId}`);
      await uploadBytes(logoRef, file);
      const downloadUrl = await getDownloadURL(logoRef);
      setLogoUrl(downloadUrl);
      dispatch(setToastMessage({ severity: "success", message: "Logo uploaded successfully" }));
    } catch (err) {
      console.error(err);
      dispatch(setToastMessage({ severity: "error", message: "Failed to upload logo" }));
    } finally {
      setIsUploadingLogo(false);
      // Reset input
      e.target.value = "";
    }
  };

  const fonts = { heading: headingFont, body: bodyFont };
  const brandColors = {
    primary: primaryColor,
    secondary: secondaryColor,
    background: backgroundColor,
    backgroundStyle,
    cardStyle,
    logoUrl,
  };
  const currentSlideType = SLIDE_TYPES[previewSlide];
  const currentDiagramTypeMeta =
    DIAGRAM_TYPES.find((t) => t.id === previewDiagram) || DIAGRAM_TYPES[0];

  const getDocStyles = () => {
    const bg = brandColors.background || muiTheme.palette.background.paper;
    let text = "#ffffff";
    if (getContrastRatio(text, bg) < 3) text = muiTheme.palette.getContrastText(bg);

    let headerColor = brandColors.primary || muiTheme.palette.primary.main;
    if (getContrastRatio(headerColor, bg) < 3) headerColor = text;

    let accent = brandColors.secondary || muiTheme.palette.secondary.main;
    if (getContrastRatio(accent, bg) < 3) accent = text;

    let strongColor = brandColors.primary || "inherit";
    if (strongColor !== "inherit" && getContrastRatio(strongColor, bg) < 3) strongColor = text;

    return {
      color: text,
      bgcolor: bg,
      borderRadius: 2,
      p: 4,
      width: "100%",
      maxWidth: 800,
      fontFamily: fonts.body ?? "inherit",
      "& h1": { fontFamily: fonts.heading ?? "inherit", color: `${headerColor} !important` },
      "& h2": {
        fontFamily: fonts.heading ?? "inherit",
        color: `${headerColor} !important`,
        borderBottom: `2px solid ${accent === text ? text : accent + "40"}`,
        pb: 1,
        mb: 2,
      },
      "& h3, & h4, & h5, & h6": {
        fontFamily: fonts.heading ?? "inherit",
        color: `${accent} !important`,
      },
      "& a": { color: accent, textDecoration: "none", borderBottom: `1px dotted ${accent}` },
      "& strong": { color: `${strongColor} !important` },
      "& table": { borderCollapse: "collapse", width: "100%", my: 3 },
      "& th": {
        border: "1px solid",
        borderColor: brandColors.secondary ? `${brandColors.secondary}15` : "rgba(0,0,0,0.1)",
        backgroundColor: brandColors.secondary ? `${brandColors.secondary}15` : "rgba(0,0,0,0.04)",
        color: strongColor,
        p: 1.5,
        textAlign: "left",
      },
      "& td": {
        border: "1px solid",
        borderColor: brandColors.secondary ? `${brandColors.secondary}40` : "rgba(0,0,0,0.1)",
        p: 1.5,
      },
      "& blockquote": {
        borderLeft: `4px solid ${brandColors.secondary ?? "#4361EE"}`,
        backgroundColor: brandColors.secondary ? `${brandColors.secondary}0A` : "rgba(0,0,0,0.02)",
        py: 1,
        pr: 2,
        pl: 3,
        my: 3,
        borderRadius: "0 8px 8px 0",
        fontStyle: "italic",
      },
      "& code": {
        color: brandColors.secondary ?? "inherit",
        backgroundColor: brandColors.primary ? `${brandColors.primary}0A` : "rgba(0,0,0,0.04)",
        px: 1,
        py: 0.5,
        borderRadius: 1,
        fontFamily: "monospace",
      },
    };
  };

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
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
            {t("slides.actions.back")}
          </Button>

          <Box
            sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}
          >
            <Typography variant="h5" fontWeight={700}>
              Brand Themes
            </Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<LanguageIcon />}
                onClick={() => setAnalyzeDialogOpen(true)}
              >
                Import
              </Button>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSave}
                disabled={!themeName.trim() || isCreating || isUpdating}
              >
                {isCreating || isUpdating
                  ? t("slides.themes.form.saving")
                  : t("slides.themes.form.save")}
              </Button>
            </Box>
          </Box>

          <AnalyzeWebsiteDialog
            open={analyzeDialogOpen}
            onClose={() => setAnalyzeDialogOpen(false)}
            onApply={(data) => {
              setPrimaryColor(data.primaryColor);
              setSecondaryColor(data.secondaryColor);
              setBackgroundColor(data.backgroundColor);
              setHeadingFont(data.headingFont);
              setBodyFont(data.bodyFont);
              if (data.logoUrl) {
                setLogoUrl(data.logoUrl);
              }
            }}
          />

          {/* Theme Name */}
          <TextField
            label={t("slides.themes.form.name")}
            fullWidth
            value={themeName}
            onChange={(e) => setThemeName(e.target.value)}
            sx={{ mb: 3 }}
          />

          {/* Logo */}
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Logo (Optional)
          </Typography>
          <Box sx={{ mb: 3 }}>
            {logoUrl ? (
              <Box
                sx={{
                  position: "relative",
                  width: "100%",
                  height: 100,
                  bgcolor: "background.default",
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "divider",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  mb: 1,
                  overflow: "hidden",
                }}
              >
                <img
                  src={logoUrl}
                  alt="Logo"
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                />
                <IconButton
                  size="small"
                  color="error"
                  sx={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    bgcolor: "rgba(0,0,0,0.5)",
                    "&:hover": { bgcolor: "rgba(0,0,0,0.8)" },
                  }}
                  onClick={() => setLogoUrl(null)}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ) : (
              <Button
                variant="outlined"
                component="label"
                fullWidth
                disabled={isUploadingLogo}
                startIcon={<CloudUploadIcon />}
                size="large"
                sx={{ borderStyle: "dashed" }}
              >
                {isUploadingLogo ? "Uploading..." : "Upload Logo"}
                <input type="file" hidden accept="image/*" onChange={handleLogoUpload} />
              </Button>
            )}
          </Box>

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

          {/* Styles */}
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Styles
          </Typography>
          <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
            <TextField
              select
              label="Background Style"
              fullWidth
              value={backgroundStyle}
              SelectProps={{
                MenuProps: {
                  sx: { "& .MuiMenuItem-root": { color: "text.primary" } },
                },
              }}
              onChange={(e) =>
                setBackgroundStyle(e.target.value as "solid" | "gradient" | "mesh" | "minimal")
              }
            >
              <MenuItem value="solid">Solid</MenuItem>
              <MenuItem value="gradient">Gradient</MenuItem>
              <MenuItem value="mesh">Mesh Texture</MenuItem>
              <MenuItem value="minimal">Minimal Grid</MenuItem>
            </TextField>
            <TextField
              select
              label="Card Style"
              fullWidth
              value={cardStyle}
              SelectProps={{
                MenuProps: {
                  sx: { "& .MuiMenuItem-root": { color: "text.primary" } },
                },
              }}
              onChange={(e) => {
                setCardStyle(e.target.value as "flat" | "glass" | "outline");
                if (previewSlide === 0) {
                  setPreviewSlide(7); // Switch to Stats slide to show the card effect
                }
              }}
            >
              <MenuItem value="flat">Flat</MenuItem>
              <MenuItem value="glass">Glassmorphism</MenuItem>
              <MenuItem value="outline">Outline</MenuItem>
            </TextField>
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
            SelectProps={{
              MenuProps: {
                sx: { "& .MuiMenuItem-root": { color: "text.primary" } },
              },
            }}
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
            SelectProps={{
              MenuProps: {
                sx: { "& .MuiMenuItem-root": { color: "text.primary" } },
              },
            }}
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
          {previewMode === "SLIDE" && (
            <SlideRenderer
              key={`${currentSlideType.key}-${JSON.stringify(brandColors)}-${JSON.stringify(fonts)}`}
              typeKey={currentSlideType.key}
              data={currentSlideType.sampleData}
              brandColors={brandColors}
              fonts={fonts}
              scale={0.75}
              animate={true}
            />
          )}

          {previewMode === "DOC" && (
            <Box
              sx={{
                width: "100%",
                height: "100%",
                overflowY: "auto",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <MarkdownRenderer
                content={sampleMarkdown}
                theme={{
                  primaryColor: brandColors.primary,
                  secondaryColor: brandColors.secondary,
                  backgroundColor: brandColors.background,
                  headingFont: fonts.heading,
                  bodyFont: fonts.body,
                  logoUrl: brandColors.logoUrl || undefined,
                }}
                sx={{ ...getDocStyles(), p: 4, height: "fit-content" }}
              />
            </Box>
          )}

          {previewMode === "DIAGRAM" && (
            <Box
              sx={{
                width: "100%",
                height: "100%",
                overflowY: "auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: brandColors.background,
              }}
            >
              <MermaidRenderer
                key={`${currentDiagramTypeMeta.id}-${JSON.stringify(brandColors)}`}
                chart={currentDiagramTypeMeta.sampleCode}
                theme={{
                  primaryColor: brandColors.primary,
                  secondaryColor: brandColors.secondary,
                  backgroundColor: brandColors.background,
                }}
              />
            </Box>
          )}

          {/* Slide type switcher */}
          <Box
            sx={{ mt: 3, display: "flex", flexDirection: "column", gap: 1.5, alignItems: "center" }}
          >
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center" }}>
              {SLIDE_TYPES.map((st, i) => (
                <Button
                  key={st.key}
                  size="small"
                  variant={previewMode === "SLIDE" && previewSlide === i ? "contained" : "outlined"}
                  onClick={() => {
                    setPreviewMode("SLIDE");
                    setPreviewSlide(i);
                  }}
                  sx={{
                    fontSize: 11,
                    minWidth: 0,
                    px: 1.5,
                    color: previewMode === "SLIDE" && previewSlide === i ? undefined : "#94a3b8",
                    borderColor:
                      previewMode === "SLIDE" && previewSlide === i
                        ? undefined
                        : "rgba(148,163,184,0.3)",
                  }}
                >
                  {t(`slides.slideTypes.${st.key}`, st.name)}
                </Button>
              ))}
            </Box>

            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center" }}>
              <Button
                size="small"
                variant={previewMode === "DOC" ? "contained" : "outlined"}
                onClick={() => setPreviewMode("DOC")}
                sx={{
                  fontSize: 11,
                  minWidth: 0,
                  px: 1.5,
                  color: previewMode === "DOC" ? undefined : "#94a3b8",
                  borderColor: previewMode === "DOC" ? undefined : "rgba(148,163,184,0.3)",
                }}
              >
                Document Preview
              </Button>
            </Box>

            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center" }}>
              {DIAGRAM_TYPES.map(
                (st) =>
                  st.id !== "AUTO" && (
                    <Button
                      key={st.id}
                      size="small"
                      variant={
                        previewMode === "DIAGRAM" && previewDiagram === st.id
                          ? "contained"
                          : "outlined"
                      }
                      onClick={() => {
                        setPreviewMode("DIAGRAM");
                        setPreviewDiagram(st.id);
                      }}
                      sx={{
                        fontSize: 11,
                        minWidth: 0,
                        px: 1.5,
                        color:
                          previewMode === "DIAGRAM" && previewDiagram === st.id
                            ? undefined
                            : "#94a3b8",
                        borderColor:
                          previewMode === "DIAGRAM" && previewDiagram === st.id
                            ? undefined
                            : "rgba(148,163,184,0.3)",
                      }}
                    >
                      {st.label}
                    </Button>
                  ),
              )}
            </Box>
          </Box>
        </Box>
      </Box>
    </SidebarLayout>
  );
};

export default BrandThemeCreate;
