import React from "react";
import { Box, Typography, alpha } from "@mui/material";

interface PageHeaderProps {
  /** Main page title — rendered with gradient text */
  title: string;
  /** Optional subtitle line below the title */
  subtitle?: string;
  /** Optional icon displayed to the left of the title */
  icon?: React.ReactNode;
  /** Optional slot for action buttons on the right */
  actions?: React.ReactNode;
  /** Additional bottom margin (default 4) */
  mb?: number;
}

/**
 * Consistent page-level header with gradient title, subtitle, and action slot.
 * Replaces ad-hoc `<Typography variant="h4">` patterns across pages.
 */
const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, icon, actions, mb = 4 }) => {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        mb,
        gap: 2,
        flexWrap: "wrap",
      }}
    >
      {/* Left: icon + title + subtitle */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
        {icon && (
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: "12px",
              background: (theme) =>
                `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.25)} 0%, ${alpha(theme.palette.secondary.main, 0.18)} 100%)`,
              border: (theme) => `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "primary.light",
              flexShrink: 0,
              fontSize: 22,
            }}
          >
            {icon}
          </Box>
        )}
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              lineHeight: 1.2,
              background: "linear-gradient(135deg, #ffffff 0%, #94a3b8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              letterSpacing: "-0.5px",
            }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.25, lineHeight: 1.4, maxWidth: 500 }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Right: actions */}
      {actions && (
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexShrink: 0 }}>{actions}</Box>
      )}
    </Box>
  );
};

export default PageHeader;
