import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Menu,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  Code as CodeIcon,
  CodeOff as CodeOffIcon,
  AutoAwesome as AutoAwesomeIcon,
  Download as DownloadIcon,
  Image as ImageIcon,
  DataObject as DataObjectIcon,
} from "@mui/icons-material";
import { toPng } from "html-to-image";
import { useNavigate, useParams } from "react-router-dom";
import {
  useGetDiagramQuery,
  useUpdateDiagramMutation,
  useImproveDiagramMutation,
} from "../store/apis/diagramApi";
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

  const [improveDiagram, { isLoading: isImproving }] = useImproveDiagramMutation();
  const [assistantInstruction, setAssistantInstruction] = useState("");

  const [downloadAnchorEl, setDownloadAnchorEl] = useState<null | HTMLElement>(null);

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

  const handleAssistantSubmit = async () => {
    if (!diagramId || !assistantInstruction.trim()) return;
    try {
      await improveDiagram({
        id: diagramId,
        body: { instruction: assistantInstruction },
      });
      setAssistantInstruction("");
    } catch (err) {
      console.error("Assistant error:", err);
    }
  };

  const handleDownloadPNG = async () => {
    setDownloadAnchorEl(null);
    const node = document.querySelector(".mermaid-container svg") as HTMLElement;
    if (!node) return;
    try {
      const dataUrl = await toPng(node, { backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = `${diagram?.title || "diagram"}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to export PNG", err);
    }
  };

  const handleDownloadSVG = () => {
    setDownloadAnchorEl(null);
    const svgNode = document.querySelector(".mermaid-container svg");
    if (!svgNode) return;
    const svgText = new XMLSerializer().serializeToString(svgNode);
    const blob = new Blob([svgText], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${diagram?.title || "diagram"}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadMermaidCode = () => {
    setDownloadAnchorEl(null);
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${diagram?.title || "diagram"}.mermaid`;
    link.click();
    URL.revokeObjectURL(url);
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

            <IconButton
              color="primary"
              onClick={(e) => setDownloadAnchorEl(e.currentTarget)}
              disabled={!code || diagram.status === "GENERATING"}
            >
              <DownloadIcon />
            </IconButton>
            <Menu
              anchorEl={downloadAnchorEl}
              open={Boolean(downloadAnchorEl)}
              onClose={() => setDownloadAnchorEl(null)}
            >
              <MenuItem onClick={handleDownloadPNG}>
                <ListItemIcon>
                  <ImageIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Export as PNG</ListItemText>
              </MenuItem>
              <MenuItem onClick={handleDownloadSVG}>
                <ListItemIcon>
                  <DataObjectIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Export as SVG</ListItemText>
              </MenuItem>
              <MenuItem onClick={handleDownloadMermaidCode}>
                <ListItemIcon>
                  <CodeIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Download Mermaid Code</ListItemText>
              </MenuItem>
            </Menu>

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
              {/* Floating AI Assistant Input */}
              <Box
                sx={{
                  position: "absolute",
                  bottom: 32,
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: 20,
                  width: "100%",
                  maxWidth: 500,
                  px: 2,
                }}
              >
                <TextField
                  fullWidth
                  placeholder="Ask AI to modify or fix the diagram..."
                  value={assistantInstruction}
                  onChange={(e) => setAssistantInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAssistantSubmit();
                    }
                  }}
                  disabled={diagram.status === "GENERATING" || isImproving}
                  InputProps={{
                    sx: {
                      bgcolor: "background.paper",
                      boxShadow: 3,
                      borderRadius: 4,
                      pr: 1,
                      "& fieldset": { border: "none" },
                    },
                    endAdornment: (
                      <Button
                        variant="contained"
                        sx={{ borderRadius: 3, minWidth: "auto", px: 3 }}
                        onClick={handleAssistantSubmit}
                        disabled={
                          diagram.status === "GENERATING" ||
                          isImproving ||
                          !assistantInstruction.trim()
                        }
                        startIcon={
                          diagram.status === "GENERATING" || isImproving ? (
                            <CircularProgress size={16} color="inherit" />
                          ) : (
                            <AutoAwesomeIcon />
                          )
                        }
                      >
                        {diagram.status === "GENERATING" || isImproving ? "Working..." : "Enhance"}
                      </Button>
                    ),
                  }}
                />
              </Box>

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
