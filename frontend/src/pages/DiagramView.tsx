import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Code as CodeIcon,
  CodeOff as CodeOffIcon,
} from "@mui/icons-material";
import { useNavigate, useParams } from "react-router-dom";
import { useGetDiagramQuery, useUpdateDiagramMutation } from "../store/apis/diagramApi";
import MermaidRenderer from "../components/common/MermaidRenderer";
import SidebarLayout from "../components/layout/SidebarLayout";
import { THEME_PRESETS } from "../components/slides/themePresets";

const DiagramView: React.FC = () => {
  const navigate = useNavigate();
  const { diagramId } = useParams<{ diagramId: string }>();

  const { data: diagram, isLoading } = useGetDiagramQuery(diagramId || "", {
    skip: !diagramId,
    pollingInterval: 3000,
  });

  const [updateDiagram, { isLoading: isUpdating }] = useUpdateDiagramMutation();

  const [code, setCode] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [theme, setTheme] = useState<string>("BlueBerryBytes");
  const [isModified, setIsModified] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(true);

  // Sync state with fetching
  useEffect(() => {
    if (diagram) {
      if (!isModified) {
        setCode(diagram.mermaidCode || "");
        setTitle(diagram.title || "");
        setTheme(diagram.theme || "BlueBerryBytes");
      }
    }
  }, [diagram, isModified]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value);
    setIsModified(true);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    setIsModified(true);
  };

  const handleSave = async () => {
    if (!diagramId) return;
    await updateDiagram({
      id: diagramId,
      body: {
        title,
        mermaidCode: code,
        theme,
      },
    });
    setIsModified(false);
  };

  if (isLoading) {
    return (
      <SidebarLayout fullHeight>
        <Box
          sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}
        >
          <CircularProgress />
        </Box>
      </SidebarLayout>
    );
  }

  if (!diagram) {
    return (
      <SidebarLayout fullHeight>
        <Box sx={{ p: 4 }}>
          <Typography variant="h5" color="error">
            Diagram not found.
          </Typography>
        </Box>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout fullHeight>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          bgcolor: "background.default",
        }}
      >
        {/* Header Toolbar */}
        <Box
          sx={{
            px: 3,
            py: 2,
            borderBottom: "1px solid",
            borderColor: "divider",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            bgcolor: "background.paper",
            zIndex: 10,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <IconButton onClick={() => navigate("/diagrams")}>
              <ArrowBackIcon />
            </IconButton>
            <TextField
              value={title}
              onChange={handleTitleChange}
              variant="standard"
              InputProps={{
                disableUnderline: true,
                sx: { fontSize: "1.25rem", fontWeight: 700 },
              }}
            />
            <Chip
              label={diagram.status}
              size="small"
              color={
                diagram.status === "GENERATING"
                  ? "warning"
                  : diagram.status === "FAILED"
                    ? "error"
                    : "success"
              }
              variant="outlined"
            />
            {diagram.status === "GENERATING" && <CircularProgress size={16} sx={{ ml: 1 }} />}
            <Button
              variant="text"
              color="inherit"
              startIcon={isEditorOpen ? <CodeOffIcon /> : <CodeIcon />}
              onClick={() => setIsEditorOpen(!isEditorOpen)}
              sx={{ ml: 2, textTransform: "none", fontWeight: 600 }}
            >
              {isEditorOpen ? "Hide Editor" : "Show Editor"}
            </Button>
          </Box>
          <Box sx={{ display: "flex", gap: 2 }}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Theme</InputLabel>
              <Select
                value={theme}
                label="Theme"
                onChange={(e) => {
                  setTheme(e.target.value);
                  setIsModified(true);
                }}
              >
                {THEME_PRESETS.map((t) => (
                  <MenuItem key={t.name} value={t.name}>
                    {t.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ display: "flex", gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => {
                setCode(diagram.mermaidCode || "");
                setTitle(diagram.title || "");
                setTheme(diagram.theme || "BlueBerryBytes");
                setIsModified(false);
              }}
              disabled={!isModified || isUpdating}
            >
              Discard
            </Button>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={!isModified || isUpdating}
            >
              {isUpdating ? "Saving..." : "Save Code"}
            </Button>
          </Box>
        </Box>

        {/* Split Screen Workspace */}
        <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left panel: Code Editor */}
          {isEditorOpen && (
            <Box
              sx={{
                width: "40%",
                minWidth: 300,
                borderRight: "1px solid",
                borderColor: "divider",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Box
                sx={{
                  px: 2,
                  py: 1,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  bgcolor: "rgba(255,255,255,0.02)",
                }}
              >
                <Typography variant="overline" color="text.secondary" fontWeight={700}>
                  Mermaid Syntax Editor
                </Typography>
              </Box>
              <TextField
                multiline
                fullWidth
                value={code}
                onChange={handleCodeChange}
                disabled={diagram.status === "GENERATING"}
                InputProps={{
                  sx: {
                    fontFamily: "monospace",
                    fontSize: "0.875rem",
                    p: 2,
                    alignItems: "flex-start",
                  },
                }}
                sx={{
                  flex: 1,
                  "& .MuiInputBase-root": {
                    height: "100%",
                  },
                  "& .MuiInputBase-input": {
                    height: "100% !important",
                    overflowY: "auto !important",
                  },
                }}
              />
            </Box>
          )}

          {/* Right panel: Live Preview */}
          <Box
            sx={{
              flex: 1,
              overflow: "auto",
              display: "flex",
              flexDirection: "column",
              bgcolor: "#f8f9fa", // A slightly light background to make diagrams crisp if preferred, or could use default
            }}
          >
            <Box
              sx={{
                px: 2,
                py: 1,
                borderBottom: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
              }}
            >
              <Typography variant="overline" color="text.secondary" fontWeight={700}>
                Live Preview
              </Typography>
            </Box>
            <Box
              sx={{
                flex: 1,
                display: "flex",
                bgcolor: "#ffffff",
                position: "relative",
              }}
            >
              {code ? (
                <MermaidRenderer chart={code} theme={THEME_PRESETS.find((t) => t.name === theme)} />
              ) : (
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    width: "100%",
                  }}
                >
                  <Typography color="text.secondary">
                    {diagram.status === "GENERATING"
                      ? "AI is constructing your diagram..."
                      : "No Mermaid syntax provided."}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </Box>
    </SidebarLayout>
  );
};

export default DiagramView;
