import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
  Typography,
} from "@mui/material";
import Papa from "papaparse";

interface CsvRendererProps {
  content: string;
}

const CsvRenderer: React.FC<CsvRendererProps> = ({ content }) => {
  const [data, setData] = React.useState<string[][]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      const parsed = Papa.parse<string[]>(content, {
        header: false,
        skipEmptyLines: true,
      });

      if (parsed.errors && parsed.errors.length > 0) {
        console.error("CSV Parse Errors:", parsed.errors);
        // We can still try to render what we have
      }

      setData(parsed.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse CSV");
    }
  }, [content]);

  if (error) {
    return (
      <Box sx={{ p: 2, color: "error.main" }}>
        <Typography variant="body1">Error loading CSV: {error}</Typography>
      </Box>
    );
  }

  if (data.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body1" color="text.secondary">
          No data or empty CSV
        </Typography>
      </Box>
    );
  }

  const headers = data[0];
  const rows = data.slice(1);

  return (
    <TableContainer
      component={Paper}
      elevation={0}
      sx={{ maxHeight: "100%", width: "100%", overflow: "auto" }}
    >
      <Table stickyHeader size="small" sx={{ minWidth: 650 }}>
        <TableHead>
          <TableRow>
            {headers?.map((headerCell, idx) => (
              <TableCell
                key={`header-${idx}`}
                sx={{
                  fontWeight: "bold",
                  backgroundColor: "action.hover",
                  whiteSpace: "nowrap",
                }}
              >
                {headerCell}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={`row-${rowIndex}`} hover>
              {row.map((cell, cellIndex) => (
                <TableCell key={`cell-${rowIndex}-${cellIndex}`} sx={{ whiteSpace: "nowrap" }}>
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default CsvRenderer;
