import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  InputAdornment,
  List,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add as AddIcon, Search as SearchIcon, Today as TodayIcon } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useListNotesQuery, type Note, type NoteScope } from "../../store/apis/notesApi";
import NoteListItem from "./NoteListItem";
import { NoteEmptyState, NoteListSkeleton } from "./NoteListStates";
import { useDebouncedValue } from "./useDebouncedValue";

export const NOTE_TABS: NoteScope[] = ["inbox", "all", "pinned", "shared", "trash"];
const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

interface NoteListPanelProps {
  scope: NoteScope;
  onScopeChange: (scope: NoteScope) => void;
  selectedId: string | null;
  onSelect: (note: Note) => void;
  onNew: () => void;
  onToday: () => void;
  todayLoading: boolean;
}

const NoteListPanel: React.FC<NoteListPanelProps> = ({
  scope,
  onScopeChange,
  selectedId,
  onSelect,
  onNew,
  onToday,
  todayLoading,
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);
  const [limit, setLimit] = useState(PAGE_SIZE);

  // A new tab or search starts again from the first page.
  useEffect(() => setLimit(PAGE_SIZE), [scope, q]);

  const { data, currentData, isFetching, isError, refetch } = useListNotesQuery({
    scope,
    limit,
    ...(q ? { q } : {}),
  });
  // A new tab or search must not show the previous list while it loads.
  // "Load more" keeps the rows already on screen.
  const shown = limit > PAGE_SIZE ? data : currentData;
  const notes = shown?.notes ?? [];
  const isLoading = !shown && isFetching;
  const canLoadMore = Boolean(shown?.nextCursor) && limit < MAX_PAGE_SIZE;

  const renderBody = () => {
    if (isLoading) return <NoteListSkeleton />;
    if (isError) {
      return (
        <Alert
          severity="error"
          sx={{ m: 1.5 }}
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              {t("notes.retry")}
            </Button>
          }
        >
          {t("notes.loadFailed")}
        </Alert>
      );
    }
    if (notes.length === 0) {
      return q ? (
        <NoteEmptyState title={t("notes.empty.search")} />
      ) : (
        <NoteEmptyState
          title={t(`notes.empty.${scope}.title`)}
          body={t(`notes.empty.${scope}.body`)}
          actionLabel={scope === "trash" ? undefined : t("notes.newNote")}
          onAction={scope === "trash" ? undefined : onNew}
        />
      );
    }
    return (
      <>
        <List disablePadding sx={{ px: 1 }}>
          {notes.map((note) => (
            <NoteListItem
              key={note.id}
              note={note}
              selected={note.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </List>
        {canLoadMore && (
          <Box sx={{ textAlign: "center", py: 1 }}>
            <Button
              size="small"
              disabled={isFetching}
              onClick={() => setLimit((current) => Math.min(current + PAGE_SIZE, MAX_PAGE_SIZE))}
            >
              {t("notes.loadMore")}
            </Button>
          </Box>
        )}
      </>
    );
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <Stack spacing={1.5} sx={{ px: 2, pt: 2, pb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
            {t("notes.title")}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<TodayIcon />}
            onClick={onToday}
            disabled={todayLoading}
          >
            {t("notes.today")}
          </Button>
          <Tooltip title={t("notes.shortcutHint")}>
            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={onNew}>
              {t("notes.newNote")}
            </Button>
          </Tooltip>
        </Box>
        <TextField
          size="small"
          fullWidth
          value={search}
          placeholder={t("notes.searchPlaceholder")}
          onChange={(event) => setSearch(event.target.value)}
          inputProps={{ "aria-label": t("notes.searchPlaceholder") }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Stack>
      <Tabs
        value={scope}
        onChange={(_, value: NoteScope) => onScopeChange(value)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ px: 1, minHeight: 40, borderBottom: 1, borderColor: "divider" }}
      >
        {NOTE_TABS.map((tab) => (
          <Tab
            key={tab}
            value={tab}
            label={t(`notes.tabs.${tab}`)}
            sx={{ minHeight: 40, minWidth: 0, px: 1.5, textTransform: "none" }}
          />
        ))}
      </Tabs>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", py: 1 }}>{renderBody()}</Box>
    </Box>
  );
};

export default NoteListPanel;
