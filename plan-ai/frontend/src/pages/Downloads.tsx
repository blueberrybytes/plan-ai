import React from "react";
import {
  Box,
  Typography,
  Container,
  Grid,
  Card,
  CardContent,
  Button,
  alpha,
  Divider,
} from "@mui/material";
import {
  Apple as AppleIcon,
  Window as WindowIcon,
  Adb as AndroidIcon,
  DesktopWindows as DesktopWindowsIcon,
  Smartphone as SmartphoneIcon,
  Download as DownloadIcon,
  OpenInNew as OpenInNewIcon,
  GitHub as GitHubIcon,
} from "@mui/icons-material";
import SidebarLayout from "../components/layout/SidebarLayout";

const Downloads: React.FC = () => {
  return (
    <SidebarLayout>
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Box sx={{ mb: 6, textAlign: "center" }}>
          <Typography variant="h3" sx={{ fontWeight: 800, mb: 2 }}>
            Get the Plan AI Apps
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 600, mx: "auto" }}>
            Experience the full power of Plan AI. Record system audio natively on your desktop, or capture in-person meetings on the go with our mobile app.
          </Typography>
        </Box>

        <Grid container spacing={4} justifyContent="center">
          {/* Desktop Recorder */}
          <Grid item xs={12} md={6}>
            <Card
              sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                borderRadius: 4,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: (theme) => alpha(theme.palette.background.paper, 0.6),
                backdropFilter: "blur(20px)",
                transition: "transform 0.2s, box-shadow 0.2s",
                "&:hover": {
                  transform: "translateY(-4px)",
                  boxShadow: (theme) => `0 12px 24px ${alpha(theme.palette.primary.main, 0.15)}`,
                },
              }}
            >
              <CardContent sx={{ flexGrow: 1, p: 4 }}>
                <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                      color: "primary.main",
                      display: "flex",
                      mr: 2,
                    }}
                  >
                    <DesktopWindowsIcon fontSize="large" />
                  </Box>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    Desktop Recorder
                  </Typography>
                </Box>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                  Native desktop application to seamlessly capture system audio and your microphone during Zoom, Google Meet, and Microsoft Teams calls.
                </Typography>

                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {/* macOS */}
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 2, borderRadius: 2, bgcolor: "background.default" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <AppleIcon />
                      <Typography sx={{ fontWeight: 600 }}>macOS</Typography>
                    </Box>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<OpenInNewIcon />}
                      href="https://apps.apple.com/es/app/plan-ai-recorder/id6759553699?l=en-GB&mt=12"
                      target="_blank"
                    >
                      Mac App Store
                    </Button>
                  </Box>

                  {/* Windows */}
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 2, borderRadius: 2, bgcolor: "background.default" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <WindowIcon />
                      <Typography sx={{ fontWeight: 600 }}>Windows</Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<DownloadIcon />}
                      href="https://github.com/blueberrybytes/plan-ai-recorder-releases/releases/latest"
                      target="_blank"
                    >
                      Download .exe
                    </Button>
                  </Box>

                  {/* Linux */}
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 2, borderRadius: 2, bgcolor: "background.default" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <DesktopWindowsIcon />
                      <Typography sx={{ fontWeight: 600 }}>Linux</Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<DownloadIcon />}
                      href="https://github.com/blueberrybytes/plan-ai-recorder-releases/releases/latest"
                      target="_blank"
                    >
                      Download AppImage / .deb
                    </Button>
                  </Box>
                </Box>

                <Divider sx={{ my: 3, opacity: 0.5 }} />
                
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 1 }}>
                  <GitHubIcon color="action" />
                  <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                    Looking for a specific version, source code, or alternate formats?
                  </Typography>
                  <Button
                    variant="text"
                    size="small"
                    href="https://github.com/blueberrybytes/plan-ai-recorder-releases/releases"
                    target="_blank"
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    View All Releases
                  </Button>
                </Box>

              </CardContent>
            </Card>
          </Grid>

          {/* Mobile Companion */}
          <Grid item xs={12} md={6}>
            <Card
              sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                borderRadius: 4,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: (theme) => alpha(theme.palette.background.paper, 0.6),
                backdropFilter: "blur(20px)",
                transition: "transform 0.2s, box-shadow 0.2s",
                "&:hover": {
                  transform: "translateY(-4px)",
                  boxShadow: (theme) => `0 12px 24px ${alpha(theme.palette.secondary.main, 0.15)}`,
                },
              }}
            >
              <CardContent sx={{ flexGrow: 1, p: 4 }}>
                <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: (theme) => alpha(theme.palette.secondary.main, 0.1),
                      color: "secondary.main",
                      display: "flex",
                      mr: 2,
                    }}
                  >
                    <SmartphoneIcon fontSize="large" />
                  </Box>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    Mobile Companion
                  </Typography>
                </Box>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                  The perfect companion for in-person meetings. Record live conversations, whiteboarding sessions, and automatically sync transcripts back to your web dashboard.
                </Typography>

                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {/* Android */}
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 2, borderRadius: 2, bgcolor: "background.default" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <AndroidIcon sx={{ color: "#3DDC84" }} />
                      <Typography sx={{ fontWeight: 600 }}>Android</Typography>
                    </Box>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<OpenInNewIcon />}
                      href="https://play.google.com/store/apps/details?id=com.blueberrybytes.planai"
                      target="_blank"
                      sx={{ bgcolor: "#3DDC84", color: "#000", "&:hover": { bgcolor: "#35C073" } }}
                    >
                      Google Play
                    </Button>
                  </Box>

                  {/* iOS */}
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 2, borderRadius: 2, bgcolor: "background.default" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <AppleIcon />
                      <Typography sx={{ fontWeight: 600 }}>iOS (iPhone/iPad)</Typography>
                    </Box>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<OpenInNewIcon />}
                      href="https://apps.apple.com/us/app/plan-ai-mobile-recorder/id6762671958"
                      target="_blank"
                    >
                      App Store
                    </Button>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </SidebarLayout>
  );
};

export default Downloads;
