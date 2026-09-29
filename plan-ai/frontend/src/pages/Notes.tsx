import React, { useCallback, useEffect, useState } from "react";
import { Box, useMediaQuery, useTheme } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import SidebarLayout from "../components/layout/SidebarLayout";
import NoteListPanel from "../components/notes/NoteListPanel";
import NoteEditorPane from "../components/notes/NoteEditorPane";
import { NoteEmptyState } from "../components/notes/NoteListStates";
import {
  isTypingTarget,
  localDateKey,
  makeDraftNote,
  newNoteId,
} from "../components/notes/noteUtils";
import { useLazyGetPeriodNoteQuery, type Note, type NoteScope } from "../store/apis/notesApi";
import { setToastMessage } from "../store/slices/app/appSlice";

/** Notes: a list on the left and the editor on the right (one at a time on a phone). */
const Notes: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("note");
  const [scope, setScope] = useState<NoteScope>("inbox");
  const [draft, setDraft] = useState<Note | null>(null);
  const [loadPeriodNote, { isFetching: todayLoading }] = useLazyGetPeriodNoteQuery();

  const select = useCallback(
    (id: string | null) =>
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        if (id) next.set("note", id);
        else next.delete("note");
        return next;
      }),
    [setSearchParams],
  );

  const handleNew = useCallback(() => {
    const id = newNoteId();
    setDraft(makeDraftNote(id));
    select(id);
  }, [select]);

  const handleToday = async () => {
    try {
      const note = await loadPeriodNote({ period: "DAY", date: localDateKey() }).unwrap();
      select(note.id);
    } catch {
      dispatch(setToastMessage({ severity: "error", message: t("notes.toast.todayFailed") }));
    }
  };

  // "n" starts a new note, unless the user is typing somewhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "n" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target) || document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      handleNew();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNew]);

  const showList = !isMobile || !selectedId;
  const showEditor = !isMobile || Boolean(selectedId);

  return (
    <SidebarLayout fullHeight>
      <Box sx={{ display: "flex", height: "100%", minHeight: 0, width: "100%" }}>
        {showList && (
          <Box
            component="aside"
            sx={{
              width: { xs: "100%", md: 340 },
              flexShrink: 0,
              height: "100%",
              borderRight: { md: 1 },
              borderColor: { md: "divider" },
            }}
          >
            <NoteListPanel
              scope={scope}
              onScopeChange={setScope}
              selectedId={selectedId}
              onSelect={(note) => select(note.id)}
              onNew={handleNew}
              onToday={handleToday}
              todayLoading={todayLoading}
            />
          </Box>
        )}
        {showEditor && (
          <Box component="main" sx={{ flex: 1, minWidth: 0, height: "100%" }}>
            {selectedId ? (
              <NoteEditorPane
                key={selectedId}
                noteId={selectedId}
                draft={draft?.id === selectedId ? draft : null}
                onBack={isMobile ? () => select(null) : undefined}
                onRemoved={() => select(null)}
              />
            ) : (
              <Box
                sx={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <NoteEmptyState
                  title={t("notes.selectHint")}
                  body={t("notes.shortcutHint")}
                  actionLabel={t("notes.newNote")}
                  onAction={handleNew}
                />
              </Box>
            )}
          </Box>
        )}
      </Box>
    </SidebarLayout>
  );
};

export default Notes;
