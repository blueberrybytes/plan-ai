import React, { useState } from "react";
import {
  Box,
  Typography,
  Card,
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  Divider,
  IconButton,
  Tooltip,
} from "@mui/material";
import { MailOutline as MailIcon, Refresh as RefreshIcon } from "@mui/icons-material";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useGetAdminEmailTemplatesQuery } from "../store/apis/adminApi";

const AdminEmails: React.FC = () => {
  const { data, isLoading, error, refetch, isFetching } = useGetAdminEmailTemplatesQuery(
    undefined,
    {
      refetchOnFocus: true,
    },
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const templates = React.useMemo(() => data?.data || [], [data]);
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  // Automatically select the first template when data loads
  React.useEffect(() => {
    if (templates.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [templates, selectedTemplateId]);

  if (isLoading) {
    return (
      <SidebarLayout>
        <Box sx={{ display: "flex", justifyContent: "center", p: 10 }}>
          <CircularProgress />
        </Box>
      </SidebarLayout>
    );
  }

  if (error) {
    return (
      <SidebarLayout>
        <Box sx={{ p: 4, color: "error.main" }}>
          <Typography variant="h6">Failed to load email templates.</Typography>
          <Typography variant="body2">Make sure you have Admin permissions.</Typography>
        </Box>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout fullHeight>
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%", p: 4 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 4 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <MailIcon fontSize="large" color="primary" />
            <Typography variant="h4" fontWeight={800}>
              Email Templates
            </Typography>
          </Box>
          <Tooltip title="Refresh Templates">
            <IconButton
              onClick={refetch}
              disabled={isFetching}
              color="primary"
              sx={{ bgcolor: "rgba(67, 97, 238, 0.08)" }}
            >
              <RefreshIcon
                sx={{
                  animation: isFetching ? "spin 1s linear infinite" : "none",
                  "@keyframes spin": { "100%": { transform: "rotate(360deg)" } },
                }}
              />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ display: "flex", gap: 4, flexGrow: 1, minHeight: 0 }}>
          {/* Sidebar List */}
          <Card sx={{ width: 300, flexShrink: 0, overflowY: "auto", borderRadius: 3 }}>
            <List disablePadding>
              {templates.map((template, index) => (
                <React.Fragment key={template.id}>
                  {index > 0 && <Divider />}
                  <ListItemButton
                    selected={selectedTemplateId === template.id}
                    onClick={() => setSelectedTemplateId(template.id)}
                    sx={{ py: 2 }}
                  >
                    <ListItemText
                      primary={template.name}
                      primaryTypographyProps={{
                        fontWeight: selectedTemplateId === template.id ? 700 : 500,
                      }}
                      secondary={template.id}
                    />
                  </ListItemButton>
                </React.Fragment>
              ))}
            </List>
          </Card>

          {/* Sandboxed Preview Area */}
          <Card
            sx={{
              flexGrow: 1,
              display: "flex",
              flexDirection: "column",
              borderRadius: 3,
              overflow: "hidden",
              bgcolor: "background.paper",
            }}
          >
            {selectedTemplate ? (
              <Box sx={{ flexGrow: 1, position: "relative" }}>
                <iframe
                  title={`Email Template: ${selectedTemplate.name}`}
                  srcDoc={`
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <meta charset="utf-8">
                      <link rel="preconnect" href="https://fonts.googleapis.com">
                      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
                    </head>
                    <body style="margin:0; padding:60px 20px; background-color:#f8fafc; display:flex; justify-content:center; align-items:flex-start; min-height:100vh; box-sizing:border-box;">
                      <div style="width: 100%; max-width: 520px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); border-radius: 16px;">
                        ${selectedTemplate.html}
                      </div>
                    </body>
                  </html>
                `}
                  style={{
                    width: "100%",
                    height: "100%",
                    border: "none",
                  }}
                  sandbox="allow-same-origin allow-popups"
                />
              </Box>
            ) : (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: "100%",
                }}
              >
                <Typography color="text.secondary">Select an email template to preview</Typography>
              </Box>
            )}
          </Card>
        </Box>
      </Box>
    </SidebarLayout>
  );
};

export default AdminEmails;
