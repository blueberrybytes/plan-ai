import React from "react";
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  IconButton,
  Skeleton,
  Chip,
  type ChipProps,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  AccountTree as AccountTreeIcon,
  Language as LanguageIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import SidebarLayout from "../components/layout/SidebarLayout";
import PageHeader from "../components/layout/PageHeader";
import { detectMermaidType } from "../utils/mermaidUtils";
import {
  useGetUserDiagramsQuery,
  useDeleteDiagramMutation,
  useUpdateDiagramMutation,
  type DiagramResponse,
} from "../store/apis/diagramApi";

const getDiagramTypeColor = (type: string): ChipProps["color"] => {
  switch (type) {
    case "FLOWCHART":
      return "primary";
    case "SEQUENCE":
      return "secondary";
    case "GANTT":
      return "warning";
    case "MINDMAP":
      return "success";
    case "CLASS":
      return "info";
    case "ER":
      return "error";
    case "ARCHITECTURE":
      return "primary";
    case "XYCHART":
      return "secondary";
    default:
      return "default";
  }
};

const Diagrams: React.FC = () => {
  const navigate = useNavigate();
  const {
    data: response,
    isLoading,
    refetch,
    isFetching,
  } = useGetUserDiagramsQuery(undefined, { refetchOnFocus: true });
  const [deleteDiagram] = useDeleteDiagramMutation();
  const [updateDiagram] = useUpdateDiagramMutation();

  const diagrams = response?.diagrams || [];

  const handleOpenPublicLink = async (d: DiagramResponse, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!d.isPublic) {
      await updateDiagram({ id: d.id, body: { isPublic: true } });
    }
    window.open(`/diagram/public/${d.id}`, "_blank");
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this diagram?")) {
      await deleteDiagram({ id });
    }
  };

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 2, md: 4 } }}>
        <PageHeader
          title="Visual Architect"
          subtitle="Generate and construct detailed Mermaid diagrams using AI."
          icon={<AccountTreeIcon />}
          actions={
            <IconButton onClick={() => refetch()} disabled={isLoading || isFetching}>
              <RefreshIcon />
            </IconButton>
          }
        />

        {/* Action Buttons */}
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 5 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            size="large"
            onClick={() => navigate("/diagrams/create")}
          >
            Construct Diagram
          </Button>
          <Button
            variant="outlined"
            startIcon={<AccountTreeIcon />}
            size="large"
            onClick={() => navigate("/diagrams/types")}
          >
            View Diagram Types
          </Button>
        </Box>

        {diagrams.length > 0 && (
          <Typography variant="h5" fontWeight={600} sx={{ mb: 2 }}>
            Your Diagrams
          </Typography>
        )}

        {isLoading ? (
          <Grid container spacing={2}>
            {[1, 2, 3].map((i) => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Card variant="outlined">
                  <CardContent>
                    <Skeleton variant="text" width="60%" height={28} />
                    <Skeleton variant="text" width="40%" height={18} sx={{ mt: 1 }} />
                    <Skeleton variant="rectangular" height={60} sx={{ mt: 1, borderRadius: 1 }} />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        ) : diagrams.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              py: 10,
              border: "1px dashed",
              borderColor: "divider",
              borderRadius: 3,
              bgcolor: "rgba(255,255,255,0.02)",
            }}
          >
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, rgba(67,97,238,0.15) 0%, rgba(167,139,250,0.15) 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 3,
              }}
            >
              <AccountTreeIcon sx={{ fontSize: 40, color: "primary.main" }} />
            </Box>
            <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
              No diagrams found.
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ mb: 4, maxWidth: 440, textAlign: "center" }}
            >
              Generate your very first architecture sequence, entity-relationship map, or mindmap
              from your project transcripts!
            </Typography>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
              <Button
                variant="contained"
                size="large"
                startIcon={<AddIcon />}
                onClick={() => navigate("/diagrams/create")}
              >
                Construct Diagram
              </Button>
              <Button
                variant="outlined"
                size="large"
                startIcon={<AccountTreeIcon />}
                onClick={() => navigate("/diagrams/types")}
              >
                View Diagram Types
              </Button>
            </Box>
          </Box>
        ) : (
          <Grid container spacing={2}>
            {diagrams.map((d: DiagramResponse) => (
              <Grid item xs={12} sm={6} md={4} key={d.id}>
                <Card
                  variant="outlined"
                  sx={{ cursor: "pointer", "&:hover": { borderColor: "primary.main" } }}
                  onClick={() => navigate(`/diagrams/${d.id}`)}
                >
                  <CardContent>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        mb: 1,
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          flex: 1,
                          overflow: "hidden",
                        }}
                      >
                        <AccountTreeIcon color="primary" fontSize="small" sx={{ flexShrink: 0 }} />
                        <Typography variant="h6" fontWeight={600} noWrap>
                          {d.title}
                        </Typography>
                      </Box>
                      {(() => {
                        // Derive the tag from the actual Mermaid code so it stays
                        // correct after edits / AUTO diagrams; fall back to the
                        // stored type only when the code can't be classified.
                        const shownType = detectMermaidType(d.mermaidCode) ?? d.type;
                        return (
                          <Chip
                            label={shownType}
                            size="small"
                            color={getDiagramTypeColor(shownType)}
                            sx={{ height: 20, fontSize: "0.65rem", fontWeight: 700 }}
                          />
                        );
                      })()}
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {new Date(d.createdAt).toLocaleDateString()}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ opacity: 0.7 }}>
                      {d.prompt.slice(0, 80)}…
                    </Typography>
                  </CardContent>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      px: 2,
                      pb: 1,
                    }}
                  >
                    <Chip
                      label={d.status}
                      size="small"
                      variant="outlined"
                      color={
                        d.status === "GENERATING"
                          ? "warning"
                          : d.status === "FAILED"
                            ? "error"
                            : "default"
                      }
                      sx={{ height: 20, fontSize: "0.6rem" }}
                    />
                    <Box sx={{ display: "flex", gap: 0.5 }}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/diagrams/${d.id}`);
                        }}
                      >
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        title="Public Link"
                        onClick={(e) => handleOpenPublicLink(d, e)}
                      >
                        <LanguageIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={(e) => handleDelete(d.id, e)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </SidebarLayout>
  );
};

export default Diagrams;
