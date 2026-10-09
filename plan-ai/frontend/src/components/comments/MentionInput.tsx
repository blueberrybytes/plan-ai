import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ListItemText, MenuItem, MenuList, Paper, Popper, TextField } from "@mui/material";
import {
  filterCandidates,
  insertMention,
  mentionQueryAt,
  type MentionCandidate,
  type PickedMention,
} from "./mentions";

interface MentionInputProps {
  value: string;
  onChange: (text: string) => void;
  /** Called when someone is picked from the list. The parent keeps the list of picked people. */
  onPick: (mention: PickedMention) => void;
  candidates: MentionCandidate[];
  /** Ctrl+Enter or Cmd+Enter. */
  onSubmit?: () => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
}

/**
 * A multiline text field where typing `@` opens a short list of workspace
 * members. Arrow keys move, Enter or Tab picks, Escape closes. The field
 * holds plain text: a picked person shows as `@Name`.
 */
const MentionInput: React.FC<MentionInputProps> = ({
  value,
  onChange,
  onPick,
  candidates,
  onSubmit,
  label,
  placeholder,
  disabled,
  autoFocus,
  maxLength,
}) => {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [caret, setCaret] = useState(0);
  const [highlighted, setHighlighted] = useState(0);
  // Set by Escape, so the list stays closed until the text changes.
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  // Where to put the caret after a pick, once React has written the new text.
  const pendingCaret = useRef<number | null>(null);

  const active = useMemo(() => mentionQueryAt(value, caret), [value, caret]);
  const matches = useMemo(
    () => (active ? filterCandidates(candidates, active.query) : []),
    [active, candidates],
  );
  const open = !disabled && matches.length > 0 && dismissedAt !== value;
  const index = Math.min(highlighted, Math.max(matches.length - 1, 0));

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !inputRef.current) return;
    const position = pendingCaret.current;
    pendingCaret.current = null;
    inputRef.current.setSelectionRange(position, position);
    setCaret(position);
  }, [value]);

  const syncCaret = () => setCaret(inputRef.current?.selectionStart ?? value.length);

  const pick = (candidate: MentionCandidate) => {
    if (!active) return;
    const next = insertMention(value, active.start, caret, candidate.name);
    pendingCaret.current = next.caret;
    onPick({ userId: candidate.userId, name: candidate.name });
    onChange(next.text);
    setHighlighted(0);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setHighlighted((index + step + matches.length) % matches.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(matches[index]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setDismissedAt(value);
        return;
      }
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && onSubmit) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <>
      <TextField
        ref={anchorRef}
        inputRef={inputRef}
        value={value}
        onChange={(event) => {
          setCaret(event.target.selectionStart ?? event.target.value.length);
          setHighlighted(0);
          onChange(event.target.value);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        label={label}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        multiline
        minRows={2}
        maxRows={8}
        fullWidth
        size="small"
        inputProps={{
          maxLength,
          "aria-autocomplete": "list",
          "aria-expanded": open,
        }}
      />
      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        <Paper variant="outlined" sx={{ mt: 0.5, minWidth: 240, maxWidth: 360 }}>
          <MenuList dense disablePadding role="listbox">
            {matches.map((candidate, i) => (
              <MenuItem
                key={candidate.userId}
                role="option"
                selected={i === index}
                aria-selected={i === index}
                // Mouse down, not click: the field must not lose focus first.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(candidate);
                }}
                onMouseEnter={() => setHighlighted(i)}
              >
                <ListItemText
                  primary={candidate.name}
                  secondary={candidate.email}
                  primaryTypographyProps={{ variant: "body2", noWrap: true }}
                  secondaryTypographyProps={{ variant: "caption", noWrap: true }}
                />
              </MenuItem>
            ))}
          </MenuList>
        </Paper>
      </Popper>
    </>
  );
};

export default MentionInput;
