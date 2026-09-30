import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { roundKcal, type FoodItem } from "./trackerUtils";
import { useTrackerFormat } from "./useTrackerFormat";

interface FoodBreakdownProps {
  items: FoodItem[];
  /** Hide every kcal number and keep foods and grams. */
  hideKcal: boolean;
}

/** The foods of a calories entry: grams and kcal. */
const FoodBreakdown: React.FC<FoodBreakdownProps> = ({ items, hideKcal }) => {
  const { t } = useTranslation();
  const { number } = useTrackerFormat();
  if (items.length === 0) return null;

  const grams = (item: FoodItem) => {
    if (item.grams === null) return null;
    if (item.gramsLow !== null && item.gramsHigh !== null && item.gramsLow !== item.gramsHigh) {
      return t("trackers.food.gramsRange", {
        grams: number(item.grams, 0),
        low: number(item.gramsLow, 0),
        high: number(item.gramsHigh, 0),
      });
    }
    return t("trackers.food.grams", { grams: number(item.grams, 0) });
  };

  return (
    <Stack spacing={0.5} sx={{ mt: 0.5 }} component="ul" style={{ paddingLeft: 0, margin: 0 }}>
      {items.map((item, index) => (
        <Box
          component="li"
          key={`${item.name}-${index}`}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
            listStyle: "none",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {[item.name, grams(item)].filter(Boolean).join(", ")}
            {!hideKcal && item.kcal !== null
              ? `, ${t("trackers.food.kcal", { kcal: number(roundKcal(item.kcal), 0) })}`
              : ""}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
};

export default FoodBreakdown;
