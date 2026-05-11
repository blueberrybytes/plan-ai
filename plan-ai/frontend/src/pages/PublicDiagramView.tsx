import React from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Paper,
  Button,
  Menu,
  MenuItem,
  useTheme,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { getContrastRatio } from "@mui/material/styles";
import {
  Download as DownloadIcon,
  Image as ImageIcon,
  DataObject as DataObjectIcon,
  Code as CodeIcon,
} from "@mui/icons-material";
import { Helmet } from "react-helmet-async";
import { toPng } from "html-to-image";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MermaidRenderer from "../components/common/MermaidRenderer";
import { useGetPublicDiagramQuery } from "../store/apis/diagramApi";

const PublicDiagramView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const muiTheme = useTheme();

  const {
    data: diagram,
    isLoading,
    isError,
  } = useGetPublicDiagramQuery(id ?? "", {
    refetchOnMountOrArgChange: true,
  });
  const [exportAnchor, setExportAnchor] = React.useState<null | HTMLElement>(null);

  const theme = diagram?.theme;

  const handleDownloadPNG = async () => {
    setExportAnchor(null);
    const node = document.querySelector(".mermaid-canvas svg") as HTMLElement;
    if (!node) return;
    try {
      const scale = 3;
      const rect = node.getBoundingClientRect();
      const dataUrl = await toPng(node, {
        backgroundColor: bg,
        height: rect.height * scale,
        width: rect.width * scale,
        style: {
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: `${rect.width}px`,
          height: `${rect.height}px`,
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
    setExportAnchor(null);
    const originalSvgNode = document.querySelector(".mermaid-canvas svg") as SVGSVGElement | null;
    if (!originalSvgNode) return;

    const svgNode = originalSvgNode.cloneNode(true) as SVGSVGElement;
    svgNode.style.backgroundColor = bg;
    if (!svgNode.getAttribute("xmlns")) {
      svgNode.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }

    const originalElements = originalSvgNode.querySelectorAll("*");
    const clonedElements = svgNode.querySelectorAll("*");

    for (let i = 0; i < originalElements.length; i++) {
      const originalEl = originalElements[i];
      const clonedEl = clonedElements[i] as HTMLElement;
      const computedStyle = window.getComputedStyle(originalEl);

      const stylesToInline = [
        "fill",
        "stroke",
        "stroke-width",
        "opacity",
        "font-family",
        "font-size",
        "color",
        "stroke-dasharray",
        "marker-end",
        "marker-start",
      ];
      for (const style of stylesToInline) {
        const val = computedStyle.getPropertyValue(style);
        if (val && val !== "none" && val !== "") {
          clonedEl.style.setProperty(style, val);
        }
      }
    }

    const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bgRect.setAttribute("width", "100%");
    bgRect.setAttribute("height", "100%");
    bgRect.setAttribute("fill", bg);
    svgNode.insertBefore(bgRect, svgNode.firstChild);

    const svgText = new XMLSerializer().serializeToString(svgNode);
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
    setExportAnchor(null);
    if (!diagram?.mermaidCode) return;
    const blob = new Blob([diagram.mermaidCode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${diagram?.title || "diagram"}.mermaid`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <Box
        sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (isError || !diagram) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <Typography variant="h5" color="error">
          {t("docs.view.notFound")}
        </Typography>
        <Typography color="text.secondary">
          The diagram either doesn&apos;t exist or hasn&apos;t been made public.
        </Typography>
      </Box>
    );
  }

  // --- Dynamic WCAG Contrast Theming Engine ---
  let bg = theme?.backgroundColor || muiTheme.palette.background.default;
  const rawText = theme?.textColor || muiTheme.palette.text.primary;

  if (getContrastRatio(rawText, bg) < 3) {
    bg =
      theme?.primaryColor && getContrastRatio(rawText, theme.primaryColor) >= 3
        ? theme.primaryColor
        : muiTheme.palette.background.default;
  }
  let text = rawText;
  if (getContrastRatio(text, bg) < 3) {
    text = muiTheme.palette.getContrastText(bg);
  }
  let headerColor = text;

  // Render
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: bg, display: "flex", flexDirection: "column" }}>
      <Helmet>
        <title>{diagram.title}</title>
        <meta name="description" content={`Shared diagram: ${diagram.title}`} />
      </Helmet>

      {/* Header bar */}
      <Box
        sx={{
          px: { xs: 2, md: 4 },
          py: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid",
          borderColor: `${text}20`,
        }}
      >
        <Box>
          <Typography
            variant="h6"
            sx={{
              color: headerColor,
              fontWeight: 700,
              fontFamily: theme?.headingFont ?? "inherit",
            }}
          >
            {diagram.title}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<DownloadIcon />}
            onClick={(e) => setExportAnchor(e.currentTarget)}
            sx={{ textTransform: "none" }}
          >
            {t("docs.view.export")}
          </Button>
          <Menu
            anchorEl={exportAnchor}
            open={Boolean(exportAnchor)}
            onClose={() => setExportAnchor(null)}
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
        </Box>
      </Box>

      {/* Main Content Area */}
      <Box sx={{ flex: 1, p: { xs: 2, md: 4 }, display: "flex" }}>
        <Paper
          elevation={3}
          sx={{
            p: 4,
            width: "100%",
            flex: 1,
            borderRadius: 3,
            bgcolor: theme?.backgroundColor || muiTheme.palette.background.paper,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box
            className="mermaid-container"
            sx={{ flex: 1, overflow: "auto", position: "relative" }}
          >
            <MermaidRenderer chart={diagram.mermaidCode || ""} theme={theme} />
          </Box>
        </Paper>
      </Box>

      {/* Footer Meta */}
      <Box sx={{ px: { xs: 2, md: 4 }, py: 2 }}>
        <Typography variant="caption" sx={{ color: `${text}80` }}>
          {t("docs.view.sharedVia")} · {new Date(diagram.updatedAt).toLocaleDateString()}
        </Typography>
      </Box>
    </Box>
  );
};

export default PublicDiagramView;
