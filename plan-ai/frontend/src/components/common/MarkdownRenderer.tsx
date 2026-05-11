import React from "react";
import { Box, SxProps } from "@mui/material";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Link as RouterLink } from "react-router-dom";
import MermaidRenderer from "./MermaidRenderer";

interface MarkdownRendererProps {
  content: string;
  sx?: SxProps;
  theme?: {
    primaryColor?: string;
    secondaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
    headingFont?: string;
    bodyFont?: string;
    logoUrl?: string | null;
  } | null;
  onFixDiagram?: (brokenChart: string) => void;
  isFixing?: boolean;
  isStreaming?: boolean;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  sx,
  theme,
  onFixDiagram,
  isFixing,
  isStreaming,
}) => {
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
          color: theme?.primaryColor || "primary.main",
          fontWeight: 600,
          mt: 3,
          mb: 1.5,
        },
        "& a": {
          color: theme?.secondaryColor || theme?.primaryColor || "secondary.main",
          textDecoration: "none",
          "&:hover": {
            textDecoration: "underline",
          },
        },
        "& blockquote": {
          borderLeft: "4px solid",
          borderColor: theme?.primaryColor || "primary.light",
          bgcolor: theme?.backgroundColor || "background.default",
          m: 1,
          p: 2,
          color: theme?.textColor || "text.secondary",
          fontStyle: "italic",
          borderRadius: 1,
        },
        "& strong": {
          color: theme?.primaryColor || "primary.light",
        },
        "& pre": {
          m: 0,
          p: 0,
          bgcolor: "transparent !important",
          overflowX: "auto",
        },
        "& .mermaid-container": {
          my: 4,
          display: "flex",
          justifyContent: "center",
          "& svg": {
            minWidth: "60%",
            maxWidth: "100%",
            height: "auto",
          },
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

            if (language === "mermaid") {
              const chart = String(children).replace(/\n$/, "");
              
              if (isStreaming) {
                // Return plain text while streaming to prevent aggressive mermaid re-renders crashing
                return (
                  <Box
                    sx={{
                      p: 2,
                      bgcolor: "action.hover",
                      borderRadius: 1,
                      fontFamily: "monospace",
                      whiteSpace: "pre-wrap",
                      fontSize: "0.85rem",
                      border: "1px dashed",
                      borderColor: "divider",
                    }}
                  >
                    {chart}
                  </Box>
                );
              }

              return (
                <MermaidRenderer
                  chart={chart}
                  theme={theme}
                  onFixDiagram={onFixDiagram ? () => onFixDiagram(chart) : undefined}
                  isFixing={isFixing}
                />
              );
            }

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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          a({ href, children, ...props }: any) {
            // If the link is internal (starts with /), use React Router
            if (href && href.startsWith("/")) {
              return (
                <RouterLink to={href} {...props}>
                  {children}
                </RouterLink>
              );
            }
            // For external links, use a standard anchor tag with target="_blank"
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
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
