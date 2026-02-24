import React from "react";
import { Box, Typography, Divider, CircularProgress, Paper } from "@mui/material";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useGetPublicDocQuery } from "../store/apis/docApi";

const PublicDocView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { data: doc, isLoading, isError } = useGetPublicDocQuery(id ?? "");

  if (isLoading)
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 10 }}>
        <CircularProgress />
      </Box>
    );

  if (isError || !doc)
    return (
      <Box sx={{ textAlign: "center", mt: 10 }}>
        <Typography variant="h5" color="text.secondary">
          {t("docs.view.notFound")}
        </Typography>
      </Box>
    );

  const theme = doc.theme;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: theme?.backgroundColor ?? "#fff" }}>
      {/* Header bar */}
      <Box
        sx={{
          py: 3,
          px: 4,
          background: theme
            ? `linear-gradient(90deg, ${theme.primaryColor}, ${theme.accentColor})`
            : "primary.main",
        }}
      >
        <Typography variant="h4" fontWeight={700} sx={{ color: "#fff" }}>
          {doc.title}
        </Typography>
        {theme && (
          <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.7)", mt: 0.5 }}>
            Style: {theme.name}
          </Typography>
        )}
      </Box>

      <Box sx={{ maxWidth: 860, mx: "auto", px: { xs: 2, md: 4 }, py: 5 }}>
        <Paper elevation={0} sx={{ p: { xs: 2, md: 4 }, bgcolor: "transparent" }}>
          <Box
            sx={{
              color: theme?.textColor ?? "#0f172a",
              fontFamily: theme?.bodyFont ?? "inherit",
              "& h1, & h2, & h3": {
                fontFamily: theme?.headingFont ?? "inherit",
                color: theme?.primaryColor ?? "inherit",
              },
              "& a": { color: theme?.accentColor ?? "#4361EE" },
              "& strong": { color: theme?.primaryColor ?? "inherit" },
              "& blockquote": {
                borderLeft: `4px solid ${theme?.accentColor ?? "#4361EE"}`,
                pl: 2,
                opacity: 0.85,
                my: 2,
              },
              "& table": { borderCollapse: "collapse", width: "100%" },
              "& td, & th": { border: "1px solid #ddd", p: "8px 12px" },
              "& code": {
                bgcolor: "rgba(0,0,0,0.06)",
                px: 0.5,
                borderRadius: 1,
                fontFamily: "monospace",
              },
            }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>
          </Box>
        </Paper>

        <Divider sx={{ my: 4 }} />
        <Typography variant="caption" color="text.disabled">
          {t("docs.view.sharedVia")} · {new Date(doc.updatedAt).toLocaleDateString()}
        </Typography>
      </Box>
    </Box>
  );
};

export default PublicDocView;
