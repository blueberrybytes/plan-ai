import React, { useState, useEffect } from "react";
import { Box, Typography, Button, TextField, Divider, Grid, Paper, Tooltip } from "@mui/material";
import { ArrowBack as ArrowBackIcon, Save as SaveIcon } from "@mui/icons-material";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SidebarLayout from "../components/layout/SidebarLayout";
import {
  useCreateDocThemeMutation,
  useUpdateDocThemeMutation,
  useGetDocThemeQuery,
} from "../store/apis/docThemeApi";
import { FONT_OPTIONS } from "../components/slides/themePresets";

interface DocThemePreset {
  name: string;
  headingFont: string;
  bodyFont: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
}

const DOC_THEME_PRESETS: DocThemePreset[] = [
  {
    name: "Classic Light",
    headingFont: "Merriweather",
    bodyFont: "Source Sans 3",
    primaryColor: "#1e3a5f",
    accentColor: "#2563eb",
    backgroundColor: "#ffffff",
    textColor: "#1e293b",
  },
  {
    name: "Indigo Pro",
    headingFont: "Inter",
    bodyFont: "Inter",
    primaryColor: "#6366f1",
    accentColor: "#a78bfa",
    backgroundColor: "#f8f7ff",
    textColor: "#1e1b4b",
  },
  {
    name: "Corporate Blue",
    headingFont: "Roboto",
    bodyFont: "Open Sans",
    primaryColor: "#1e40af",
    accentColor: "#3b82f6",
    backgroundColor: "#f8fafc",
    textColor: "#0f172a",
  },
  {
    name: "Warm Earth",
    headingFont: "Playfair Display",
    bodyFont: "Lato",
    primaryColor: "#b45309",
    accentColor: "#d97706",
    backgroundColor: "#fffbeb",
    textColor: "#1c1917",
  },
  {
    name: "Forest Green",
    headingFont: "Outfit",
    bodyFont: "Inter",
    primaryColor: "#15803d",
    accentColor: "#22c55e",
    backgroundColor: "#f0fdf4",
    textColor: "#14532d",
  },
  {
    name: "Rose & Cream",
    headingFont: "Playfair Display",
    bodyFont: "Lato",
    primaryColor: "#be185d",
    accentColor: "#f43f5e",
    backgroundColor: "#fff1f2",
    textColor: "#881337",
  },
  {
    name: "Midnight Dark",
    headingFont: "Inter",
    bodyFont: "Inter",
    primaryColor: "#818cf8",
    accentColor: "#a78bfa",
    backgroundColor: "#0f172a",
    textColor: "#e2e8f0",
  },
  {
    name: "Minimal Mono",
    headingFont: "DM Sans",
    bodyFont: "DM Sans",
    primaryColor: "#18181b",
    accentColor: "#71717a",
    backgroundColor: "#fafafa",
    textColor: "#27272a",
  },
  {
    name: "Teal Focus",
    headingFont: "Montserrat",
    bodyFont: "Open Sans",
    primaryColor: "#0d9488",
    accentColor: "#06b6d4",
    backgroundColor: "#f0fdfa",
    textColor: "#134e4a",
  },
  {
    name: "Purple Haze",
    headingFont: "Raleway",
    bodyFont: "Nunito",
    primaryColor: "#7c3aed",
    accentColor: "#c026d3",
    backgroundColor: "#faf5ff",
    textColor: "#3b0764",
  },
];

const PREVIEW_MD = `# Heading 1\n\nSome **bold** and *italic* text with a [link](#).\n\n## Heading 2\n\n- Item one\n- Item two\n- Item three\n\n> A blockquote example that stands out\n\n| Column A | Column B |\n|---|---|\n| Cell 1 | Cell 2 |`;

const DEFAULT_FORM = {
  name: "",
  headingFont: "Inter",
  bodyFont: "Inter",
  primaryColor: "#4361EE",
  accentColor: "#7c3aed",
  backgroundColor: "#ffffff",
  textColor: "#0f172a",
};

const DocThemeCreate: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const { data: existing } = useGetDocThemeQuery(id ?? "", { skip: !id });
  const [createTheme, { isLoading: isCreating }] = useCreateDocThemeMutation();
  const [updateTheme, { isLoading: isUpdating }] = useUpdateDocThemeMutation();

  const [form, setForm] = useState(DEFAULT_FORM);

  useEffect(() => {
    if (existing)
      setForm({
        name: existing.name,
        headingFont: existing.headingFont,
        bodyFont: existing.bodyFont,
        primaryColor: existing.primaryColor,
        accentColor: existing.accentColor,
        backgroundColor: existing.backgroundColor,
        textColor: existing.textColor,
      });
  }, [existing]);

  const applyPreset = (preset: DocThemePreset) => {
    setForm((f) => ({ ...f, ...preset }));
  };

  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | { value: unknown }>) =>
      setForm((f) => ({ ...f, [key]: e.target.value as string }));

  const handleSubmit = async () => {
    if (isEdit && id) {
      await updateTheme({ id, data: form });
    } else {
      await createTheme(form);
    }
    navigate("/docs/themes");
  };

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: "auto" }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/docs/themes")}
          sx={{ mb: 3 }}
        >
          {t("common.back")}
        </Button>
        <Typography variant="h4" fontWeight={700} sx={{ mb: 4 }}>
          {isEdit ? t("docThemes.edit.title") : t("docThemes.create.title")}
        </Typography>

        {/* Preset swatches */}
        {!isEdit && (
          <>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
              {t("docThemes.form.presets")}
            </Typography>
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 4 }}>
              {DOC_THEME_PRESETS.map((preset) => (
                <Tooltip key={preset.name} title={preset.name} arrow>
                  <Box
                    onClick={() => applyPreset(preset)}
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: 2,
                      cursor: "pointer",
                      border: "2px solid transparent",
                      background: `linear-gradient(135deg, ${preset.primaryColor} 0%, ${preset.accentColor} 100%)`,
                      transition: "all 0.15s",
                      "&:hover": {
                        transform: "scale(1.12)",
                        borderColor: "primary.main",
                        boxShadow: 4,
                      },
                      ...(form.primaryColor === preset.primaryColor && {
                        borderColor: "primary.main",
                        boxShadow: 4,
                        transform: "scale(1.08)",
                      }),
                    }}
                  />
                </Tooltip>
              ))}
            </Box>
            <Divider sx={{ mb: 4 }} />
          </>
        )}

        <Grid container spacing={4}>
          {/* Form */}
          <Grid item xs={12} md={5}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
              <TextField
                label={t("docThemes.form.name")}
                value={form.name}
                onChange={set("name")}
                fullWidth
              />
              <Divider>{t("docThemes.form.fonts")}</Divider>
              <TextField
                select
                label={t("docThemes.form.headingFont")}
                value={form.headingFont}
                onChange={set("headingFont")}
                fullWidth
                SelectProps={{ native: true }}
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </TextField>
              <TextField
                select
                label={t("docThemes.form.bodyFont")}
                value={form.bodyFont}
                onChange={set("bodyFont")}
                fullWidth
                SelectProps={{ native: true }}
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </TextField>
              <Divider>{t("docThemes.form.colors")}</Divider>
              {[
                { key: "primaryColor", label: t("docThemes.form.primaryColor") },
                { key: "accentColor", label: t("docThemes.form.accentColor") },
                { key: "backgroundColor", label: t("docThemes.form.backgroundColor") },
                { key: "textColor", label: t("docThemes.form.textColor") },
              ].map(({ key, label }) => (
                <Box key={key} sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                  <input
                    type="color"
                    value={form[key as keyof typeof form]}
                    onChange={set(key as keyof typeof form)}
                    style={{
                      width: 48,
                      height: 40,
                      border: "none",
                      cursor: "pointer",
                      borderRadius: 8,
                    }}
                  />
                  <TextField
                    label={label}
                    value={form[key as keyof typeof form]}
                    onChange={set(key as keyof typeof form)}
                    size="small"
                    sx={{ flexGrow: 1 }}
                  />
                </Box>
              ))}
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSubmit}
                loading={isCreating || isUpdating}
                disabled={!form.name}
              >
                {t("common.save")}
              </Button>
            </Box>
          </Grid>

          {/* Live Preview */}
          <Grid item xs={12} md={7}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
              {t("docThemes.form.preview")}
            </Typography>
            <Paper
              variant="outlined"
              sx={{ p: 4, bgcolor: form.backgroundColor, minHeight: 400, borderRadius: 2 }}
            >
              <Box
                sx={{
                  color: form.textColor,
                  fontFamily: form.bodyFont,
                  "& h1, & h2, & h3": { fontFamily: form.headingFont, color: form.primaryColor },
                  "& a": { color: form.accentColor },
                  "& strong": { color: form.primaryColor },
                  "& blockquote": {
                    borderLeft: `4px solid ${form.accentColor}`,
                    pl: 2,
                    opacity: 0.85,
                  },
                  "& table": { borderCollapse: "collapse", width: "100%" },
                  "& td, & th": { border: "1px solid #ccc", p: 1 },
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{PREVIEW_MD}</ReactMarkdown>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </SidebarLayout>
  );
};

export default DocThemeCreate;
