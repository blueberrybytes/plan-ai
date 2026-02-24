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
} from "@mui/material";
import {
  AutoAwesome as AutoAwesomeIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useCreateDocMutation } from "../store/apis/docApi";
import { useGetDocThemesQuery } from "../store/apis/docThemeApi";
import { useListContextsQuery } from "../store/apis/contextApi";
import { useListGlobalTranscriptsQuery } from "../store/apis/transcriptApi";

const STEPS = ["docs.create.steps.content", "docs.create.steps.sources", "docs.create.steps.theme"];

const DocCreate: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [contextIds, setContextIds] = useState<string[]>([]);
  const [transcriptIds, setTranscriptIds] = useState<string[]>([]);
  const [themeId, setThemeId] = useState("");

  const [createDoc, { isLoading }] = useCreateDocMutation();
  const { data: themes = [] } = useGetDocThemesQuery();
  const { data: contextsData } = useListContextsQuery();
  const { data: transcriptsData } = useListGlobalTranscriptsQuery({});

  const contexts = contextsData?.data?.contexts ?? [];
  const transcriptList = transcriptsData?.data?.transcripts ?? [];

  const handleSubmit = async () => {
    const result = await createDoc({
      title: title || "Untitled Document",
      prompt,
      contextIds,
      transcriptIds,
      themeId: themeId || undefined,
    });
    if ("data" in result && result.data) {
      navigate(`/docs/view/${result.data.id}`);
    }
  };

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 800, mx: "auto" }}>
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

        {/* Step 0: Content */}
        {activeStep === 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <TextField
              label={t("docs.create.titleLabel")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              placeholder={t("docs.create.titlePlaceholder")}
            />
            <TextField
              label={t("docs.create.promptLabel")}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              multiline
              rows={6}
              fullWidth
              placeholder={t("docs.create.promptPlaceholder")}
            />
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
              options={contexts}
              getOptionLabel={(o) => o.name}
              value={contexts.filter((c) => contextIds.includes(c.id))}
              onChange={(_, selected) => setContextIds(selected.map((s: { id: string }) => s.id))}
              renderTags={(value, getTagProps) =>
                value.map((opt, index) => (
                  <Chip label={opt.name} {...getTagProps({ index })} key={opt.id} />
                ))
              }
              renderInput={(params) => (
                <TextField {...params} label={t("docs.create.contextsLabel")} />
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
              disabled={activeStep === 0 && !prompt.trim()}
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
              disabled={!prompt.trim()}
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
