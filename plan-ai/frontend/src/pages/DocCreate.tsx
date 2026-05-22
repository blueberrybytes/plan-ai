import React, { useState } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Stepper,
  Step,
  StepLabel,
  Chip,
  Autocomplete,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import {
  AutoAwesome as AutoAwesomeIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  UploadFile as UploadFileIcon,
  Article as ArticleIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useCreateDocMutation, useImportDocMutation } from "../store/apis/docApi";
import { useGetBrandThemesQuery } from "../store/apis/brandThemeApi";
import { useListProjectsQuery } from "../store/apis/projectApi";
import { useListGlobalTranscriptsQuery } from "../store/apis/transcriptApi";

const STEPS = ["docs.create.steps.content", "docs.create.steps.sources", "docs.create.steps.theme"];

const DocCreate: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [transcriptIds, setTranscriptIds] = useState<string[]>([]);
  const [themeId, setThemeId] = useState("");
  const [mode, setMode] = useState<"prompt" | "import" | "blank">("prompt");
  const [file, setFile] = useState<File | null>(null);

  const [createDoc, { isLoading: isCreating }] = useCreateDocMutation();
  const [importDoc, { isLoading: isImporting }] = useImportDocMutation();
  const isLoading = isCreating || isImporting;
  const { data: themes = [] } = useGetBrandThemesQuery();
  const { data: projectsData } = useListProjectsQuery(undefined);
  const { data: transcriptsData } = useListGlobalTranscriptsQuery({});

  const projects = projectsData?.data?.projects ?? [];
  const transcriptList = transcriptsData?.data?.transcripts ?? [];

  const handleSubmit = async () => {
    let result;

    if (mode === "prompt" || mode === "blank") {
      result = await createDoc({
        title: title || "Untitled Document",
        prompt: mode === "prompt" ? prompt : undefined,
        isBlank: mode === "blank",
        projectIds,
        transcriptIds,
        themeId: themeId || undefined,
      });
    } else {
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      if (projectIds.length > 0) formData.append("projectIds", JSON.stringify(projectIds));
      if (transcriptIds.length > 0) formData.append("transcriptIds", JSON.stringify(transcriptIds));
      if (themeId) formData.append("themeId", themeId);

      result = await importDoc(formData);
    }

    if (result && "data" in result && result.data) {
      navigate(`/docs/view/${result.data.id}`);
    }
  };

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 3, md: 6 } }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/docs")} sx={{ mb: 3 }}>
          {t("common.back")}
        </Button>
        <Typography variant="h4" fontWeight={700} sx={{ mb: 4 }}>
          {t("docs.create.title")}
        </Typography>

        <Stepper activeStep={activeStep} sx={{ mb: 5 }}>
          {STEPS.map((key) => (
            <Step key={key}>
              <StepLabel>{t(key)}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Mode Switcher */}
        {activeStep === 0 && (
          <Box sx={{ mb: 4, display: "flex", justifyContent: "center" }}>
            <ToggleButtonGroup
              color="primary"
              value={mode}
              exclusive
              onChange={(e, newMode) => {
                if (newMode) setMode(newMode);
              }}
            >
              <ToggleButton value="prompt" sx={{ px: 4 }}>
                <AutoAwesomeIcon sx={{ mr: 1, fontSize: 18 }} />
                Start from Prompt
              </ToggleButton>
              <ToggleButton value="blank" sx={{ px: 4 }}>
                <ArticleIcon sx={{ mr: 1, fontSize: 18 }} />
                Blank Document
              </ToggleButton>
              <ToggleButton value="import" sx={{ px: 4 }}>
                <UploadFileIcon sx={{ mr: 1, fontSize: 18 }} />
                Import File
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}

        {activeStep === 0 && (mode === "prompt" || mode === "blank") && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <TextField
              label={t("docs.create.titleLabel")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              placeholder={t("docs.create.titlePlaceholder")}
            />
            {mode === "prompt" && (
              <TextField
                label={t("docs.create.promptLabel")}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                multiline
                rows={6}
                fullWidth
                placeholder={t("docs.create.promptPlaceholder")}
              />
            )}
            {mode === "blank" && (
              <Typography variant="body1" color="text.secondary">
                You can specify a title above, or skip it. In the next step, select transcripts or contexts to include. We will generate the document based on your selected sources.
              </Typography>
            )}
          </Box>
        )}

        {activeStep === 0 && mode === "import" && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              alignItems: "center",
              p: 4,
              border: "2px dashed",
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            <UploadFileIcon sx={{ fontSize: 48, color: "text.secondary" }} />
            <Typography variant="body1" color="text.secondary" textAlign="center">
              We will extract the text from your file and convert it to beautiful Markdown format.
              <br />
              <Typography component="span" variant="caption" sx={{ mt: 1, display: "block", fontWeight: 600 }}>
                Supported extensions: .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .txt, .md, .csv
              </Typography>
            </Typography>
            <Button variant="contained" component="label">
              Select File
              <input
                type="file"
                hidden
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv"
              />
            </Button>
            {file && (
              <Chip
                label={file.name}
                onDelete={() => setFile(null)}
                color="primary"
                variant="outlined"
              />
            )}
          </Box>
        )}

        {/* Step 1: Sources */}
        {activeStep === 1 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Typography variant="body1" color="text.secondary">
              {t("docs.create.sourcesHint")}
            </Typography>
            <Autocomplete
              multiple
              options={projects}
              getOptionLabel={(o) => o.title}
              value={projects.filter((p) => projectIds.includes(p.id))}
              onChange={(_, selected) => setProjectIds(selected.map((s: { id: string }) => s.id))}
              renderTags={(value, getTagProps) =>
                value.map((opt, index) => (
                  <Chip label={opt.title} {...getTagProps({ index })} key={opt.id} />
                ))
              }
              renderInput={(params) => (
                <TextField {...params} label="Projects (knowledge sources)" />
              )}
            />
            <Autocomplete
              multiple
              options={transcriptList}
              getOptionLabel={(item) => item.title ?? "Untitled"}
              value={transcriptList.filter((item) => transcriptIds.includes(item.id))}
              onChange={(_, selected) => setTranscriptIds(selected.map((s) => s.id))}
              renderTags={(value, getTagProps) =>
                value.map((opt, index) => (
                  <Chip label={opt.title ?? "Untitled"} {...getTagProps({ index })} key={opt.id} />
                ))
              }
              renderInput={(params) => (
                <TextField {...params} label={t("docs.create.transcriptsLabel")} />
              )}
            />
          </Box>
        )}

        {/* Step 2: Theme */}
        {activeStep === 2 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <FormControl fullWidth>
              <InputLabel>{t("docs.create.themeLabel")}</InputLabel>
              <Select
                value={themeId}
                label={t("docs.create.themeLabel")}
                onChange={(e) => setThemeId(e.target.value)}
              >
                <MenuItem value="">{t("docs.create.noTheme")}</MenuItem>
                {themes.map((theme) => (
                  <MenuItem key={theme.id} value={theme.id}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Box
                        sx={{
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          bgcolor: theme.primaryColor,
                        }}
                      />
                      {theme.name}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}

        {/* Navigation */}
        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 5 }}>
          <Button disabled={activeStep === 0} onClick={() => setActiveStep((s) => s - 1)}>
            {t("common.back")}
          </Button>
          {activeStep < STEPS.length - 1 ? (
            <Button
              variant="contained"
              endIcon={<ArrowForwardIcon />}
              disabled={
                activeStep === 0 &&
                ((mode === "prompt" && !prompt.trim()) ||
                  (mode === "import" && !file))
              }
              onClick={() => setActiveStep((s) => s + 1)}
            >
              {t("common.next")}
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={<AutoAwesomeIcon />}
              loading={isLoading}
              onClick={handleSubmit}
              disabled={
                (mode === "prompt" && !prompt.trim()) ||
                (mode === "import" && !file)
              }
            >
              {t("docs.create.generate")}
            </Button>
          )}
        </Box>
      </Box>
    </SidebarLayout>
  );
};

export default DocCreate;
