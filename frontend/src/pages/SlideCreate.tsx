import React, { useState } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Card,
  CardContent,
  Checkbox,
  ListItemText,
  Chip,
  CircularProgress,
  Alert,
} from "@mui/material";
import { ArrowBack as ArrowBackIcon, AutoAwesome as AutoAwesomeIcon } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import SlideRenderer from "../components/slides/SlideRenderer";
import { SLIDE_TYPES } from "../components/slides/slideTypes";
import {
  useGetTemplatesQuery,
  useGeneratePresentationMutation,
  SlideTemplateResponse,
} from "../store/apis/slideApi";
import { useListContextsQuery } from "../store/apis/contextApi";

const SlideCreate: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: templates = [] } = useGetTemplatesQuery();
  const { data: contextsData } = useListContextsQuery();
  const [generatePresentation, { isLoading }] = useGeneratePresentationMutation();

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [tone, setTone] = useState("");
  const [audience, setAudience] = useState("");
  const [error, setError] = useState<string | null>(null);

  const contexts = contextsData?.data?.contexts ?? [];
  const selectedTemplate = templates.find(
    (t: SlideTemplateResponse) => t.id === selectedTemplateId,
  );

  const handleGenerate = async () => {
    if (!selectedTemplateId || !prompt.trim()) return;
    try {
      setError(null);
      const enrichedPrompt = [
        prompt,
        tone ? `\nTone: ${tone}` : "",
        audience ? `\nTarget audience: ${audience}` : "",
      ].join("");
      const result = await generatePresentation({
        templateId: selectedTemplateId,
        contextIds: selectedContextIds,
        prompt: enrichedPrompt,
        title: title || undefined,
      }).unwrap();
      navigate(`/slides/${result.id}?streaming=true`);
      void result;
    } catch {
      setError(t("slides.create.error"));
    }
  };

  const brandColors = selectedTemplate
    ? {
        primary: selectedTemplate.primaryColor || "#6366f1",
        secondary: selectedTemplate.secondaryColor || "#a78bfa",
        background: selectedTemplate.backgroundColor || "#0f172a",
      }
    : undefined;

  return (
    <SidebarLayout>
      <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        {/* Left: Form */}
        <Box
          sx={{
            width: 420,
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

          <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
            {t("slides.create.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {t("slides.create.subtitle")}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* Theme selector */}
          <TextField
            select
            label={t("slides.create.selectTheme")}
            fullWidth
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            sx={{ mb: 3 }}
          >
            {templates.map((tmpl: SlideTemplateResponse) => (
              <MenuItem key={tmpl.id} value={tmpl.id}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box
                    sx={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      bgcolor: tmpl.primaryColor || "#6366f1",
                      flexShrink: 0,
                    }}
                  />
                  {tmpl.name}
                </Box>
              </MenuItem>
            ))}
          </TextField>

          {/* Context multi-select (optional) */}
          <TextField
            select
            label={t("slides.create.selectContexts")}
            fullWidth
            value={selectedContextIds}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedContextIds(typeof val === "string" ? val.split(",") : (val as string[]));
            }}
            SelectProps={{
              multiple: true,
              renderValue: (selected) => (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {(selected as string[]).map((id) => {
                    const ctx = contexts.find((c: { id: string }) => c.id === id);
                    return <Chip key={id} label={ctx?.name || id} size="small" />;
                  })}
                </Box>
              ),
            }}
            helperText={t("slides.create.contextsHelper")}
            sx={{ mb: 3 }}
          >
            {contexts.map((ctx: { id: string; name: string }) => (
              <MenuItem key={ctx.id} value={ctx.id}>
                <Checkbox checked={selectedContextIds.includes(ctx.id)} size="small" />
                <ListItemText primary={ctx.name} />
              </MenuItem>
            ))}
          </TextField>

          {/* Optional title */}
          <TextField
            label={t("slides.create.presentationTitle")}
            fullWidth
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            helperText={t("slides.create.titleHelper")}
            sx={{ mb: 3 }}
          />

          {/* Tone & Audience */}
          <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
            <TextField
              select
              label={t("slides.create.tone")}
              fullWidth
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            >
              <MenuItem value="">{t("slides.create.toneDefault")}</MenuItem>
              <MenuItem value="professional">{t("slides.create.tones.professional")}</MenuItem>
              <MenuItem value="casual">{t("slides.create.tones.casual")}</MenuItem>
              <MenuItem value="formal">{t("slides.create.tones.formal")}</MenuItem>
              <MenuItem value="inspirational">{t("slides.create.tones.inspirational")}</MenuItem>
              <MenuItem value="technical">{t("slides.create.tones.technical")}</MenuItem>
              <MenuItem value="persuasive">{t("slides.create.tones.persuasive")}</MenuItem>
            </TextField>
            <TextField
              select
              label={t("slides.create.audience")}
              fullWidth
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              <MenuItem value="">{t("slides.create.audienceDefault")}</MenuItem>
              <MenuItem value="executives">{t("slides.create.audiences.executives")}</MenuItem>
              <MenuItem value="team members">{t("slides.create.audiences.team")}</MenuItem>
              <MenuItem value="clients">{t("slides.create.audiences.clients")}</MenuItem>
              <MenuItem value="investors">{t("slides.create.audiences.investors")}</MenuItem>
              <MenuItem value="students">{t("slides.create.audiences.students")}</MenuItem>
              <MenuItem value="general public">{t("slides.create.audiences.general")}</MenuItem>
            </TextField>
          </Box>

          {/* Prompt */}
          <TextField
            label={t("slides.create.prompt")}
            fullWidth
            multiline
            rows={6}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t("slides.create.promptPlaceholder")}
            sx={{ mb: 3 }}
          />

          <Button
            variant="contained"
            fullWidth
            size="large"
            startIcon={isLoading ? <CircularProgress size={18} /> : <AutoAwesomeIcon />}
            onClick={handleGenerate}
            disabled={!selectedTemplateId || !prompt.trim() || isLoading}
          >
            {isLoading ? t("slides.create.generating") : t("slides.create.generate")}
          </Button>
        </Box>

        {/* Right: Theme preview */}
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
          {selectedTemplate ? (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <Typography variant="body2" sx={{ color: "#94a3b8", mb: 1 }}>
                {t("slides.create.themePreview", { name: selectedTemplate.name })}
              </Typography>
              <SlideRenderer
                typeKey="title_only"
                data={{
                  title: title || t("slides.create.previewTitle"),
                  subtitle: prompt.slice(0, 80) || t("slides.create.previewSubtitle"),
                }}
                brandColors={brandColors}
                scale={0.7}
              />
              {/* Mini thumbnails of other types */}
              <Box
                sx={{
                  display: "flex",
                  gap: 1.5,
                  flexWrap: "wrap",
                  justifyContent: "center",
                  mt: 2,
                }}
              >
                {SLIDE_TYPES.slice(1, 5).map((st) => (
                  <SlideRenderer
                    key={st.key}
                    typeKey={st.key}
                    data={st.sampleData}
                    brandColors={brandColors}
                    scale={0.2}
                  />
                ))}
              </Box>
            </Box>
          ) : (
            <Card
              variant="outlined"
              sx={{ p: 4, bgcolor: "transparent", borderColor: "rgba(148,163,184,0.2)" }}
            >
              <CardContent sx={{ textAlign: "center" }}>
                <Typography sx={{ color: "#64748b" }}>
                  {t("slides.create.selectThemePrompt")}
                </Typography>
              </CardContent>
            </Card>
          )}
        </Box>
      </Box>
    </SidebarLayout>
  );
};

export default SlideCreate;
