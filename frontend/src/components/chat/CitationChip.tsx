import React from "react";
import { Chip, Tooltip } from "@mui/material";
import DescriptionIcon from "@mui/icons-material/Description";

interface CitationChipProps {
  filename: string;
  lines: string;
  onClick?: () => void;
}

const CitationChip: React.FC<CitationChipProps> = ({ filename, lines, onClick }) => {
  return (
    <Tooltip title={`Source: ${filename}, Lines: ${lines}`}>
      <Chip
        icon={<DescriptionIcon sx={{ fontSize: "14px !important" }} />}
        label={filename}
        size="small"
        sx={{
          mx: 0.5,
          height: 20,
          fontSize: "0.75rem",
          cursor: "pointer",
          bgcolor: "rgba(67, 97, 238, 0.1)",
          color: "primary.main",
          borderColor: "primary.main",
          borderWidth: 1,
          borderStyle: "solid",
          "&:hover": { bgcolor: "rgba(67, 97, 238, 0.2)" },
        }}
        onClick={() => {
          if (onClick) {
            onClick();
          } else {
            console.log("TODO: Navigate to citation", filename, lines);
          }
        }}
      />
    </Tooltip>
  );
};

export default CitationChip;
