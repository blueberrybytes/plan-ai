import React from "react";
import { Box, Tab, Tabs, alpha } from "@mui/material";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { SectionTab } from "./navSections";

type SectionTabsProps = {
  sections: SectionTab[][];
};

/**
 * Tab bar for the pages that share one sidebar entry. It shows only on the
 * index page of each tab (for example /docs, not /docs/view/1), so editors
 * and detail pages keep their full height.
 */
const SectionTabs: React.FC<SectionTabsProps> = ({ sections }) => {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  const tabs = sections.find((section) => section.some((tab) => tab.path === pathname));
  if (!tabs || tabs.length < 2) return null;

  // Segmented control: a tinted strip with the current tab filled in the
  // accent color, so it reads as navigation and not as page content.
  return (
    <Box sx={{ px: { xs: 2, md: 4 }, pt: 2 }}>
      <Tabs
        value={pathname}
        variant="scrollable"
        scrollButtons="auto"
        TabIndicatorProps={{ sx: { display: "none" } }}
        sx={{
          display: "inline-flex",
          maxWidth: "100%",
          minHeight: 0,
          p: 0.5,
          borderRadius: "12px",
          border: 1,
          borderColor: "divider",
          bgcolor: (theme) => alpha(theme.palette.text.primary, 0.05),
        }}
      >
        {tabs.map((tab) => (
          <Tab
            key={tab.path}
            value={tab.path}
            label={t(tab.labelKey)}
            component={NavLink}
            to={tab.path}
            sx={{
              minHeight: 0,
              minWidth: 0,
              px: 2,
              py: 0.75,
              borderRadius: "8px",
              textTransform: "none",
              fontWeight: 600,
              color: "text.secondary",
              "&:hover": {
                color: "text.primary",
                bgcolor: "action.hover",
              },
              "&.Mui-selected, &.Mui-selected:hover": {
                color: "primary.contrastText",
                bgcolor: "primary.main",
              },
            }}
          />
        ))}
      </Tabs>
    </Box>
  );
};

export default SectionTabs;
