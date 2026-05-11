import React, { useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  TextField,
  TableSortLabel,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useGetAiPricingQuery } from "../store/apis/aiUsageApi";

const AiPricing: React.FC = () => {
  const { t } = useTranslation();
  const { data, isLoading, error } = useGetAiPricingQuery();
  const [searchTerm, setSearchTerm] = useState("");
  type SortColumn = "id" | "promptPrice" | "completionPrice" | "maxTokens";
  const [sortColumn, setSortColumn] = useState<SortColumn>("id");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const sortedAndFilteredModels = React.useMemo(() => {
    const arr =
      data?.models.filter((m) => m.id.toLowerCase().includes(searchTerm.toLowerCase())) || [];
    return arr.sort((a, b) => {
      let comparison = 0;
      if (sortColumn === "id") {
        comparison = a.id.localeCompare(b.id);
      } else if (sortColumn === "promptPrice") {
        comparison = a.promptPrice - b.promptPrice;
      } else if (sortColumn === "completionPrice") {
        comparison = a.completionPrice - b.completionPrice;
      } else if (sortColumn === "maxTokens") {
        comparison = (a.maxTokens || 0) - (b.maxTokens || 0);
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [data?.models, searchTerm, sortColumn, sortDirection]);

  return (
    <SidebarLayout>
      <Box sx={{ p: 4, maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        <Typography variant="h4" sx={{ mb: 1 }}>
          {t("aiPricing.heading", "AI Model Pricing")}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          {t(
            "aiPricing.description",
            "View the live per-token cost configuration exported from OpenRouter.",
          )}
        </Typography>

        <TextField
          fullWidth
          variant="outlined"
          placeholder={t("aiPricing.searchPlaceholder", "Search models (e.g. gemini, claude, gpt)")}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ mb: 4 }}
        />

        {isLoading && <CircularProgress />}
        {error && (
          <Alert severity="error">{t("aiPricing.empty", "Failed to load pricing data.")}</Alert>
        )}

        {data && (
          <TableContainer component={Paper} elevation={0} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    <TableSortLabel
                      active={sortColumn === "id"}
                      direction={sortColumn === "id" ? sortDirection : "asc"}
                      onClick={() => handleSort("id")}
                    >
                      {t("aiPricing.table.id", "Model ID")}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={sortColumn === "promptPrice"}
                      direction={sortColumn === "promptPrice" ? sortDirection : "asc"}
                      onClick={() => handleSort("promptPrice")}
                    >
                      {t("aiPricing.table.promptPrice", "Prompt Cost / Token")}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={sortColumn === "completionPrice"}
                      direction={sortColumn === "completionPrice" ? sortDirection : "asc"}
                      onClick={() => handleSort("completionPrice")}
                    >
                      {t("aiPricing.table.completionPrice", "Completion Cost / Token")}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={sortColumn === "maxTokens"}
                      direction={sortColumn === "maxTokens" ? sortDirection : "asc"}
                      onClick={() => handleSort("maxTokens")}
                    >
                      {t("aiPricing.table.maxTokens", "Context Window")}
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedAndFilteredModels.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell sx={{ fontWeight: 500 }}>{model.id}</TableCell>
                    <TableCell align="right" sx={{ color: "success.main" }}>
                      ${model.promptPrice.toFixed(7)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: "success.main" }}>
                      ${model.completionPrice.toFixed(7)}
                    </TableCell>
                    <TableCell align="right">
                      {model.maxTokens ? model.maxTokens.toLocaleString() : "-"}
                    </TableCell>
                  </TableRow>
                ))}
                {sortedAndFilteredModels.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} align="center">
                      {t("aiPricing.empty", "No pricing data found.")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </SidebarLayout>
  );
};

export default AiPricing;
