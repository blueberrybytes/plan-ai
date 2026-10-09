import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Dialog, InputBase, LinearProgress, Typography, alpha } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSearchWorkspaceQuery } from "../../store/apis/searchApi";
import { useDebouncedValue } from "../notes/useDebouncedValue";
import {
  SEARCH_DEBOUNCE_MS,
  flattenGroups,
  formatHitTime,
  groupHits,
  hitRoute,
  moveSelection,
  paletteMode,
  type NavCommand,
  type PaletteKey,
} from "./searchPalette";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Shown before the user types: the pages of the sidebar. */
  commands: NavCommand[];
}

interface Row {
  key: string;
  path: string;
  title: string;
  snippet?: string | null;
  /** Small text on the right: the project, the moment of the recording. */
  detail?: string;
  /** Title of the group this row starts, when it starts one. */
  heading?: string;
}

const MOVE_KEYS: readonly string[] = ["ArrowDown", "ArrowUp", "Home", "End"];
const SEARCH_LIMIT = 20;

/**
 * One box to search the workspace and to jump to a page. Type to search
 * meetings, tasks, documents and projects. Empty, it lists the pages.
 */
const CommandPalette = ({ open, onClose, commands }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const debounced = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const mode = paletteMode(query);
  const searching = mode === "search" && paletteMode(debounced) === "search";
  const { data, isFetching, isError } = useSearchWorkspaceQuery(
    { q: debounced, limit: SEARCH_LIMIT },
    { skip: !open || !searching },
  );
  // The text on screen is ahead of the request while the user types.
  const waiting = mode === "search" && (isFetching || debounced !== query.trim());

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
    }
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    if (mode === "commands") {
      return commands.map((command, index) => ({
        key: `go:${command.path}`,
        path: command.path,
        title: t(command.labelKey),
        heading: index === 0 ? t("globalSearch.commandsTitle") : undefined,
      }));
    }
    if (!searching || isError) return [];
    const groups = groupHits(data?.data?.hits ?? []);
    const starts = new Map(groups.map((group) => [group.hits[0], group.type]));
    return flattenGroups(groups).map((hit) => {
      const startOf = starts.get(hit);
      const detail = [
        hit.type !== "project" ? hit.projectTitle : null,
        hit.atSeconds !== undefined
          ? t("globalSearch.at", { time: formatHitTime(hit.atSeconds) })
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        key: `${hit.type}:${hit.id}`,
        path: hitRoute(hit),
        title: hit.title || t("globalSearch.untitledMeeting"),
        snippet: hit.snippet,
        detail: detail || undefined,
        heading: startOf ? t(`globalSearch.groups.${startOf}`) : undefined,
      };
    });
  }, [mode, commands, searching, isError, data, t]);

  // A new list starts at its first row.
  const rowKeys = rows.map((row) => row.key).join("|");
  useEffect(() => {
    setSelected(0);
  }, [rowKeys]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${selected}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  const go = (row: Row | undefined) => {
    if (!row) return;
    onClose();
    navigate(row.path);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (MOVE_KEYS.includes(event.key)) {
      event.preventDefault();
      setSelected((current) => moveSelection(current, rows.length, event.key as PaletteKey));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(rows[selected]);
    }
    // Escape is handled by the dialog.
  };

  const showEmpty = searching && !waiting && !isError && rows.length === 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-label={t("globalSearch.open")}
      sx={{ "& .MuiDialog-container": { alignItems: "flex-start" } }}
      PaperProps={{ sx: { mt: "12vh", borderRadius: "12px", backgroundImage: "none" } }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          py: 1.25,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <SearchIcon fontSize="small" sx={{ color: "text.secondary" }} />
        <InputBase
          autoFocus
          fullWidth
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("globalSearch.placeholder")}
          inputProps={{
            "aria-label": t("globalSearch.placeholder"),
            maxLength: 200,
            role: "combobox",
            "aria-expanded": rows.length > 0,
            "aria-controls": "global-search-results",
            "aria-activedescendant": rows[selected] ? `global-search-row-${selected}` : undefined,
          }}
        />
      </Box>
      <Box sx={{ height: 2 }}>{waiting && <LinearProgress sx={{ height: 2 }} />}</Box>

      <Box
        ref={listRef}
        id="global-search-results"
        role="listbox"
        sx={{ maxHeight: "56vh", overflowY: "auto", px: 1, pb: 1 }}
      >
        {mode === "tooShort" && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 2 }}>
            {t("globalSearch.tooShort")}
          </Typography>
        )}
        {searching && isError && !waiting && (
          <Alert severity="error" sx={{ m: 1 }}>
            {t("globalSearch.error")}
          </Alert>
        )}
        {showEmpty && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 2 }}>
            {t("globalSearch.empty", { query: debounced })}
          </Typography>
        )}
        {mode === "search" && waiting && rows.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 2 }}>
            {t("globalSearch.loading")}
          </Typography>
        )}

        {rows.map((row, index) => (
          <React.Fragment key={row.key}>
            {row.heading && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", px: 1, pt: 1.5, pb: 0.5, fontWeight: 700 }}
              >
                {row.heading}
              </Typography>
            )}
            <Box
              id={`global-search-row-${index}`}
              data-row={index}
              role="option"
              aria-selected={index === selected}
              onMouseMove={() => setSelected(index)}
              onClick={() => go(row)}
              sx={{
                px: 1,
                py: 0.75,
                borderRadius: "8px",
                cursor: "pointer",
                bgcolor:
                  index === selected
                    ? (theme) => alpha(theme.palette.primary.main, 0.12)
                    : "transparent",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600, flex: 1, minWidth: 0 }}>
                  {row.title}
                </Typography>
                {row.detail && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    noWrap
                    sx={{ flexShrink: 0, maxWidth: "45%" }}
                  >
                    {row.detail}
                  </Typography>
                )}
              </Box>
              {row.snippet && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {row.snippet}
                </Typography>
              )}
            </Box>
          </React.Fragment>
        ))}
      </Box>

      <Box sx={{ px: 2, py: 0.75, borderTop: "1px solid", borderColor: "divider" }}>
        <Typography variant="caption" color="text.secondary">
          {t("globalSearch.hint")}
        </Typography>
      </Box>
    </Dialog>
  );
};

export default CommandPalette;
