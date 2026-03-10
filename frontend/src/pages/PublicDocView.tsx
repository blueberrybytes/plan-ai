import React from "react";
import {
  Box,
  Typography,
  Divider,
  CircularProgress,
  Paper,
  Button,
  Menu,
  MenuItem,
} from "@mui/material";
import { Download as DownloadIcon } from "@mui/icons-material";
import { Helmet } from "react-helmet-async";
import jsPDF from "jspdf";
import { toPng } from "html-to-image";
import { Document, Paragraph, TextRun, HeadingLevel, Packer } from "docx";
import { saveAs } from "file-saver";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MarkdownRenderer from "../components/common/MarkdownRenderer";
import { useGetPublicDocQuery } from "../store/apis/docApi";

const PublicDocView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const {
    data: doc,
    isLoading,
    isError,
  } = useGetPublicDocQuery(id ?? "", {
    refetchOnMountOrArgChange: true,
  });
  const [exportAnchor, setExportAnchor] = React.useState<null | HTMLElement>(null);

  const handleExportPdf = async () => {
    setExportAnchor(null);
    if (!doc) return;

    const element = document.getElementById("pdf-content");
    if (!element) return;

    try {
      const dataUrl = await toPng(element, {
        quality: 1.0,
        backgroundColor: doc.theme?.backgroundColor || "#ffffff",
        style: {
          padding: "40px",
          margin: "0",
        },
      });

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const imgProps = pdf.getImageProperties(dataUrl);
      const imgWidth = pdfWidth;
      const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

      let heightLeft = imgHeight;
      let position = 0;

      // Add first page
      pdf.addImage(dataUrl, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      // Add subsequent pages if content overflows
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(dataUrl, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`${doc.title}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF", err);
      // Fallback
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      pdf.setFont("helvetica");
      pdf.setFontSize(22);
      pdf.text(doc.title, 40, 60);
      pdf.setFontSize(11);
      const lines = pdf.splitTextToSize((doc.content || "").replace(/[#*`]/g, ""), 515);
      pdf.text(lines, 40, 90);
      pdf.save(`${doc.title}.pdf`);
    }
  };

  const handleExportMarkdown = () => {
    setExportAnchor(null);
    if (!doc) return;
    const blob = new Blob([doc.content || ""], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.title}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDocx = async () => {
    setExportAnchor(null);
    if (!doc) return;
    const lines = (doc.content || "").split("\n");
    const children: Paragraph[] = lines.map((line) => {
      if (line.startsWith("### "))
        return new Paragraph({ text: line.replace(/^### /, ""), heading: HeadingLevel.HEADING_3 });
      if (line.startsWith("## "))
        return new Paragraph({ text: line.replace(/^## /, ""), heading: HeadingLevel.HEADING_2 });
      if (line.startsWith("# "))
        return new Paragraph({ text: line.replace(/^# /, ""), heading: HeadingLevel.HEADING_1 });
      return new Paragraph({
        children: [new TextRun(line.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1"))],
      });
    });
    const docxDoc = new Document({
      sections: [{ properties: {}, children }],
    });
    const blob = await Packer.toBlob(docxDoc);
    saveAs(blob, `${doc.title}.docx`);
  };

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
      <Helmet>
        <title>{`${doc.title} | Plan AI`}</title>
        <meta name="description" content={`View document: ${doc.title}`} />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="article" />
        <meta property="og:url" content={window.location.href} />
        <meta property="og:title" content={`${doc.title} | Plan AI`} />
        <meta property="og:description" content={`Read document: ${doc.title}`} />
        <meta
          property="og:image"
          content="https://plan-ai.blueberrybytes.com/logos/android-chrome-512x512.png"
        />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={window.location.href} />
        <meta name="twitter:title" content={`${doc.title} | Plan AI`} />
        <meta name="twitter:description" content={`Read document: ${doc.title}`} />
        <meta
          name="twitter:image"
          content="https://plan-ai.blueberrybytes.com/logos/android-chrome-512x512.png"
        />
      </Helmet>
      {/* Header bar */}
      <Box
        sx={{
          py: 3,
          px: 4,
          background: theme
            ? `linear-gradient(90deg, ${theme.primaryColor}, ${theme.accentColor})`
            : "primary.main",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight={700} sx={{ color: "#fff" }}>
            {doc.title}
          </Typography>
        </Box>
        <Box>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<DownloadIcon />}
            onClick={(e) => setExportAnchor(e.currentTarget)}
            sx={{ textTransform: "none", mr: 2 }}
          >
            {t("docs.view.export")}
          </Button>
          <Menu
            anchorEl={exportAnchor}
            open={Boolean(exportAnchor)}
            onClose={() => setExportAnchor(null)}
          >
            <MenuItem onClick={handleExportPdf}>{t("docs.view.exportPdf")}</MenuItem>
            <MenuItem onClick={handleExportMarkdown}>{t("docs.view.exportMarkdown")}</MenuItem>
            <MenuItem onClick={handleExportDocx}>{t("docs.view.exportGdoc")}</MenuItem>
          </Menu>
        </Box>
      </Box>

      <Box id="pdf-content" sx={{ maxWidth: 860, mx: "auto", px: { xs: 2, md: 4 }, py: 5 }}>
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
            <MarkdownRenderer content={doc.content} theme={theme} sx={{ p: 0 }} />
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
