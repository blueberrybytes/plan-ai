import React, { useState, useEffect } from "react";
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
  Dialog,
  DialogContent,
  LinearProgress,
  Autocomplete,
} from "@mui/material";
import { ArrowBack as ArrowBackIcon, AutoAwesome as AutoAwesomeIcon } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import SlideRenderer from "../components/slides/SlideRenderer";
import { SLIDE_TYPES } from "../components/slides/slideTypes";
import { useGeneratePresentationMutation } from "../store/apis/slideApi";
import { useGetBrandThemesQuery, BrandThemeResponse } from "../store/apis/brandThemeApi";
import { useListProjectsQuery } from "../store/apis/projectApi";
import { useListGlobalTranscriptsQuery } from "../store/apis/transcriptApi";
import AiModelSelector from "../components/common/AiModelSelector";

const LOADING_MESSAGES = [
  "Analyzing your prompt...",
  "Structuring the presentation outline...",
  "Drafting slide content...",
  "Applying brand styles...",
  "Generating beautiful visuals...",
  "Polishing final details...",
];

const SlideCreate: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: themes = [] } = useGetBrandThemesQuery();
  const { data: projectsData } = useListProjectsQuery(undefined);
  const { data: transcriptsData } = useListGlobalTranscriptsQuery({});
  const [generatePresentation, { isLoading }] = useGeneratePresentationMutation();

  const [selectedThemeId, setSelectedThemeId] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedTranscriptIds, setSelectedTranscriptIds] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [tone, setTone] = useState("auto");
  const [audience, setAudience] = useState("auto");
  const [numSlides, setNumSlides] = useState<number>(0);
  const [modelKey, setModelKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingIndex, setLoadingIndex] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      setLoadingIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isLoading]);

  const projects = projectsData?.data?.projects ?? [];
  const transcriptList = transcriptsData?.data?.transcripts ?? [];
  const selectedTheme = themes.find((t) => t.id === selectedThemeId);

  const handleGenerate = async () => {
    if (!prompt.trim() && selectedProjectIds.length === 0 && selectedTranscriptIds.length === 0) return;
    try {
      setError(null);
      const enrichedPrompt = [
        prompt,
        tone && tone !== "auto" ? `\nTone: ${tone}` : "",
        audience && audience !== "auto" ? `\nTarget audience: ${audience}` : "",
      ].join("");
      const result = await generatePresentation({
        themeId: selectedThemeId || undefined,
        projectIds: selectedProjectIds,
        transcriptIds: selectedTranscriptIds,
        prompt: enrichedPrompt,
        title: title || undefined,
        numSlides: numSlides > 0 ? numSlides : undefined,
        modelKey: modelKey || undefined,
      }).unwrap();
      navigate(`/slides/view/${result.id}`);
      void result;
    } catch {
      setError(t("slides.create.error"));
    }
  };

  const brandColors = selectedTheme
    ? {
        primary: selectedTheme.primaryColor || "#6366f1",
        secondary: selectedTheme.secondaryColor || "#a78bfa",
        background: selectedTheme.backgroundColor || "#0f172a",
        backgroundStyle:
          (selectedTheme.backgroundStyle as
            | "solid"
            | "gradient"
            | "mesh"
            | "minimal"
            | undefined) || "solid",
        cardStyle: (selectedTheme.cardStyle as "flat" | "glass" | "outline" | undefined) || "flat",
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

          <TextField
            select
            label="Select Brand Theme"
            fullWidth
            value={selectedThemeId}
            onChange={(e) => setSelectedThemeId(e.target.value)}
            sx={{ mb: 3 }}
          >
            {themes.map((tmpl: BrandThemeResponse) => (
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

          {/* Project multi-select (optional) — provides knowledge sources */}
          <TextField
            select
            label="Projects (knowledge sources)"
            fullWidth
            value={selectedProjectIds}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedProjectIds(typeof val === "string" ? val.split(",") : (val as string[]));
            }}
            SelectProps={{
              multiple: true,
              renderValue: (selected) => (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {(selected as string[]).map((id) => {
                    const proj = projects.find((p: { id: string }) => p.id === id);
                    return <Chip key={id} label={proj?.title || id} size="small" />;
                  })}
                </Box>
              ),
            }}
            helperText="Files from selected projects will be used as context."
            sx={{ mb: 3 }}
          >
            {projects.map((proj: { id: string; title: string }) => (
              <MenuItem key={proj.id} value={proj.id}>
                <Checkbox checked={selectedProjectIds.includes(proj.id)} size="small" />
                <ListItemText primary={proj.title} />
              </MenuItem>
            ))}
          </TextField>

          {/* Transcript multi-select */}
          <Autocomplete
            multiple
            options={transcriptList}
            getOptionLabel={(item) => item.title ?? "Untitled"}
            value={transcriptList.filter((item) => selectedTranscriptIds.includes(item.id))}
            onChange={(_, selected) => setSelectedTranscriptIds(selected.map((s) => s.id))}
            renderTags={(value, getTagProps) =>
              value.map((opt, index) => (
                <Chip label={opt.title ?? "Untitled"} {...getTagProps({ index })} key={opt.id} size="small" />
              ))
            }
            renderInput={(params) => (
              <TextField {...params} label={t("docs.create.transcriptsLabel", "Select Recordings")} helperText="Include transcripts as context" />
            )}
            sx={{ mb: 3 }}
          />

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
              <MenuItem value="auto">{t("slides.create.toneDefault")}</MenuItem>
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
              <MenuItem value="auto">{t("slides.create.audienceDefault")}</MenuItem>
              <MenuItem value="executives">{t("slides.create.audiences.executives")}</MenuItem>
              <MenuItem value="team members">{t("slides.create.audiences.team")}</MenuItem>
              <MenuItem value="clients">{t("slides.create.audiences.clients")}</MenuItem>
              <MenuItem value="investors">{t("slides.create.audiences.investors")}</MenuItem>
              <MenuItem value="students">{t("slides.create.audiences.students")}</MenuItem>
              <MenuItem value="general public">{t("slides.create.audiences.general")}</MenuItem>
            </TextField>
          </Box>

          {/* Number of slides */}
          <TextField
            select
            label={t("slides.create.numSlides")}
            fullWidth
            value={numSlides}
            onChange={(e) => {
              const val = e.target.value;
              setNumSlides(Number(val));
            }}
            helperText={t("slides.create.numSlidesHelper")}
            sx={{ mb: 3 }}
          >
            <MenuItem value={0}>{t("slides.create.numSlidesAI")}</MenuItem>
            {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
              <MenuItem key={n} value={n}>
                {n}
              </MenuItem>
            ))}
          </TextField>

          <Box sx={{ mb: 3 }}>
            <AiModelSelector value={modelKey} onChange={setModelKey} disabled={isLoading} />
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
            disabled={(!prompt.trim() && selectedProjectIds.length === 0 && selectedTranscriptIds.length === 0) || isLoading}
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
          {selectedTheme ? (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <Typography variant="body2" sx={{ color: "#94a3b8", mb: 1 }}>
                {t("slides.create.themePreview", { name: selectedTheme.name })}
              </Typography>
              <SlideRenderer
                key={`title-${selectedTheme.id || "default"}`}
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
                    key={`${st.key}-${selectedTheme.id || "default"}`}
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

      {/* Loading Dialog */}
      <Dialog
        open={isLoading}
        PaperProps={{
          sx: {
            bgcolor: "background.paper",
            backgroundImage: "none",
            borderRadius: 3,
            p: 2,
            minWidth: 400,
            boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
            border: "1px solid rgba(99,102,241,0.2)",
          },
        }}
      >
        <DialogContent sx={{ textAlign: "center", py: 4, px: 6 }}>
          <Box sx={{ position: "relative", display: "inline-flex", mb: 4 }}>
            <CircularProgress size={72} thickness={4} sx={{ color: "#6366f1" }} />
            <Box
              sx={{
                top: 0,
                left: 0,
                bottom: 0,
                right: 0,
                position: "absolute",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AutoAwesomeIcon sx={{ color: "#a78bfa", fontSize: 28 }} />
            </Box>
          </Box>
          <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
            {t("slides.create.generatingStatus", "Crafting Presentation")}
          </Typography>
          <Box sx={{ height: 24, mb: 4 }}>
            <Typography
              key={loadingIndex}
              variant="body1"
              sx={{
                color: "#94a3b8",
                "@keyframes fadeUp": {
                  "0%": { opacity: 0, transform: "translateY(10px)" },
                  "10%": { opacity: 1, transform: "translateY(0)" },
                  "90%": { opacity: 1, transform: "translateY(0)" },
                  "100%": { opacity: 0, transform: "translateY(-10px)" },
                },
                animation: "fadeUp 4.5s ease-in-out forwards",
              }}
            >
              {LOADING_MESSAGES[loadingIndex]}
            </Typography>
          </Box>
          <LinearProgress
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: "rgba(99,102,241,0.1)",
              "& .MuiLinearProgress-bar": {
                bgcolor: "#6366f1",
              },
            }}
          />
        </DialogContent>
      </Dialog>
    </SidebarLayout>
  );
};

export default SlideCreate;
