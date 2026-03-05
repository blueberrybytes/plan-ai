import React from "react";
import { SxProps, Theme } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import DownloadIcon from "@mui/icons-material/Download";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import PsychologyIcon from "@mui/icons-material/Psychology";
import SettingsIcon from "@mui/icons-material/Settings";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CircleIcon from "@mui/icons-material/Circle";

export const iconMap: Record<string, React.FC<{ sx?: SxProps<Theme> }>> = {
  AutoAwesome: AutoAwesomeIcon,
  TextFields: TextFieldsIcon,
  Download: DownloadIcon,
  Lightbulb: LightbulbIcon,
  Psychology: PsychologyIcon,
  Settings: SettingsIcon,
  CheckCircle: CheckCircleIcon,
};

export const DynamicIcon = ({ name, sx }: { name?: string; sx?: SxProps<Theme> }) => {
  if (!name) return <CircleIcon sx={sx} />;
  const IconComponent = iconMap[name] || CheckCircleIcon;
  return <IconComponent sx={sx} />;
};

export default DynamicIcon;
