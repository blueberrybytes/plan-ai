import React from "react";
import { Box, SxProps } from "@mui/material";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MarkdownRendererProps {
  content: string;
  sx?: SxProps;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, sx }) => {
  return (
    <Box
      sx={{
        "& table": {
          borderCollapse: "collapse",
          width: "100%",
          my: 2,
        },
        "& th, & td": {
          border: 1,
          borderColor: "divider",
          p: 1,
        },
        "& h1, & h2, & h3, & h4, & h5, & h6": {
          color: "primary.main",
          fontWeight: 600,
          mt: 3,
          mb: 1.5,
        },
        "& a": {
          color: "secondary.main",
          textDecoration: "none",
          "&:hover": {
            textDecoration: "underline",
          },
        },
        "& blockquote": {
          borderLeft: "4px solid",
          borderColor: "primary.light",
          bgcolor: "background.default",
          m: 1,
          p: 2,
          color: "text.secondary",
          fontStyle: "italic",
          borderRadius: 1,
        },
        "& strong": {
          color: "primary.light",
        },
        "& pre": {
          m: 0,
          p: 0,
          bgcolor: "transparent !important",
        },
        ...sx,
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          code({ className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match;
            const language = match ? match[1] : "";
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const Component = SyntaxHighlighter as any;
            return !isInline ? (
              <Component style={vscDarkPlus} language={language} PreTag="div" {...props}>
                {String(children).replace(/\n$/, "")}
              </Component>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </Box>
  );
};

export default MarkdownRenderer;
