import React from "react";
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  Breadcrumbs,
  Link as MuiLink,
} from "@mui/material";
import { NavLink } from "react-router-dom";
import PeopleIcon from "@mui/icons-material/People";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import MailIcon from "@mui/icons-material/MailOutline";
import ChatIcon from "@mui/icons-material/Chat";
import SidebarLayout from "../../components/layout/SidebarLayout";

const AdminDashboard: React.FC = () => {
  const adminCards = [
    {
      title: "Users",
      description: "Manage users, roles, and view individual usage statistics.",
      path: "/admin/users",
      icon: <PeopleIcon fontSize="large" color="primary" />,
    },
    {
      title: "AI Pricing",
      description: "Configure global AI model pricing and token limits.",
      path: "/admin/pricing",
      icon: <MonetizationOnIcon fontSize="large" color="primary" />,
    },
    {
      title: "Email Templates",
      description: "Customize transactional email templates for the platform.",
      path: "/admin/emails",
      icon: <MailIcon fontSize="large" color="primary" />,
    },
    {
      title: "Chat Stream Test",
      description: "Test AI stream parsing and formatting components.",
      path: "/chat-stream-test",
      icon: <ChatIcon fontSize="large" color="primary" />,
    },
  ];

  return (
    <SidebarLayout>
      <Box sx={{ p: 3, maxWidth: 1200, margin: "0 auto" }}>
        <Box sx={{ mb: 4 }}>
          <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
            <MuiLink component={NavLink} underline="hover" color="inherit" to="/home">
              Home
            </MuiLink>
            <Typography color="text.primary">Admin</Typography>
          </Breadcrumbs>
          <Typography variant="h4" fontWeight="bold">
            Admin Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
            Central hub for platform configuration and management.
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {adminCards.map((card) => (
            <Grid item xs={12} sm={6} md={4} key={card.title}>
              <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <CardActionArea component={NavLink} to={card.path} sx={{ flexGrow: 1, p: 2 }}>
                  <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                    <Box sx={{ mr: 2 }}>{card.icon}</Box>
                    <Typography variant="h6" fontWeight="bold">
                      {card.title}
                    </Typography>
                  </Box>
                  <CardContent sx={{ p: 0 }}>
                    <Typography variant="body2" color="text.secondary">
                      {card.description}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    </SidebarLayout>
  );
};

export default AdminDashboard;
