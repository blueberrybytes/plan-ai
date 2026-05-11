/**
 * AdminPptxPreview
 *
 * Developer tool page to preview how all slide types render in PPTX format.
 * Uses PptxSlidePreview to render slides using the SAME coordinate system
 * as pptxExportService.ts — so what you see here is exactly what PowerPoint
 * will output, making visual tuning trivial.
 *
 * Route: /admin/pptx-preview
 */

import React, { useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Divider,
  Button,
  TextField,
  Alert,
} from "@mui/material";
import { ArrowBack as ArrowBackIcon, Download as DownloadIcon } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import SidebarLayout from "../components/layout/SidebarLayout";
import PptxSlidePreview from "../components/slides/PptxSlidePreview";
import { SLIDE_TYPES, SlideTypeDefinition } from "../components/slides/slideTypes";
import { exportToPptx } from "../services/pptxExportService";

const DEFAULT_THEME = {
  primaryColor: "#6366f1",
  secondaryColor: "#06b6d4",
  backgroundColor: "#0f172a",
  headingFont: "Arial",
  bodyFont: "Arial",
};

const AdminPptxPreview: React.FC = () => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<SlideTypeDefinition>(SLIDE_TYPES[0]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportSelected = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportToPptx({
        title: `PPTX Preview — ${selected.name}`,
        slides: [{ slideTypeKey: selected.key, parameters: selected.sampleData }],
        theme: DEFAULT_THEME,
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleExportAll = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportToPptx({
        title: "PPTX Preview — All Slide Types",
        slides: SLIDE_TYPES.map((st) => ({
          slideTypeKey: st.key,
          parameters: st.sampleData,
        })),
        theme: DEFAULT_THEME,
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <SidebarLayout fullHeight>
      <Box sx={{ display: "flex", height: "100%", overflow: "hidden" }}>
        {/* ─── Left sidebar: slide type list ─── */}
        <Box
          sx={{
            width: 280,
            flexShrink: 0,
            borderRight: 1,
            borderColor: "divider",
            overflowY: "auto",
            bgcolor: "background.paper",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box sx={{ p: 2, pb: 1 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate("/admin/users")}
              size="small"
              sx={{ mb: 1 }}
            >
              Admin
            </Button>
            <Typography variant="h6" fontWeight={700}>
              PPTX Preview
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Visual PPTX coordinate debugger
            </Typography>
          </Box>

          <Divider />

          {/* Export buttons */}
          <Box sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={handleExportSelected}
              disabled={exporting}
              fullWidth
            >
              Export current slide
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={handleExportAll}
              disabled={exporting}
              fullWidth
            >
              Export all slides
            </Button>
            {exportError && (
              <Alert severity="error" sx={{ fontSize: 11 }}>
                {exportError}
              </Alert>
            )}
          </Box>

          <Divider />

          {/* Slide type list */}
          <Box sx={{ px: 1, pb: 2, flex: 1, overflowY: "auto" }}>
            {SLIDE_TYPES.map((st) => (
              <Card
                key={st.key}
                variant={selected.key === st.key ? "elevation" : "outlined"}
                sx={{
                  mt: 1,
                  border: selected.key === st.key ? 2 : 1,
                  borderColor: selected.key === st.key ? "primary.main" : "divider",
                  bgcolor: selected.key === st.key ? "action.selected" : "background.paper",
                  transition: "all 0.12s ease",
                }}
              >
                <CardActionArea onClick={() => setSelected(st)}>
                  <CardContent sx={{ py: 1, px: 1.5 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.25 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {st.name}
                      </Typography>
                    </Box>
                    <Chip label={st.key} size="small" sx={{ fontSize: 10, height: 18 }} />
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        </Box>

        {/* ─── Main area: PPTX preview ─── */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "auto",
            bgcolor: "#111827",
            p: 4,
            gap: 4,
          }}
        >
          {/* Header */}
          <Box>
            <Typography variant="h5" sx={{ color: "#f1f5f9", fontWeight: 700 }}>
              {selected.name}
            </Typography>
            <Typography variant="body2" sx={{ color: "#64748b", mt: 0.5 }}>
              {selected.description}
            </Typography>
            <Chip
              label={`key: "${selected.key}"`}
              size="small"
              variant="outlined"
              sx={{ mt: 1, fontFamily: "monospace", fontSize: 11, color: "#94a3b8" }}
            />
          </Box>

          {/* The PPTX preview card */}
          <Box
            sx={{
              border: "1px dashed #334155",
              borderRadius: 2,
              p: 2,
              bgcolor: "#0f172a",
              display: "inline-flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            <Typography variant="caption" sx={{ color: "#475569", fontFamily: "monospace" }}>
              Canvas: 10 × 5.625 inches (16:9) — coordinates match pptxExportService.ts exactly
            </Typography>
            <PptxSlidePreview
              slideTypeKey={selected.key}
              params={selected.sampleData}
              theme={DEFAULT_THEME}
              width={900}
            />
          </Box>

          {/* Reference: sample data JSON */}
          <Box>
            <Typography
              variant="caption"
              sx={{ color: "#475569", mb: 0.5, display: "block", fontWeight: 600 }}
            >
              Sample data (params)
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={10}
              value={JSON.stringify(selected.sampleData, null, 2)}
              InputProps={{
                readOnly: true,
                sx: {
                  fontFamily: "monospace",
                  fontSize: 12,
                  bgcolor: "#0f172a",
                  color: "#94a3b8",
                },
              }}
              sx={{ "& fieldset": { borderColor: "#1e293b" } }}
            />
          </Box>
        </Box>
      </Box>
    </SidebarLayout>
  );
};

export default AdminPptxPreview;
