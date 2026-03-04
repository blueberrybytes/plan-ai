import React, { useState } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Stepper,
  Step,
  StepLabel,
  Chip,
  Autocomplete,
  Grid,
  Card,
  CardActionArea,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import {
  AutoAwesome as AutoAwesomeIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  AccountTree as AccountTreeIcon,
  TableChart as TableChartIcon,
  ViewTimeline as ViewTimelineIcon,
  Psychology as PsychologyIcon,
  DynamicFeed as DynamicFeedIcon,
  Storage as StorageIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useCreateDiagramMutation, CreateDiagramRequest } from "../store/apis/diagramApi";
import { useListContextsQuery } from "../store/apis/contextApi";
import { useListGlobalTranscriptsQuery } from "../store/apis/transcriptApi";
import { THEME_PRESETS } from "../components/slides/themePresets";

const STEPS_AI = ["Diagram Type & Theme", "Details", "Sources"];
const STEPS_MANUAL = ["Diagram Type & Theme"];

const DIAGRAM_TYPES = [
  {
    id: "FLOWCHART",
    label: "Flowchart",
    icon: <AccountTreeIcon fontSize="large" color="primary" />,
    desc: "Visualize a process flow or logic tree step-by-step.",
  },
  {
    id: "SEQUENCE",
    label: "Sequence",
    icon: <DynamicFeedIcon fontSize="large" color="secondary" />,
    desc: "Show interactions between systems or characters over time.",
  },
  {
    id: "GANTT",
    label: "Gantt Chart",
    icon: <ViewTimelineIcon fontSize="large" color="warning" />,
    desc: "Project schedules, timelines, and dependencies.",
  },
  {
    id: "MINDMAP",
    label: "Mindmap",
    icon: <PsychologyIcon fontSize="large" color="success" />,
    desc: "Brainstorm ideas radiating from a central concept.",
  },
  {
    id: "CLASS",
    label: "Class Diagram",
    icon: <TableChartIcon fontSize="large" color="info" />,
    desc: "Object-oriented programming structures and relationships.",
  },
  {
    id: "ER",
    label: "Entity-Relationship",
    icon: <StorageIcon fontSize="large" color="error" />,
    desc: "Database schemas, tables, and foreign keys.",
  },
  {
    id: "ARCHITECTURE",
    label: "Architecture",
    icon: <AccountTreeIcon fontSize="large" color="primary" />,
    desc: "High-level cloud or system deployment architecture.",
  },
];

const DiagramCreate: React.FC = () => {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);

  // Form State
  const [type, setType] = useState<string>("");
  const [theme, setTheme] = useState<string>("BlueBerryBytes");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [contextIds, setContextIds] = useState<string[]>([]);
  const [transcriptIds, setTranscriptIds] = useState<string[]>([]);
  const [isManual, setIsManual] = useState<boolean>(false);

  const [createDiagram, { isLoading }] = useCreateDiagramMutation();
  const { data: contextsData } = useListContextsQuery();
  const { data: transcriptsData } = useListGlobalTranscriptsQuery({});

  const contexts = contextsData?.data?.contexts || [];
  const transcriptList = transcriptsData?.data?.transcripts || [];

  const handleSubmit = async () => {
    if (!type || (!isManual && !prompt)) return;

    const result = await createDiagram({
      title: title || (isManual ? "New Manual Diagram" : "Untitled Diagram"),
      prompt: isManual ? "" : prompt,
      type: type as CreateDiagramRequest["type"],
      theme,
      contextIds: isManual ? [] : contextIds,
      transcriptIds: isManual ? [] : transcriptIds,
      isManual,
    });

    if ("data" in result && result.data) {
      navigate(`/diagrams/${result.data.id}`);
    }
  };

  const isStepValid = () => {
    if (activeStep === 0) return !!type;
    if (!isManual && activeStep === 1) return !!prompt.trim();
    return true;
  };

  const currentSteps = isManual ? STEPS_MANUAL : STEPS_AI;

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 900, mx: "auto" }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/diagrams")} sx={{ mb: 3 }}>
          Back to Diagrams
        </Button>
        <Typography variant="h4" fontWeight={700} sx={{ mb: 4 }}>
          Visual Architect
        </Typography>

        <Box sx={{ display: "flex", justifyContent: "center", mb: 4 }}>
          <ToggleButtonGroup
            color="primary"
            value={isManual}
            exclusive
            onChange={(_, val) => {
              if (val !== null) {
                setIsManual(val);
                setActiveStep(0);
              }
            }}
          >
            <ToggleButton value={false} sx={{ px: 4, fontWeight: 600 }}>
              Generate with AI
            </ToggleButton>
            <ToggleButton value={true} sx={{ px: 4, fontWeight: 600 }}>
              Start from Scratch
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Stepper activeStep={activeStep} sx={{ mb: 5 }}>
          {currentSteps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Step 0: Diagram Type & Theme */}
        {activeStep === 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Diagram Theme</InputLabel>
              <Select
                value={theme}
                label="Diagram Theme"
                onChange={(e) => setTheme(e.target.value)}
              >
                {THEME_PRESETS.map((t) => (
                  <MenuItem key={t.name} value={t.name}>
                    {t.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Typography variant="h6" fontWeight={600} sx={{ mt: 2 }}>
              Select Diagram Type
            </Typography>
            <Grid container spacing={2}>
              {DIAGRAM_TYPES.map((t) => (
                <Grid item xs={12} sm={6} md={4} key={t.id}>
                  <Card
                    variant="outlined"
                    sx={{
                      borderColor: type === t.id ? "primary.main" : "divider",
                      borderWidth: type === t.id ? 2 : 1,
                      height: "100%",
                    }}
                  >
                    <CardActionArea onClick={() => setType(t.id)} sx={{ h: "100%", p: 2 }}>
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          textAlign: "center",
                          gap: 1,
                        }}
                      >
                        {t.icon}
                        <Typography variant="subtitle1" fontWeight={700}>
                          {t.label}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {t.desc}
                        </Typography>
                      </Box>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {/* Step 1: Details */}
        {activeStep === 1 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <TextField
              label="Diagram Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              placeholder="e.g., E-Commerce Checkout Flow"
            />
            <TextField
              label="Prompt Instructions"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              multiline
              rows={6}
              fullWidth
              required
              placeholder="Describe what the AI should map out. E.g. 'Create a sequence diagram between User, Backend, and Stripe during checkout.'"
            />
          </Box>
        )}

        {/* Step 2: Sources */}
        {activeStep === 2 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Typography variant="body1" color="text.secondary">
              Attach project contexts and transcripts to ground the AI&apos;s generation in your
              actual data.
            </Typography>
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
                  <Chip label={opt.title ?? "Untitled"} {...getTagProps({ index })} key={opt.id} />
                ))
              }
              renderInput={(params) => <TextField {...params} label="Meeting Transcripts" />}
            />
          </Box>
        )}

        {/* Navigation */}
        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 6 }}>
          {currentSteps.length > 1 && (
            <Button disabled={activeStep === 0} onClick={() => setActiveStep((s) => s - 1)}>
              Back
            </Button>
          )}
          {currentSteps.length === 1 && <Box />}

          {activeStep < currentSteps.length - 1 ? (
            <Button
              variant="contained"
              endIcon={<ArrowForwardIcon />}
              disabled={!isStepValid()}
              onClick={() => setActiveStep((s) => s + 1)}
            >
              Next
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={!isManual && <AutoAwesomeIcon />}
              loading={isLoading}
              onClick={handleSubmit}
              disabled={!isStepValid()}
            >
              {isManual ? "Create Empty Diagram" : "Generate Diagram"}
            </Button>
          )}
        </Box>
      </Box>
    </SidebarLayout>
  );
};

export default DiagramCreate;
