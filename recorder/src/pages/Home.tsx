import React, { useEffect, useState, useCallback } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  Logout as LogoutIcon,
  Mic as MicIcon,
  DesktopWindows as DesktopIcon,
  Check as CheckIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { planAiApi, type Project, type Context } from "../services/planAiApi";
import type { DesktopSource } from "../types/electron";

type Persona = "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER";

export interface RecordingConfig {
  projectId: string;
  projectTitle: string;
  persona: Persona;
  selectedContextIds: string[];
  objective: string;
  systemSourceId: string | null;
}

// Stored in projectStorage so Recording page can read it
const CONFIG_KEY = "recorder-config";
export const saveConfig = (config: RecordingConfig) =>
  projectStorage.setItem(CONFIG_KEY, JSON.stringify(config));
export const loadConfig = (): RecordingConfig | null => {
  const raw = projectStorage.getItem(CONFIG_KEY);
  return raw ? (JSON.parse(raw) as RecordingConfig) : null;
};

const PERSONAS: { value: Persona; label: string; desc: string }[] = [
  { value: "SECRETARY", label: "Secretary", desc: "Extract only explicitly stated tasks." },
  { value: "ARCHITECT", label: "Architect", desc: "Technical decomposition." },
  { value: "PRODUCT_MANAGER", label: "Product Manager", desc: "User stories & roadmap." },
  { value: "DEVELOPER", label: "Developer", desc: "Coding & refactoring tasks." },
];

const Home: React.FC = () => {
  const { user, token, signOut } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [contexts, setContexts] = useState<Context[]>([]);
  const [desktopSources, setDesktopSources] = useState<DesktopSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected project
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Config state
  const [persona, setPersona] = useState<Persona>("SECRETARY");
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [objective, setObjective] = useState("");
  const [systemSourceId, setSystemSourceId] = useState<string | null>(null);

  // New project dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [projectList, contextList] = await Promise.all([
        planAiApi.listProjects(token),
        planAiApi.listContexts(token),
      ]);
      setProjects(projectList);
      setContexts(contextList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    // Load available desktop/app windows for system audio
    window.electron
      .getDesktopSources()
      .then(setDesktopSources)
      .catch(() => setDesktopSources([]));
  }, []);

  const handleStartRecording = () => {
    if (!selectedProject) return;
    const config: RecordingConfig = {
      projectId: selectedProject.id,
      projectTitle: selectedProject.title,
      persona,
      selectedContextIds,
      objective,
      systemSourceId,
    };
    saveConfig(config);
    navigate(`/recording/${selectedProject.id}`);
  };

  const handleCreateProject = async () => {
    if (!token || !newTitle.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const project = await planAiApi.createProject(token, {
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
      });
      setProjects((prev) => [project, ...prev]);
      setSelectedProject(project);
      setCreateOpen(false);
      setNewTitle("");
      setNewDesc("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Drag region / title bar */}
      <Box
        sx={{
          height: 28,
          WebkitAppRegion: "drag",
          bgcolor: "background.default",
          flexShrink: 0,
        }}
      />

      <Box
        sx={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* ── LEFT: Project list ────────────────────────────── */}
        <Box
          sx={{
            width: 260,
            flexShrink: 0,
            borderRight: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ px: 2, py: 1.5 }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                letterSpacing: 1,
                color: "text.secondary",
                textTransform: "uppercase",
              }}
            >
              Projects
            </Typography>
            <Tooltip title="New project">
              <IconButton size="small" onClick={() => setCreateOpen(true)}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>

          <Divider sx={{ opacity: 0.4 }} />

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : error ? (
            <Box sx={{ p: 2 }}>
              <Alert severity="error" sx={{ fontSize: "0.75rem" }}>
                {error}
              </Alert>
            </Box>
          ) : projects.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
              No projects yet. Create one to get started.
            </Typography>
          ) : (
            <List dense disablePadding sx={{ overflowY: "auto", flex: 1 }}>
              {projects.map((project) => (
                <ListItemButton
                  key={project.id}
                  selected={selectedProject?.id === project.id}
                  onClick={() => setSelectedProject(project)}
                  sx={{
                    px: 2,
                    py: 1,
                    "&.Mui-selected": {
                      bgcolor: "rgba(67,97,238,0.12)",
                    },
                  }}
                >
                  <ListItemText
                    primary={project.title}
                    primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: 500 }}
                    secondary={new Date(project.createdAt).toLocaleDateString()}
                    secondaryTypographyProps={{ fontSize: "0.7rem" }}
                  />
                  {selectedProject?.id === project.id && (
                    <CheckIcon sx={{ fontSize: 16, color: "primary.main" }} />
                  )}
                </ListItemButton>
              ))}
            </List>
          )}

          <Divider sx={{ opacity: 0.4 }} />

          {/* User info + Sign out */}
          <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.5 }}>
            <Avatar sx={{ width: 28, height: 28, bgcolor: "primary.dark", fontSize: "0.7rem" }}>
              {user?.email?.[0]?.toUpperCase()}
            </Avatar>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
              {user?.email}
            </Typography>
            <Tooltip title="Sign out">
              <IconButton size="small" onClick={() => void signOut()}>
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>

        {/* ── RIGHT: Recording config ───────────────────────── */}
        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            p: 3,
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          {!selectedProject ? (
            <Box
              sx={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Stack spacing={1} alignItems="center">
                <MicIcon sx={{ fontSize: 48, color: "text.secondary", opacity: 0.4 }} />
                <Typography color="text.secondary">
                  Select a project to configure recording
                </Typography>
              </Stack>
            </Box>
          ) : (
            <>
              <Box>
                <Typography variant="h6">{selectedProject.title}</Typography>
                {selectedProject.description && (
                  <Typography variant="body2" color="text.secondary">
                    {selectedProject.description}
                  </Typography>
                )}
              </Box>

              {/* Persona */}
              <FormControl size="small" fullWidth>
                <InputLabel>AI Persona</InputLabel>
                <Select
                  value={persona}
                  label="AI Persona"
                  onChange={(e) => setPersona(e.target.value as Persona)}
                >
                  {PERSONAS.map((p) => (
                    <MenuItem key={p.value} value={p.value}>
                      <Stack>
                        <Typography variant="body2" fontWeight={600}>
                          {p.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {p.desc}
                        </Typography>
                      </Stack>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Contexts */}
              {contexts.length > 0 && (
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mb: 1, display: "block" }}
                  >
                    Contexts (optional)
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                    {contexts.map((ctx) => {
                      const selected = selectedContextIds.includes(ctx.id);
                      return (
                        <Chip
                          key={ctx.id}
                          label={ctx.name}
                          size="small"
                          variant={selected ? "filled" : "outlined"}
                          color={selected ? "primary" : "default"}
                          onClick={() =>
                            setSelectedContextIds((prev) =>
                              selected ? prev.filter((id) => id !== ctx.id) : [...prev, ctx.id],
                            )
                          }
                        />
                      );
                    })}
                  </Box>
                </Box>
              )}

              {/* Objective */}
              <TextField
                label="Objective (optional)"
                placeholder="e.g. Extract 3 critical tasks from this architecture review..."
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                multiline
                minRows={2}
                size="small"
                fullWidth
              />

              {/* System audio source */}
              <FormControl size="small" fullWidth>
                <InputLabel>System audio source</InputLabel>
                <Select
                  value={systemSourceId ?? ""}
                  label="System audio source"
                  onChange={(e) => setSystemSourceId(e.target.value || null)}
                >
                  <MenuItem value="">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <MicIcon fontSize="small" />
                      <span>Microphone only</span>
                    </Stack>
                  </MenuItem>
                  {desktopSources.map((src) => (
                    <MenuItem key={src.id} value={src.id}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <DesktopIcon fontSize="small" />
                        <span>{src.name}</span>
                      </Stack>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box sx={{ flex: 1 }} />

              <Button
                variant="contained"
                size="large"
                startIcon={<MicIcon />}
                onClick={handleStartRecording}
                sx={{ py: 1.5, fontSize: "1rem" }}
              >
                Start Recording
              </Button>
            </>
          )}
        </Box>
      </Box>

      {/* Create project dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New project</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
              autoFocus
              size="small"
            />
            <TextField
              label="Description"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              multiline
              minRows={2}
              size="small"
            />
            {createError && <Alert severity="error">{createError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setCreateOpen(false)} variant="outlined">
            Cancel
          </Button>
          <Button
            onClick={() => void handleCreateProject()}
            variant="contained"
            disabled={creating || !newTitle.trim()}
          >
            {creating ? "Creating..." : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Home;
