import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Chip,
  Tooltip,
  CircularProgress,
  IconButton,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Select,
  ListSubheader,
  FormControl,
  InputLabel,
  SelectChangeEvent,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Language as LanguageIcon,
  Download as DownloadIcon,
  Check as CheckIcon,
  Autorenew as AutorenewIcon,
  PictureAsPdf as PdfIcon,
  Description as DocxIcon,
  Code as MdIcon,
} from "@mui/icons-material";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MarkdownRenderer from "../components/common/MarkdownRenderer";
import jsPDF from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useGetDocQuery, useUpdateDocMutation } from "../store/apis/docApi";
import type { DocDocumentResponse } from "../store/apis/docApi";
import { useGetDocThemesQuery, useCreateDocThemeMutation } from "../store/apis/docThemeApi";
import { DOC_THEME_PRESETS } from "../constants/docThemePresets";

const AUTOSAVE_DELAY = 800;

const DocView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);

  const [pollingInterval, setPollingInterval] = useState<number | undefined>(undefined);
  const {
    data: doc,
    isLoading,
    refetch,
  } = useGetDocQuery(id ?? "", {
    pollingInterval,
    skip: !id,
  });
  const [updateDoc, { isLoading: isSaving }] = useUpdateDocMutation();

  const { data: themes = [] } = useGetDocThemesQuery();
  const [createTheme, { isLoading: isCreatingTheme }] = useCreateDocThemeMutation();

  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [saved, setSaved] = useState(false);

  // Start polling when status is GENERATING
  useEffect(() => {
    if (doc?.status === "GENERATING") {
      setPollingInterval(3000);
    } else {
      setPollingInterval(undefined);
    }
  }, [doc?.status]);

  const handleThemeChange = async (event: SelectChangeEvent<string>) => {
    const selectedValue = event.target.value as string;
    if (!id) return;

    // Check if it's an existing theme ID
    const existingTheme = themes.find((t) => t.id === selectedValue);
    if (existingTheme) {
      await updateDoc({ id, data: { themeId: existingTheme.id } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return;
    }

    // Otherwise, it might be a preset name
    const preset = DOC_THEME_PRESETS.find((p) => p.name === selectedValue);
    if (preset) {
      const userTheme = themes.find((t) => t.name === preset.name);
      if (userTheme) {
        await updateDoc({ id, data: { themeId: userTheme.id } });
      } else {
        const newTheme = await createTheme(preset).unwrap();
        await updateDoc({ id, data: { themeId: newTheme.id } });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  useEffect(() => {
    if (doc && !isEditMode) {
      setContent(doc.content ?? "");
      setTitle(doc.title ?? "");
    }
  }, [doc?.id, doc?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(
    async (newContent: string, newTitle: string) => {
      if (!id) return;
      await updateDoc({ id, data: { content: newContent, title: newTitle } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    [id, updateDoc],
  );

  useEffect(() => {
    if (!doc || !isEditMode) return;
    const timer = setTimeout(() => save(content, title), AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [content, title, isEditMode, save, doc]);

  const handleOpenPublicLink = async () => {
    if (!id) return;
    // Open the tab immediately to avoid popup blockers (must happen in sync user-gesture context)
    const win = window.open("", "_blank");
    if (!doc?.isPublic) {
      await updateDoc({ id, data: { isPublic: true } });
    }
    if (win) win.location.href = `/doc/public/${id}`;
  };

  const handleExportPdf = async () => {
    setExportAnchor(null);
    if (!doc) return;
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    pdf.setFont("helvetica");
    pdf.setFontSize(22);
    pdf.text(title, 40, 60);
    pdf.setFontSize(11);
    const lines = pdf.splitTextToSize(content.replace(/[#*`]/g, ""), 515);
    pdf.text(lines, 40, 90);
    pdf.save(`${title}.pdf`);
  };

  const handleExportMarkdown = () => {
    setExportAnchor(null);
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDocx = async () => {
    setExportAnchor(null);
    if (!doc) return;
    // Parse markdown lines into DOCX paragraphs
    const lines = content.split("\n");
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
      sections: [
        { children: [new Paragraph({ text: title, heading: HeadingLevel.TITLE }), ...children] },
      ],
    });
    const buffer = await Packer.toBlob(docxDoc);
    const url = URL.createObjectURL(buffer);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const theme = (
    doc as (DocDocumentResponse & { theme?: Record<string, string> | null }) | undefined
  )?.theme;

  const themeStyle = theme
    ? ({
        "--doc-primary": theme.primaryColor,
        "--doc-accent": theme.accentColor,
        "--doc-bg": theme.backgroundColor,
        "--doc-text": theme.textColor,
      } as React.CSSProperties)
    : {};

  if (isLoading)
    return (
      <SidebarLayout>
        <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
          <CircularProgress />
        </Box>
      </SidebarLayout>
    );

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 900, mx: "auto" }}>
        {/* Toolbar */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3, flexWrap: "wrap" }}>
          <IconButton onClick={() => navigate("/docs")}>
            <ArrowBackIcon />
          </IconButton>
          {doc?.status === "GENERATING" && (
            <Chip
              icon={<AutorenewIcon />}
              label={t("docs.view.generating")}
              color="warning"
              size="small"
              onClick={() => refetch()}
            />
          )}
          <Box sx={{ flexGrow: 1 }} />

          <FormControl size="small" sx={{ minWidth: 150, m: 0 }}>
            <InputLabel>{t("docs.view.themeSelect.label")}</InputLabel>
            <Select
              value={doc?.themeId || ""}
              label={t("docs.view.themeSelect.label")}
              onChange={handleThemeChange}
              disabled={isSaving || isCreatingTheme}
            >
              <ListSubheader>{t("docs.view.themeSelect.myThemes")}</ListSubheader>
              {themes.length === 0 ? (
                <MenuItem disabled value="none">
                  <em>{t("docThemes.empty")}</em>
                </MenuItem>
              ) : (
                themes.map((theme) => (
                  <MenuItem key={theme.id} value={theme.id}>
                    {theme.name}
                  </MenuItem>
                ))
              )}
              <ListSubheader>{t("docs.view.themeSelect.defaultThemes")}</ListSubheader>
              {DOC_THEME_PRESETS.map((preset) => (
                <MenuItem key={`preset-${preset.name}`} value={preset.name}>
                  {preset.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {isSaving && <CircularProgress size={16} />}
          {saved && (
            <Chip icon={<CheckIcon />} label={t("docs.view.saved")} color="success" size="small" />
          )}
          <Button
            variant={isEditMode ? "contained" : "outlined"}
            size="small"
            onClick={() => setIsEditMode((m) => !m)}
          >
            {isEditMode ? t("docs.view.previewMode") : t("docs.view.editMode")}
          </Button>
          <Tooltip title={t("docs.view.publicUrl")}>
            <IconButton onClick={handleOpenPublicLink}>
              <LanguageIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("docs.view.export")}>
            <IconButton onClick={(e) => setExportAnchor(e.currentTarget)}>
              <DownloadIcon />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={exportAnchor}
            open={Boolean(exportAnchor)}
            onClose={() => setExportAnchor(null)}
          >
            <MenuItem onClick={handleExportPdf}>
              <ListItemIcon>
                <PdfIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{t("docs.view.exportPdf")}</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleExportMarkdown}>
              <ListItemIcon>
                <MdIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{t("docs.view.exportMarkdown")}</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleExportDocx}>
              <ListItemIcon>
                <DocxIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{t("docs.view.exportGdoc")}</ListItemText>
            </MenuItem>
          </Menu>
        </Box>

        {/* Title */}
        {isEditMode ? (
          <TextField
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            variant="standard"
            fullWidth
            inputProps={{ style: { fontSize: 28, fontWeight: 700 } }}
            sx={{ mb: 2 }}
          />
        ) : (
          <Typography variant="h3" fontWeight={700} sx={{ mb: 2 }}>
            {title}
          </Typography>
        )}

        <Divider sx={{ mb: 3 }} />

        {/* Content */}
        <Box style={themeStyle}>
          {isEditMode ? (
            <TextField
              value={content}
              onChange={(e) => setContent(e.target.value)}
              multiline
              fullWidth
              minRows={20}
              variant="outlined"
            />
          ) : (
            <Box
              sx={{
                "& h1, & h2, & h3": {
                  fontFamily: theme?.headingFont,
                  color: theme?.primaryColor ?? "inherit",
                },
                "& a": { color: theme?.accentColor ?? "primary.main" },
                "& strong": { color: theme?.primaryColor ?? "inherit" },
                "& table": { borderCollapse: "collapse", width: "100%" },
                "& td, & th": { border: "1px solid", borderColor: "divider", p: 1 },
                "& blockquote": {
                  borderLeft: `4px solid ${theme?.accentColor ?? "#4361EE"}`,
                  pl: 2,
                  opacity: 0.85,
                },
              }}
            >
              <MarkdownRenderer content={content} theme={theme} sx={{ p: 0 }} />
            </Box>
          )}
        </Box>
      </Box>
    </SidebarLayout>
  );
};

export default DocView;
