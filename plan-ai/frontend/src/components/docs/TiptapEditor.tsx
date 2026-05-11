/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Box, IconButton, Tooltip, Divider } from "@mui/material";
import {
  FormatBold,
  FormatItalic,
  FormatStrikethrough,
  Code,
  FormatListBulleted,
  FormatListNumbered,
  FormatQuote,
  HorizontalRule,
  Undo,
  Redo,
  TableChart,
} from "@mui/icons-material";

interface TiptapEditorProps {
  content: string;
  onSave: (markdown: string) => void;
}

const MenuBar = ({ editor }: { editor: Editor | null }) => {
  if (!editor) return null;

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 0.5,
        p: 1,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Tooltip title="Bold">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          color={editor.isActive("bold") ? "primary" : "default"}
        >
          <FormatBold fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Italic">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          color={editor.isActive("italic") ? "primary" : "default"}
        >
          <FormatItalic fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Strike">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={!editor.can().chain().focus().toggleStrike().run()}
          color={editor.isActive("strike") ? "primary" : "default"}
        >
          <FormatStrikethrough fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Code">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleCode().run()}
          disabled={!editor.can().chain().focus().toggleCode().run()}
          color={editor.isActive("code") ? "primary" : "default"}
        >
          <Code fontSize="small" />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      <Tooltip title="Heading 1">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          color={editor.isActive("heading", { level: 1 }) ? "primary" : "default"}
          sx={{ fontWeight: 700, fontSize: "0.875rem" }}
        >
          H1
        </IconButton>
      </Tooltip>
      <Tooltip title="Heading 2">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          color={editor.isActive("heading", { level: 2 }) ? "primary" : "default"}
          sx={{ fontWeight: 700, fontSize: "0.875rem" }}
        >
          H2
        </IconButton>
      </Tooltip>
      <Tooltip title="Heading 3">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          color={editor.isActive("heading", { level: 3 }) ? "primary" : "default"}
          sx={{ fontWeight: 700, fontSize: "0.875rem" }}
        >
          H3
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      <Tooltip title="Bullet List">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          color={editor.isActive("bulletList") ? "primary" : "default"}
        >
          <FormatListBulleted fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Ordered List">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          color={editor.isActive("orderedList") ? "primary" : "default"}
        >
          <FormatListNumbered fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Blockquote">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          color={editor.isActive("blockquote") ? "primary" : "default"}
        >
          <FormatQuote fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Horizontal Rule">
        <IconButton size="small" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <HorizontalRule fontSize="small" />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      <Tooltip title="Undo">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().chain().focus().undo().run()}
        >
          <Undo fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Redo">
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().chain().focus().redo().run()}
        >
          <Redo fontSize="small" />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      <Tooltip title="Insert Table">
        <IconButton
          size="small"
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          <TableChart fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

const TiptapEditor: React.FC<TiptapEditorProps> = ({ content, onSave }) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: content,
    onUpdate: ({ editor }) => {
      const storageObj = editor.storage as Record<string, any>;
      const newMarkdown = (storageObj.markdown as MarkdownStorage).getMarkdown();
      onSave(newMarkdown);
    },
    editorProps: {
      attributes: {
        class: "prose max-w-none focus:outline-none",
      },
    },
  });

  useEffect(() => {
    const storageObj = editor?.storage as Record<string, any> | undefined;
    if (
      editor &&
      storageObj?.markdown &&
      content !== (storageObj.markdown as MarkdownStorage).getMarkdown() &&
      !editor.isFocused
    ) {
      // Prevent cursor jumping by only updating when not focused
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  useEffect(() => {
    if (!editor) return;

    const handleBlur = () => {
      const storageObj = editor.storage as Record<string, any> | undefined;
      // If we clicked out and there are pending backend changes that didn't apply because we were focused
      if (
        storageObj?.markdown &&
        content !== (storageObj.markdown as MarkdownStorage).getMarkdown()
      ) {
        editor.commands.setContent(content);
      }
    };

    editor.on("blur", handleBlur);
    return () => {
      editor.off("blur", handleBlur);
    };
  }, [editor, content]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        "& .tiptap": {
          flex: 1,
          p: 2,
          overflowY: "auto",
          minHeight: "300px",
          fontFamily: "inherit",
          "& p": {
            marginTop: 0,
          },
          "& table": {
            borderCollapse: "collapse",
            tableLayout: "fixed",
            width: "100%",
            margin: 0,
            overflow: "hidden",
          },
          "& td, & th": {
            minWidth: "1em",
            border: "1px solid",
            borderColor: "divider",
            padding: "6px 8px",
            verticalAlign: "top",
            boxSizing: "border-box",
            position: "relative",
            "> *": {
              marginBottom: 0,
            },
          },
          "& th": {
            fontWeight: "bold",
            textAlign: "left",
            backgroundColor: "action.hover",
          },
          "& .selectedCell:after": {
            zIndex: 2,
            position: "absolute",
            content: '""',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            background: "rgba(200, 200, 255, 0.4)",
            pointerEvents: "none",
          },
          "& .column-resize-handle": {
            position: "absolute",
            right: "-2px",
            top: 0,
            bottom: "-2px",
            width: "4px",
            backgroundColor: "primary.main",
            pointerEvents: "none",
          },
          "& pre": {
            background: "#1e1e1e",
            color: "#d4d4d4",
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            overflowX: "auto",
            "& code": {
              color: "inherit",
              p: 0,
              background: "none",
              fontSize: "0.875rem",
            },
          },
          "& code": {
            color: "#e83e8c",
            backgroundColor: "action.hover",
            padding: "0.2rem 0.4rem",
            borderRadius: "4px",
            fontSize: "85%",
          },
          "& blockquote": {
            borderLeft: "3px solid",
            borderColor: "primary.main",
            pl: 2,
            ml: 0,
            fontStyle: "italic",
            color: "text.secondary",
          },
        },
      }}
    >
      <MenuBar editor={editor} />
      <Box sx={{ flex: 1, overflowY: "auto", bgcolor: "background.paper" }}>
        <EditorContent editor={editor} style={{ minHeight: "100%" }} />
      </Box>
    </Box>
  );
};

export default TiptapEditor;
