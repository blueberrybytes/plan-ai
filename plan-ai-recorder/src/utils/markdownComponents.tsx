import type React from "react";
import type { Components } from "react-markdown";

// Markdown here comes from the AI and from meeting content. A link in it must
// never navigate the app window: it opens in the system browser, and only for
// https, http and mailto (the main process enforces the same list).
const EXTERNAL_LINK = /^(https?:|mailto:)/i;

const MarkdownLink = ({
  href,
  children,
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) => {
  if (!href || !EXTERNAL_LINK.test(href)) return <span>{children}</span>;
  return (
    <a
      href={href}
      rel="noopener noreferrer"
      onClick={(event) => {
        event.preventDefault();
        void window.electron?.openExternalUrl?.(href);
      }}
    >
      {children}
    </a>
  );
};

export const markdownComponents: Components = {
  a: MarkdownLink,
};
