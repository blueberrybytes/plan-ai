import React, { useState } from "react";
import { Box, Typography, Button, Card, CardActionArea } from "@mui/material";
import { ArrowBack as ArrowBackIcon, Add as AddIcon } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import SidebarLayout from "../components/layout/SidebarLayout";
import { DIAGRAM_TYPES } from "../components/diagrams/diagramTypes";
import MermaidRenderer from "../components/common/MermaidRenderer";

const DiagramTypes: React.FC = () => {
  const navigate = useNavigate();
  const [activeType, setActiveType] = useState(DIAGRAM_TYPES[0]);

  return (
    <SidebarLayout>
      <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        {/* Left: Types List */}
        <Box
          sx={{
            width: 380,
            flexShrink: 0,
            borderRight: 1,
            borderColor: "divider",
            overflowY: "auto",
            bgcolor: "background.paper",
            p: 3,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate("/diagrams")}
            sx={{ mb: 2, alignSelf: "flex-start" }}
          >
            Back to Diagrams
          </Button>

          <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
            Diagram Types
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, flex: 1 }}>
            {DIAGRAM_TYPES.map((t) => (
              <Card
                key={t.id}
                variant="outlined"
                sx={{
                  borderColor: activeType.id === t.id ? "primary.main" : "divider",
                  borderWidth: activeType.id === t.id ? 2 : 1,
                }}
              >
                <CardActionArea onClick={() => setActiveType(t)} sx={{ p: 2 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    {t.icon}
                    <Box>
                      <Typography variant="subtitle1" fontWeight={700}>
                        {t.label}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t.desc}
                      </Typography>
                    </Box>
                  </Box>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        </Box>

        {/* Right: Example Preview */}
        <Box
          sx={{
            flex: 1,
            position: "relative",
            bgcolor: "#f1f5f9",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header Action inside the preview pane */}
          <Box
            sx={{
              p: 3,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: 1,
              borderColor: "divider",
              bgcolor: "background.paper",
            }}
          >
            <Box>
              <Typography variant="h6" fontWeight={700}>
                {activeType.label} Example
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {activeType.desc}
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => navigate(`/diagrams/create?type=${activeType.id}`)}
            >
              Construct this diagram
            </Button>
          </Box>

          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              p: 4,
              position: "relative",
            }}
          >
            <MermaidRenderer chart={activeType.sampleCode} />
          </Box>
        </Box>
      </Box>
    </SidebarLayout>
  );
};

export default DiagramTypes;
