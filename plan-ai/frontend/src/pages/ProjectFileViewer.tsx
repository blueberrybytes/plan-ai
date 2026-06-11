import React from "react";
import { Box, Typography, CircularProgress, Alert, IconButton, Tooltip } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useNavigate, useParams } from "react-router-dom";
import { useGetProjectQuery } from "../store/apis/projectApi";
import { useGetContextQuery } from "../store/apis/contextApi";
import { useTranslation } from "react-i18next";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useSelector } from "react-redux";
import { RootState } from "../store/store";
import MarkdownRenderer from "../components/common/MarkdownRenderer";
import CsvRenderer from "../components/common/CsvRenderer";

const ProjectFileViewer: React.FC = () => {
  const { projectId, fileId } = useParams<{ projectId: string; fileId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const token = useSelector((state: RootState) => state.auth.user?.token);
  const activeWorkspaceId = useSelector((state: RootState) => state.app.activeWorkspaceId);

  // First get the project to find the contextId
  const {
    data: projectData,
    isLoading: isProjectLoading,
    error: projectError,
  } = useGetProjectQuery(projectId ?? "", {
    skip: !projectId,
  });
  const project = projectData?.data ?? null;
  const contextId = project?.contextId;

  // Then get the context details to find the specific file
  const {
    data: contextData,
    isLoading: isContextLoading,
    error: contextError,
  } = useGetContextQuery(contextId ?? "", {
    skip: !contextId,
  });

  const context = contextData?.data ?? null;
  const file = context?.files.find((f) => f.id === fileId);

  const [textContent, setTextContent] = React.useState<string | null>(null);
  const [isFetchingText, setIsFetchingText] = React.useState(false);

  React.useEffect(() => {
    if (!file) return;

    const isTextBase =
      file.mimeType.startsWith("text/") ||
      file.mimeType === "application/json" ||
      file.mimeType.includes("xml") ||
      file.mimeType.includes("csv") ||
      file.mimeType.includes("markdown") ||
      file.mimeType.includes("spreadsheetml") ||
      file.mimeType.includes("ms-excel");

    if (isTextBase && contextId && file.id && token && activeWorkspaceId) {
      setIsFetchingText(true);
      const baseUrl = (process.env.REACT_APP_API_BACKEND_URL || "").replace(/\/+$/, "");
      fetch(`${baseUrl}/api/contexts/${contextId}/files/${file.id}/content`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-workspace-id": activeWorkspaceId,
        },
      })
        .then((res) => {
          if (!res.ok) throw new Error("Network response was not ok");
          return res.text();
        })
        .then((text) => {
          try {
            // Un-escape double-encoded JSON strings (e.g. from file uploads)
            const parsed = JSON.parse(text);
            if (typeof parsed === "string") {
              setTextContent(parsed);
              return;
            }
          } catch (e) {
            // Ignore parse errors, it's just raw text
          }
          setTextContent(text);
        })
        .catch((err) => console.error("Failed to load text content:", err))
        .finally(() => setIsFetchingText(false));
    }
  }, [file, contextId, token, activeWorkspaceId]);

  const renderContent = () => {
    if (!file)
      return (
        <Alert severity="warning">{t("contexts.messages.fileNotFound", "File not found.")}</Alert>
      );

    const { mimeType, publicUrl } = file;

    // 1. Text, JSON, XML, CSV
    if (
      mimeType.startsWith("text/") ||
      mimeType === "application/json" ||
      mimeType.includes("xml") ||
      mimeType.includes("csv") ||
      mimeType.includes("markdown") ||
      mimeType.includes("spreadsheetml") ||
      mimeType.includes("ms-excel")
    ) {
      if (isFetchingText) {
        return (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 10 }}>
            <CircularProgress />
          </Box>
        );
      }

      let language = "text";
      if (mimeType === "application/json") language = "json";
      if (mimeType.includes("xml")) language = "xml";
      if (mimeType === "text/csv" || mimeType.includes("csv")) language = "csv";
      if (mimeType.includes("markdown")) language = "markdown";

      if (language === "csv") {
        return (
          <Box sx={{ height: "100%", width: "100%", overflow: "hidden" }}>
            <CsvRenderer content={textContent || ""} />
          </Box>
        );
      }

      if (language === "markdown") {
        return (
          <Box
            sx={{
              p: 2,
              bgcolor: "background.paper",
              borderRadius: 2,
              overflowX: "auto",
              height: "100%",
            }}
          >
            <MarkdownRenderer content={textContent || "No text content"} />
          </Box>
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Component = SyntaxHighlighter as any;

      return (
        <Box sx={{ p: 2, bgcolor: "#1e1e1e", borderRadius: 2, overflowX: "auto", height: "100%" }}>
          <Component
            language={language}
            style={vscDarkPlus}
            customStyle={{ margin: 0, background: "transparent" }}
            wrapLines={true}
            wrapLongLines={true}
          >
            {textContent || "No text content"}
          </Component>
        </Box>
      );
    }

    // 2. PDF
    if (mimeType === "application/pdf") {
      return (
        <Box sx={{ width: "100%", height: "100%", borderRadius: 2, overflow: "hidden" }}>
          <iframe
            src={publicUrl}
            title={file.fileName}
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        </Box>
      );
    }

    if (
      mimeType.includes("document") ||
      mimeType.includes("msword") ||
      mimeType.includes("officedocument") ||
      mimeType.includes("presentation") ||
      mimeType.includes("powerpoint")
    ) {
      const googleDocsUrl = `https://docs.google.com/gview?url=${encodeURIComponent(publicUrl)}&embedded=true`;
      return (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: "white",
          }}
        >
          <iframe
            src={googleDocsUrl}
            title={file.fileName}
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        </Box>
      );
    }

    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="h6" gutterBottom>
          Preview not available for this format
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {mimeType}
        </Typography>
      </Box>
    );
  };

  const isLoadingTotal = isProjectLoading || isContextLoading;
  const isErrorTotal = projectError || contextError;

  return (
    <SidebarLayout fullHeight>
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {/* Header Ribbon */}
        <Box
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Tooltip title="Back to Project">
              <IconButton onClick={() => navigate(`/projects/${projectId}`)}>
                <ArrowBackIcon />
              </IconButton>
            </Tooltip>
            <Box>
              <Typography variant="h6" fontWeight={700} noWrap>
                {file?.fileName || "File Viewer"}
              </Typography>
              {file && (
                <Typography variant="caption" color="text.secondary">
                  {file.mimeType} • {(file.sizeBytes / 1024).toFixed(2)} KB
                </Typography>
              )}
            </Box>
          </Box>
          {file && (
            <Tooltip title="Open Original File">
              <IconButton
                component="a"
                href={file.publicUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <OpenInNewIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Viewer Canvas */}
        <Box sx={{ flex: 1, overflowY: "auto", bgcolor: "background.default", p: 4 }}>
          {isLoadingTotal ? (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 10 }}>
              <CircularProgress />
            </Box>
          ) : isErrorTotal || !project || !context ? (
            <Alert severity="error">
              {t(
                "projectDetails.messages.fileViewerError",
                "Failed to load project context or file.",
              )}
            </Alert>
          ) : (
            renderContent()
          )}
        </Box>
      </Box>
    </SidebarLayout>
  );
};

export default ProjectFileViewer;
