import React from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  Engineering as EngineeringIcon,
  Brush as DesignIcon,
  HeadsetMic as SupportIcon,
  CloudQueue as OpsIcon,
  Science as ResearchIcon,
  ViewModule as AllIcon,
} from "@mui/icons-material";

export type TaskCategoryFilter =
  | "all"
  | "engineering"
  | "design"
  | "support"
  | "ops"
  | "research";

interface CategoryFilterBarProps {
  value: TaskCategoryFilter;
  onChange: (next: TaskCategoryFilter) => void;
  counts: Record<TaskCategoryFilter, number>;
}

/**
 * Chip-row filter for the project task views (board / diagram / canvas /
 * gantt). Lets the user toggle between seeing all tickets vs only one
 * category — most useful for agency customers who don't want support /
 * design action items polluting their engineering kanban.
 *
 * The filter is **local to the page** for now — selection resets on reload.
 * Persisting via localStorage or workspace settings is a future enhancement
 * (see IMPROVEMENTS.md #27.4).
 *
 * Default selection is "engineering" (set by the parent), so customers who
 * never touch this filter get a clean dev board out of the box.
 */
const CategoryFilterBar: React.FC<CategoryFilterBarProps> = ({ value, onChange, counts }) => {
  const { t } = useTranslation();

  const OPTIONS: Array<{
    key: TaskCategoryFilter;
    labelKey: string;
    icon: React.ReactElement;
  }> = [
    { key: "all", labelKey: "projectDetails.categoryFilter.all", icon: <AllIcon fontSize="small" /> },
    {
      key: "engineering",
      labelKey: "projectDetails.categoryFilter.engineering",
      icon: <EngineeringIcon fontSize="small" />,
    },
    {
      key: "design",
      labelKey: "projectDetails.categoryFilter.design",
      icon: <DesignIcon fontSize="small" />,
    },
    {
      key: "support",
      labelKey: "projectDetails.categoryFilter.support",
      icon: <SupportIcon fontSize="small" />,
    },
    { key: "ops", labelKey: "projectDetails.categoryFilter.ops", icon: <OpsIcon fontSize="small" /> },
    {
      key: "research",
      labelKey: "projectDetails.categoryFilter.research",
      icon: <ResearchIcon fontSize="small" />,
    },
  ];

  return (
    <Box sx={{ pt: 2, pb: 1.5 }}>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ flexWrap: "wrap", rowGap: 1 }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ mr: 1, fontWeight: 600 }}>
          {t("projectDetails.categoryFilter.label", "Filter:")}
        </Typography>
        {OPTIONS.map((opt) => {
          const count = counts[opt.key] ?? 0;
          // Hide categories with 0 tasks except "all" + currently selected.
          if (count === 0 && opt.key !== "all" && opt.key !== value) return null;
          const selected = value === opt.key;
          return (
            <Chip
              key={opt.key}
              icon={opt.icon}
              label={
                <span>
                  {t(opt.labelKey)}{" "}
                  <Box component="span" sx={{ opacity: 0.7, fontWeight: 400 }}>
                    ({count})
                  </Box>
                </span>
              }
              onClick={() => onChange(opt.key)}
              color={selected ? "primary" : "default"}
              variant={selected ? "filled" : "outlined"}
              size="small"
              sx={{ fontWeight: selected ? 600 : 400 }}
            />
          );
        })}
      </Stack>
    </Box>
  );
};

export default CategoryFilterBar;
