import React, { useState } from "react";
import { Box, Typography, Button, Card, CardActionArea, CardContent, Chip } from "@mui/material";
import { ArrowBack as ArrowBackIcon } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import SlideRenderer from "../components/slides/SlideRenderer";
import { SLIDE_TYPES, SlideTypeDefinition } from "../components/slides/slideTypes";

const SlideTypes: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<SlideTypeDefinition>(SLIDE_TYPES[0]);

  return (
    <SidebarLayout fullHeight>
      <Box sx={{ display: "flex", height: "100%", overflow: "hidden" }}>
        {/* Left panel — slide type list */}
        <Box
          sx={{
            width: 320,
            flexShrink: 0,
            borderRight: 1,
            borderColor: "divider",
            overflowY: "auto",
            bgcolor: "background.paper",
          }}
        >
          <Box sx={{ p: 2, pb: 1 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate("/slides")}
              sx={{ mb: 1 }}
            >
              {t("slides.actions.back")}
            </Button>
            <Typography variant="h5" fontWeight={700}>
              {t("slides.slideTypesPage.title")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t("slides.catalogSubtitle")}
            </Typography>
          </Box>

          <Box sx={{ px: 1.5, pb: 2 }}>
            {SLIDE_TYPES.map((slideType) => (
              <Card
                key={slideType.key}
                variant={selected?.key === slideType.key ? "elevation" : "outlined"}
                sx={{
                  mb: 1,
                  border: selected?.key === slideType.key ? 2 : 1,
                  borderColor: selected?.key === slideType.key ? "primary.main" : "divider",
                  bgcolor: selected?.key === slideType.key ? "action.selected" : "background.paper",
                  transition: "all 0.15s ease",
                }}
              >
                <CardActionArea onClick={() => setSelected(slideType)}>
                  {/* Mini thumbnail preview */}
                  <Box
                    sx={{
                      width: "100%",
                      height: 130,
                      overflow: "hidden",
                      bgcolor: "#0f172a",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderBottom: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Box
                      sx={{
                        transform: "scale(0.235)",
                        transformOrigin: "top left",
                        width: 960 * 0.235,
                        height: 540 * 0.235,
                        pointerEvents: "none",
                      }}
                    >
                      <SlideRenderer
                        typeKey={slideType.key}
                        data={slideType.sampleData}
                        scale={1}
                      />
                    </Box>
                  </Box>
                  <CardContent sx={{ py: 1.5, px: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        {t(`slides.slideTypes.${slideType.key}`, slideType.name)}
                      </Typography>
                      <Chip
                        label={slideType.key}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: 10, height: 20 }}
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
                      {slideType.description}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        </Box>

        {/* Right panel — slide preview */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "#1a1a2e",
            p: 4,
            overflow: "auto",
          }}
        >
          {selected && (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <SlideRenderer typeKey={selected.key} data={selected.sampleData} scale={0.75} />
              <Box sx={{ textAlign: "center" }}>
                <Typography variant="h6" sx={{ color: "#e2e8f0", fontWeight: 600 }}>
                  {t(`slides.slideTypes.${selected.key}`, selected.name)}
                </Typography>
                <Typography variant="body2" sx={{ color: "#94a3b8", maxWidth: 500, mt: 0.5 }}>
                  {selected.description}
                </Typography>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </SidebarLayout>
  );
};

export default SlideTypes;
