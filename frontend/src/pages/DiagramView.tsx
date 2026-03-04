import React, { useState, useEffect } from "react";
import {
  Menu,
  ListItemIcon,
  ListItemText,
  Tabs,
  Tab,
  Paper,
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
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  Code as CodeIcon,
  AutoAwesome as AutoAwesomeIcon,
  Download as DownloadIcon,
  Image as ImageIcon,
  DataObject as DataObjectIcon,
  ViewSidebar as ViewSidebarIcon,
  SmartToy as SmartToyIcon,
  Person as PersonIcon,
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

  const {
    data: diagram,
    isLoading,
    refetch,
  } = useGetDiagramQuery(diagramId || "", {
    skip: !diagramId,
    pollingInterval: 2000, // Poll consistently to catch updates
    skipPollingIfUnfocused: false, // Ensures polling continues even if DevTools is focused
  });

  const [updateDiagram, { isLoading: isUpdating }] = useUpdateDiagramMutation();

  const [code, setCode] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [theme, setTheme] = useState<string>("BlueBerryBytes");
  const [isModified, setIsModified] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState(0);

  const [improveDiagram, { isLoading: isImproving }] = useImproveDiagramMutation();
  const [assistantInstruction, setAssistantInstruction] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: "assistant" | "user"; text: string }[]>(
    () => {
      if (diagramId) {
        const saved = sessionStorage.getItem(`diagram-chat-${diagramId}`);
        if (saved) return JSON.parse(saved);
      }
      return [{ role: "assistant", text: "Hi! How can I help you improve this diagram?" }];
    },
  );

  // Guarantee polling happens when GENERATING since RTK Query focus rules can be strict
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (diagram?.status === "GENERATING") {
      console.log("[DiagramView] Diagram is GENERATING, starting manual 1.5s interval refetch...");
      interval = setInterval(() => {
        refetch();
      }, 1500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [diagram?.status, refetch]);

  const [downloadAnchorEl, setDownloadAnchorEl] = useState<null | HTMLElement>(null);

  console.log("[DiagramView] Current RTK Diagram state:", {
    status: diagram?.status,
    codeLength: diagram?.mermaidCode?.length,
    isModified,
  });

  // Sync state with fetching
  useEffect(() => {
    if (diagram) {
      console.log(
        "[DiagramView] useEffect triggered with diagram.status:",
        diagram.status,
        "isModified:",
        isModified,
      );
      if (!isModified) {
        console.log("[DiagramView] Overwriting local editor state with polled diagram data.");
        setCode(diagram.mermaidCode || "");
        setTitle(diagram.title || "");
        setTheme(diagram.theme || "BlueBerryBytes");
      } else {
        console.log(
          "[DiagramView] Skipped overwriting local editor state because isModified is true.",
        );
      }
    }
  }, [diagram, isModified]);

  // Handle chat responses when generation finishes
  useEffect(() => {
    if (!diagramId || !diagram) return;

    // Only act if the current status is DRAFT (finished) and the last message is from the user
    // which signifies they just asked a question and it was completed.
    if (diagram.status === "DRAFT" && chatMessages.length > 0) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      if (lastMsg.role === "user") {
        const successMessages = [
          ...chatMessages,
          { role: "assistant" as const, text: "I have updated the diagram based on your request." },
        ];
        setChatMessages(successMessages);
        sessionStorage.setItem(`diagram-chat-${diagramId}`, JSON.stringify(successMessages));
      }
    }
  }, [diagram, diagramId, chatMessages]);

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

    const userMsg = assistantInstruction;
    setAssistantInstruction("");

    const newMessages = [...chatMessages, { role: "user" as const, text: userMsg }];
    setChatMessages(newMessages);
    sessionStorage.setItem(`diagram-chat-${diagramId}`, JSON.stringify(newMessages));

    // Crucial: reset isModified so polling updates from the backend can overwrite the editor code
    setIsModified(false);

    try {
      await improveDiagram({
        id: diagramId,
        body: { instruction: userMsg },
      }).unwrap();
      refetch();
      // We don't append the success message here anymore. We wait for the status to switch back to DRAFT.
    } catch (err) {
      console.error("Assistant error:", err);
      const errorMessages = [
        ...newMessages,
        {
          role: "assistant" as const,
          text: "Sorry, I encountered an error while trying to update the diagram.",
        },
      ];
      setChatMessages(errorMessages);
      sessionStorage.setItem(`diagram-chat-${diagramId}`, JSON.stringify(errorMessages));
    }
  };

  const handleDownloadPNG = async () => {
    setDownloadAnchorEl(null);
    const node = document.querySelector(".mermaid-container svg") as HTMLElement;
    if (!node) return;
    try {
      // Scale up the PNG resolution 3x so it doesn't look tiny
      const scale = 3;
      const dataUrl = await toPng(node, {
        backgroundColor: "#ffffff",
        height: node.scrollHeight * scale,
        width: node.scrollWidth * scale,
        style: {
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: `${node.scrollWidth}px`,
          height: `${node.scrollHeight}px`,
        },
      });
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
    const originalSvgNode = document.querySelector(
      ".mermaid-container svg",
    ) as SVGSVGElement | null;
    if (!originalSvgNode) return;

    // Clone the SVG node to dramatically alter it for standalone export
    const svgNode = originalSvgNode.cloneNode(true) as SVGSVGElement;

    // Force a white background on the root node
    svgNode.style.backgroundColor = "#ffffff";

    // Ensure the SVG has strict XML namespaces
    if (!svgNode.getAttribute("xmlns")) {
      svgNode.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }

    // Inject a hardcoded white background rect just in case the viewer ignores background-color CSS
    const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bgRect.setAttribute("width", "100%");
    bgRect.setAttribute("height", "100%");
    bgRect.setAttribute("fill", "#ffffff");
    svgNode.insertBefore(bgRect, svgNode.firstChild);

    const svgText = new XMLSerializer().serializeToString(svgNode);
    // Add the XML declaration manually
    const finalSvg = `<?xml version="1.0" standalone="no"?>\r\n${svgText}`;

    const blob = new Blob([finalSvg], { type: "image/svg+xml;charset=utf-8" });
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
              startIcon={<ViewSidebarIcon />}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              sx={{ ml: 2, textTransform: "none", fontWeight: 600 }}
            >
              Toggle Sidebar
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
          {/* Left panel: Code Editor or Chat */}
          {isSidebarOpen && (
            <Box
              sx={{
                width: "40%",
                minWidth: 350,
                borderRight: "1px solid",
                borderColor: "divider",
                display: "flex",
                flexDirection: "column",
                bgcolor: "background.paper",
              }}
            >
              <Tabs
                value={sidebarTab}
                onChange={(_, newValue) => setSidebarTab(newValue)}
                variant="fullWidth"
                sx={{ borderBottom: 1, borderColor: "divider" }}
              >
                <Tab label="Editor" icon={<CodeIcon fontSize="small" />} iconPosition="start" />
                <Tab
                  label="AI Assistant"
                  icon={<AutoAwesomeIcon fontSize="small" />}
                  iconPosition="start"
                />
              </Tabs>

              {sidebarTab === 0 && (
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
                      bgcolor: "rgba(0,0,0,0.02)",
                    },
                    "& .MuiInputBase-input": {
                      height: "100% !important",
                      overflowY: "auto !important",
                    },
                    "& fieldset": { border: "none" },
                  }}
                />
              )}

              {sidebarTab === 1 && (
                <Box sx={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                  <Box
                    sx={{
                      flex: 1,
                      overflowY: "auto",
                      p: 2,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    {chatMessages.map((msg, i) => (
                      <Box
                        key={i}
                        sx={{
                          display: "flex",
                          gap: 1,
                          flexDirection: msg.role === "user" ? "row-reverse" : "row",
                        }}
                      >
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            bgcolor: msg.role === "assistant" ? "primary.main" : "secondary.main",
                            color: "white",
                          }}
                        >
                          {msg.role === "assistant" ? (
                            <SmartToyIcon fontSize="small" />
                          ) : (
                            <PersonIcon fontSize="small" />
                          )}
                        </Box>
                        <Paper
                          elevation={0}
                          sx={{
                            p: 1.5,
                            maxWidth: "80%",
                            bgcolor: msg.role === "assistant" ? "background.default" : "primary.50",
                            color: msg.role === "assistant" ? "text.primary" : "primary.900",
                            borderRadius: 2,
                          }}
                        >
                          <Typography variant="body2">{msg.text}</Typography>
                        </Paper>
                      </Box>
                    ))}
                    {(diagram.status === "GENERATING" || isImproving) && (
                      <Box sx={{ display: "flex", gap: 1 }}>
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            bgcolor: "primary.main",
                            color: "white",
                          }}
                        >
                          <SmartToyIcon fontSize="small" />
                        </Box>
                        <Paper
                          elevation={0}
                          sx={{
                            p: 1.5,
                            bgcolor: "background.default",
                            borderRadius: 2,
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                          }}
                        >
                          <CircularProgress size={16} />
                          <Typography variant="body2" color="text.secondary">
                            Updating diagram...
                          </Typography>
                        </Paper>
                      </Box>
                    )}
                  </Box>
                  <Box sx={{ p: 2, borderTop: 1, borderColor: "divider" }}>
                    <TextField
                      fullWidth
                      placeholder="Ask AI to modify the diagram..."
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
                        sx: { borderRadius: 4, pr: 1 },
                        endAdornment: (
                          <Button
                            variant="contained"
                            sx={{ borderRadius: 3, minWidth: "auto", px: 2 }}
                            onClick={handleAssistantSubmit}
                            disabled={
                              diagram.status === "GENERATING" ||
                              isImproving ||
                              !assistantInstruction.trim()
                            }
                          >
                            Send
                          </Button>
                        ),
                      }}
                    />
                  </Box>
                </Box>
              )}
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
                color: "#000000",
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
