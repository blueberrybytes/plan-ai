import React, { useEffect, useState } from "react";
import { ButtonBase, IconButton, Tooltip, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useTranslation } from "react-i18next";
import CommandPalette from "./CommandPalette";
import type { NavCommand } from "./searchPalette";

interface Props {
  /** True when the sidebar shows icons only. */
  collapsed: boolean;
  commands: NavCommand[];
}

const isMac = (): boolean =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

/**
 * The search button of the sidebar and the palette it opens. Cmd+K on a Mac
 * and Ctrl+K elsewhere open it from any page.
 */
const GlobalSearch = ({ collapsed, commands }: Props) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const shortcut = isMac() ? "⌘K" : "Ctrl K";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      {collapsed ? (
        <Tooltip title={`${t("globalSearch.open")} (${shortcut})`} placement="right">
          <IconButton
            onClick={() => setOpen(true)}
            aria-label={t("globalSearch.open")}
            size="small"
            sx={{ alignSelf: "center", color: "text.secondary", mb: 0.5 }}
          >
            <SearchIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : (
        <ButtonBase
          onClick={() => setOpen(true)}
          aria-label={t("globalSearch.open")}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            width: "100%",
            px: 1.25,
            py: 0.75,
            mb: 0.5,
            borderRadius: "10px",
            border: "1px solid",
            borderColor: "divider",
            color: "text.secondary",
            justifyContent: "flex-start",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <SearchIcon sx={{ fontSize: 18 }} />
          <Typography variant="body2" sx={{ flex: 1, textAlign: "left" }}>
            {t("globalSearch.open")}
          </Typography>
          <Typography variant="caption" sx={{ fontVariantNumeric: "tabular-nums" }}>
            {shortcut}
          </Typography>
        </ButtonBase>
      )}
      <CommandPalette open={open} onClose={() => setOpen(false)} commands={commands} />
    </>
  );
};

export default GlobalSearch;
