import React, { useState } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Chip,
  Autocomplete,
  ToggleButtonGroup,
  ToggleButton,
  MenuItem,
} from "@mui/material";
import { AutoAwesome as AutoAwesomeIcon, ArrowBack as ArrowBackIcon } from "@mui/icons-material";
import { useNavigate, useLocation } from "react-router-dom";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useCreateDiagramMutation, CreateDiagramRequest } from "../store/apis/diagramApi";
import { useGetBrandThemesQuery } from "../store/apis/brandThemeApi";
import { useListContextsQuery } from "../store/apis/contextApi";
import { useListGlobalTranscriptsQuery } from "../store/apis/transcriptApi";
import { DIAGRAM_TYPES } from "../components/diagrams/diagramTypes";
import MermaidRenderer from "../components/common/MermaidRenderer";

const DiagramCreate: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Form State
  const [type, setType] = useState<string>("AUTO");
  const [title, setTitle] = useState("");
  const [themeId, setThemeId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [contextIds, setContextIds] = useState<string[]>([]);
  const [transcriptIds, setTranscriptIds] = useState<string[]>([]);
  const [isManual, setIsManual] = useState<boolean>(false);

  // Initialize from URL parameter
  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const initialType = params.get("type");
    if (initialType && DIAGRAM_TYPES.find((d) => d.id === initialType)) {
      setType(initialType);
    }
  }, [location.search]);

  const [createDiagram, { isLoading }] = useCreateDiagramMutation();
  const { data: contextsData } = useListContextsQuery();
  const { data: transcriptsData } = useListGlobalTranscriptsQuery({});
  const { data: themes = [] } = useGetBrandThemesQuery();

  const contexts = contextsData?.data?.contexts || [];
  const transcriptList = transcriptsData?.data?.transcripts || [];

  const handleSubmit = async () => {
    if (
      !type ||
      (!isManual && !prompt.trim() && contextIds.length === 0 && transcriptIds.length === 0)
    )
      return;

    const result = await createDiagram({
      title: title || (isManual ? "New Manual Diagram" : "Untitled Diagram"),
      prompt: isManual ? "" : prompt,
      type: type as CreateDiagramRequest["type"],
      themeId: themeId || undefined,
      contextIds: isManual ? [] : contextIds,
      transcriptIds: isManual ? [] : transcriptIds,
      isManual,
    });

    if ("data" in result && result.data) {
      navigate(`/diagrams/${result.data.id}`);
    }
  };

  const isFormValid = () => {
    if (!type) return false;
    if (!isManual && !prompt.trim() && contextIds.length === 0 && transcriptIds.length === 0)
      return false;
    return true;
  };

  const currentTypeMeta = DIAGRAM_TYPES.find((t) => t.id === type) || DIAGRAM_TYPES[0];

  return (
    <SidebarLayout>
      <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        {/* Left: Controls */}
        <Box
          sx={{
            width: 420,
            flexShrink: 0,
            borderRight: 1,
            borderColor: "divider",
            overflowY: "auto",
            bgcolor: "background.paper",
            p: 3,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate("/diagrams")}
            sx={{ mb: 2, alignSelf: "flex-start" }}
          >
            Back to Diagrams
          </Button>

          <Box
            sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}
          >
            <Typography variant="h5" fontWeight={700}>
              Visual Architect
            </Typography>
          </Box>

          <Box sx={{ display: "flex", justifyContent: "center", mb: 4 }}>
            <ToggleButtonGroup
              color="primary"
              value={isManual}
              exclusive
              onChange={(_, val) => {
                if (val !== null) {
                  setIsManual(val);
                  if (val === true && type === "AUTO") {
                    setType("FLOWCHART");
                  }
                }
              }}
              size="small"
              fullWidth
            >
              <ToggleButton value={false} sx={{ fontWeight: 600 }}>
                Generate via AI
              </ToggleButton>
              <ToggleButton value={true} sx={{ fontWeight: 600 }}>
                Scratch
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
            <TextField
              select
              label="Diagram Type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              fullWidth
            >
              {DIAGRAM_TYPES.map((t) => (
                <MenuItem key={t.id} value={t.id} disabled={isManual && t.id === "AUTO"}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    {React.cloneElement(t.icon as React.ReactElement, { fontSize: "small" })}
                    <Box>
                      <Typography variant="body1">{t.label}</Typography>
                    </Box>
                  </Box>
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Diagram Title (Optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              placeholder="e.g., Auth Flow"
            />

            <TextField
              select
              label="Theme (Optional)"
              value={themeId}
              onChange={(e) => setThemeId(e.target.value)}
              fullWidth
            >
              <MenuItem value="">Default Theme</MenuItem>
              {themes.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name}
                </MenuItem>
              ))}
            </TextField>

            {!isManual && (
              <>
                <TextField
                  label="Prompt Instructions"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  multiline
                  rows={4}
                  fullWidth
                  required={contextIds.length === 0 && transcriptIds.length === 0}
                  placeholder="Describe what the AI should map out..."
                />
                <Autocomplete
                  multiple
                  options={contexts}
                  getOptionLabel={(o) => o.name}
                  value={contexts.filter((c) => contextIds.includes(c.id))}
                  onChange={(_, selected) => setContextIds(selected.map((s) => s.id))}
                  renderTags={(value, getTagProps) =>
                    value.map((opt, index) => (
                      <Chip label={opt.name} {...getTagProps({ index })} key={opt.id} />
                    ))
                  }
                  renderInput={(params) => (
                    <TextField {...params} label="Contexts (PDFs, Source Code)" />
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
                      <Chip
                        label={opt.title ?? "Untitled"}
                        {...getTagProps({ index })}
                        key={opt.id}
                      />
                    ))
                  }
                  renderInput={(params) => <TextField {...params} label="Meeting Transcripts" />}
                />
              </>
            )}
          </Box>

          <Button
            variant="contained"
            startIcon={!isManual && <AutoAwesomeIcon />}
            loading={isLoading}
            onClick={handleSubmit}
            disabled={!isFormValid() || isLoading}
            sx={{ mt: 4, py: 1.5 }}
            size="large"
          >
            {isManual ? "Create Empty Diagram" : "Generate Diagram"}
          </Button>
        </Box>

        {/* Right: Preview */}
        <Box
          sx={{
            flex: 1,
            position: "relative",
            bgcolor: "#f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 4,
          }}
        >
          {isManual ? (
            <Box sx={{ textAlign: "center", opacity: 0.5 }}>
              {React.cloneElement(currentTypeMeta.icon as React.ReactElement, {
                sx: { fontSize: 80, color: "text.secondary", mb: 2 },
              })}
              <Typography variant="h5" color="text.secondary">
                Empty {currentTypeMeta.label}
              </Typography>
              <Typography
                variant="body1"
                color="text.secondary"
                sx={{ maxWidth: 400, mx: "auto", mt: 1 }}
              >
                You&apos;ve chosen to start from scratch. An empty canvas will be created for you.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ width: "100%", height: "100%", position: "relative" }}>
              <MermaidRenderer
                chart={currentTypeMeta.sampleCode}
                theme={themes.find((t) => t.id === themeId) || null}
              />
              <Box sx={{ position: "absolute", top: 0, left: 0, opacity: 0.7 }}>
                <Chip label="Example Diagram" color="primary" size="small" />
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </SidebarLayout>
  );
};

export default DiagramCreate;
