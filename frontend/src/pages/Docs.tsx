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
} from "@mui/material";
import {
  Add as AddIcon,
  Palette as PaletteIcon,
  Article as ArticleIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  Language as LanguageIcon,
  AutoAwesome as AutoAwesomeIcon,
  Schedule as ScheduleIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import {
  useGetDocsQuery,
  useDeleteDocMutation,
  type DocDocumentResponse,
} from "../store/apis/docApi";

const statusColor = (status: string) => {
  if (status === "GENERATING") return "warning";
  if (status === "DRAFT") return "default";
  return "success";
};

const Docs: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: docs = [], isLoading } = useGetDocsQuery();
  const [deleteDoc] = useDeleteDocMutation();

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(t("docs.deleteConfirm"))) {
      await deleteDoc(id);
    }
  };

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: "auto" }}>
        {/* Header */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4 }}>
          <Typography variant="h4" fontWeight={700}>
            {t("docs.title")}
          </Typography>
        </Box>

        {/* Action Buttons */}
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 5 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            size="large"
            onClick={() => navigate("/docs/create")}
          >
            {t("docs.actions.create")}
          </Button>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            size="large"
            onClick={() => navigate("/docs/themes/create")}
          >
            {t("docs.actions.createTheme")}
          </Button>
          <Button
            variant="outlined"
            startIcon={<PaletteIcon />}
            size="large"
            onClick={() => navigate("/docs/themes")}
          >
            {t("docs.actions.viewThemes")}
          </Button>
        </Box>

        {/* Documents List */}
        <Typography variant="h5" fontWeight={600} sx={{ mb: 2 }}>
          {t("docs.listTitle")}
        </Typography>

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
        ) : docs.length === 0 ? (
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
              <ArticleIcon sx={{ fontSize: 40, color: "primary.main" }} />
            </Box>
            <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
              {t("docs.empty.title")}
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ mb: 4, maxWidth: 440, textAlign: "center" }}
            >
              {t("docs.empty.description")}
            </Typography>
            <Button
              variant="contained"
              size="large"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => navigate("/docs/create")}
            >
              {t("docs.empty.cta")}
            </Button>
          </Box>
        ) : (
          <Grid container spacing={2}>
            {docs.map((doc: DocDocumentResponse) => (
              <Grid item xs={12} sm={6} md={4} key={doc.id}>
                <Card
                  variant="outlined"
                  sx={{ cursor: "pointer", "&:hover": { borderColor: "primary.main" } }}
                  onClick={() => navigate(`/docs/view/${doc.id}`)}
                >
                  {/* Theme color bar */}
                  {doc.theme && (
                    <Box
                      sx={{
                        height: 6,
                        background: `linear-gradient(90deg, ${doc.theme.primaryColor}, ${doc.theme.accentColor})`,
                      }}
                    />
                  )}
                  <CardContent>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                      <ArticleIcon color="primary" fontSize="small" />
                      <Typography variant="h6" fontWeight={600} noWrap>
                        {doc.title}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", gap: 1, mb: 1.5, alignItems: "center" }}>
                      <Chip
                        label={doc.status}
                        size="small"
                        color={statusColor(doc.status) as "warning" | "default" | "success"}
                        icon={doc.status === "GENERATING" ? <ScheduleIcon /> : undefined}
                      />
                      {doc.theme && <Chip label={doc.theme.name} size="small" variant="outlined" />}
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {new Date(doc.updatedAt).toLocaleDateString()}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ opacity: 0.7 }}>
                      {doc.content.slice(0, 80).replace(/[#*`]/g, "")}…
                    </Typography>
                  </CardContent>
                  <Box sx={{ display: "flex", justifyContent: "flex-end", px: 1, pb: 1, gap: 0.5 }}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/docs/view/${doc.id}`);
                      }}
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      title="Public Link"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`/doc/public/${doc.id}`, "_blank");
                      }}
                    >
                      <LanguageIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={(e) => handleDelete(doc.id, e)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
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

export default Docs;
