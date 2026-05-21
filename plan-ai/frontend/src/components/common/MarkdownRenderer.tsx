import React, { useRef, useState } from "react";
import { Box, IconButton, SxProps, Tooltip } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Link as RouterLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MermaidRenderer from "./MermaidRenderer";

const CopyButton: React.FC<{
  getText: () => string;
  title: string;
  position?: "top-right" | "bottom-right";
}> = ({ getText, title, position = "top-right" }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API failed (e.g. insecure context) — silently ignore.
    }
  };

  return (
    <Tooltip title={copied ? t("chat.window.copied") : title} placement="left">
      <IconButton
        size="small"
        onClick={handleCopy}
        sx={{
          position: "absolute",
          ...(position === "bottom-right" ? { bottom: 8, right: 8 } : { top: 8, right: 8 }),
          zIndex: 2,
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
          boxShadow: 1,
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        {copied ? (
          <CheckIcon fontSize="small" color="success" />
        ) : (
          <ContentCopyIcon fontSize="small" />
        )}
      </IconButton>
    </Tooltip>
  );
};

const TableWithCopy: React.FC<{ children: React.ReactNode; tableProps: Record<string, unknown> }> = ({
  children,
  tableProps,
}) => {
  const { t } = useTranslation();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const getTableText = () => {
    const tableEl = wrapperRef.current?.querySelector("table");
    if (!tableEl) return "";
    const rows = Array.from(tableEl.querySelectorAll("tr"));
    return rows
      .map((row) =>
        Array.from(row.querySelectorAll("th, td"))
          .map((cell) => (cell.textContent || "").trim().replace(/[\t\n\r]+/g, " "))
          .join("\t"),
      )
      .join("\n");
  };

  return (
    <Box
      sx={{
        position: "relative",
        my: 2,
        maxWidth: "100%",
      }}
    >
      <Box
        ref={wrapperRef}
        sx={{
          maxWidth: "100%",
          overflowX: "auto",
          overscrollBehaviorX: "contain",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
        }}
      >
        <table
          {...tableProps}
          style={{
            borderCollapse: "collapse",
            width: "max-content",
            minWidth: "100%",
          }}
        >
          {children}
        </table>
      </Box>
      <CopyButton getText={getTableText} title={t("chat.window.copyTable")} position="bottom-right" />
    </Box>
  );
};

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
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        maxWidth: "100%",
        minWidth: 0,
        overflow: "hidden",
        "& th, & td": {
          border: 1,
          borderColor: "divider",
          p: 1,
          whiteSpace: "nowrap",
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
        "& p, & li": {
          overflowWrap: "anywhere",
          wordBreak: "break-word",
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
          table: ({ children, ...props }: any) => (
            <TableWithCopy tableProps={props}>{children}</TableWithCopy>
          ),
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
            if (isInline) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }

            const codeText = String(children).replace(/\n$/, "");
            return (
              <Box
                sx={{
                  position: "relative",
                  my: 2,
                  maxWidth: "100%",
                }}
              >
                <CopyButton getText={() => codeText} title={t("chat.window.copyCode")} />
                <Box
                  sx={{
                    maxWidth: "100%",
                    overflowX: "auto",
                    overscrollBehaviorX: "contain",
                    borderRadius: 1,
                    "& > div, & pre": {
                      m: "0 !important",
                      borderRadius: 1,
                    },
                  }}
                >
                  <Component style={vscDarkPlus} language={language} PreTag="div" {...props}>
                    {codeText}
                  </Component>
                </Box>
              </Box>
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
