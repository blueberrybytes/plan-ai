import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import { Box, Divider, IconButton, Tooltip } from "@mui/material";
import {
  Code as CodeIcon,
  FormatBold as BoldIcon,
  FormatItalic as ItalicIcon,
  FormatListBulleted as BulletIcon,
  FormatListNumbered as NumberedIcon,
  FormatQuote as QuoteIcon,
  Title as HeadingIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";

export interface NoteBodyEditorHandle {
  focus: () => void;
}

interface NoteBodyEditorProps {
  /** Markdown shown when the editor mounts, and again each time `revision` changes. */
  markdown: string;
  revision: number;
  editable: boolean;
  placeholder: string;
  autoFocus?: boolean;
  onChange: (markdown: string) => void;
}

const readMarkdown = (editor: Editor): string =>
  (
    (editor.storage as unknown as Record<string, unknown>).markdown as MarkdownStorage
  ).getMarkdown();

interface FormatButton {
  key: string;
  icon: React.ReactElement;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

const FORMAT_BUTTONS: FormatButton[] = [
  {
    key: "bold",
    icon: <BoldIcon fontSize="small" />,
    isActive: (e) => e.isActive("bold"),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    key: "italic",
    icon: <ItalicIcon fontSize="small" />,
    isActive: (e) => e.isActive("italic"),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    key: "heading",
    icon: <HeadingIcon fontSize="small" />,
    isActive: (e) => e.isActive("heading", { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    key: "bulletList",
    icon: <BulletIcon fontSize="small" />,
    isActive: (e) => e.isActive("bulletList"),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    key: "orderedList",
    icon: <NumberedIcon fontSize="small" />,
    isActive: (e) => e.isActive("orderedList"),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    key: "quote",
    icon: <QuoteIcon fontSize="small" />,
    isActive: (e) => e.isActive("blockquote"),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    key: "code",
    icon: <CodeIcon fontSize="small" />,
    isActive: (e) => e.isActive("codeBlock"),
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
];

const FormatBar: React.FC<{ editor: Editor }> = ({ editor }) => {
  const { t } = useTranslation();
  // Re-render the buttons when the selection moves into or out of a format.
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => FORMAT_BUTTONS.map((button) => button.isActive(current)),
    equalityFn: (a, b) => !!b && a.every((value, i) => value === b[i]),
  });
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.25, py: 0.5 }}>
      {FORMAT_BUTTONS.map((button, index) => (
        <React.Fragment key={button.key}>
          {index === 3 && <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />}
          <Tooltip title={t(`notes.format.${button.key}`)}>
            <IconButton
              size="small"
              aria-label={t(`notes.format.${button.key}`)}
              color={active[index] ? "primary" : "default"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => button.run(editor)}
            >
              {button.icon}
            </IconButton>
          </Tooltip>
        </React.Fragment>
      ))}
    </Box>
  );
};

/** Markdown editor for a note body: TipTap with a small set of formats. */
const NoteBodyEditor = forwardRef<NoteBodyEditorHandle, NoteBodyEditorProps>(
  ({ markdown, revision, editable, placeholder, autoFocus = false, onChange }, ref) => {
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const editor = useEditor({
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
        Placeholder.configure({ placeholder }),
        Markdown.configure({ html: false, transformPastedText: true }),
      ],
      content: markdown,
      editable,
      autofocus: autoFocus ? "end" : false,
      onUpdate: ({ editor: current }) => onChangeRef.current(readMarkdown(current)),
    });

    useImperativeHandle(ref, () => ({ focus: () => editor?.commands.focus("end") }), [editor]);

    // Load new text from outside (a version from the server) without
    // reporting it back as a user edit.
    const lastRevision = useRef(revision);
    useEffect(() => {
      if (!editor || revision === lastRevision.current) return;
      lastRevision.current = revision;
      editor.commands.setContent(markdown, { emitUpdate: false });
    }, [editor, revision, markdown]);

    useEffect(() => {
      if (editor && editor.isEditable !== editable) editor.setEditable(editable);
    }, [editor, editable]);

    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          "& .tiptap": {
            minHeight: 240,
            outline: "none",
            fontSize: "1rem",
            lineHeight: 1.7,
            "& p": { my: 0.75 },
            "& h1, & h2, & h3": { mt: 2, mb: 1, lineHeight: 1.3 },
            "& ul, & ol": { pl: 3 },
            "& blockquote": {
              borderLeft: "3px solid",
              borderColor: "primary.main",
              pl: 2,
              ml: 0,
              color: "text.secondary",
            },
            "& pre": {
              bgcolor: "action.hover",
              p: 1.5,
              borderRadius: 1,
              overflowX: "auto",
              fontSize: "0.875rem",
            },
            "& code": { fontSize: "0.875em" },
            "& p.is-editor-empty:first-of-type::before": {
              content: "attr(data-placeholder)",
              color: "text.disabled",
              float: "left",
              height: 0,
              pointerEvents: "none",
            },
          },
        }}
      >
        {editor && editable && <FormatBar editor={editor} />}
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <EditorContent editor={editor} />
        </Box>
      </Box>
    );
  },
);

NoteBodyEditor.displayName = "NoteBodyEditor";

export default NoteBodyEditor;
