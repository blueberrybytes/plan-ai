import { md2docx } from "@m2d/md2docx";
import { marked } from "marked";

/**
 * Utility class for converting markdown content into distributable document formats.
 * Used by the cloud storage integrations (Google Drive, OneDrive) to export
 * meeting artifacts, transcripts, and AI-generated documents.
 *
 * NOTE: The frontend already has a client-side docx exporter using @mohtasham/md-to-docx
 * (see frontend/src/utils/docxExport.ts). This backend version exists for server-side
 * cloud storage uploads where no browser/DOM is available.
 */
export class DocumentGenerator {
  /**
   * Converts markdown text into a styled HTML document suitable for Google Docs upload.
   * Uses the `marked` library (transitive dep of @m2d/md2docx) for full GFM support.
   */
  public static async generateHtml(markdown: string): Promise<string> {
    const bodyHtml = await marked.parse(markdown, { gfm: true, breaks: true });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 1.75rem; border-bottom: 2px solid #e0e0e0; padding-bottom: 0.3rem; }
    h2 { font-size: 1.4rem; border-bottom: 1px solid #e8e8e8; padding-bottom: 0.25rem; }
    h3 { font-size: 1.15rem; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
    pre { background: #f4f4f4; padding: 1rem; border-radius: 6px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #6c63ff; margin: 1rem 0; padding: 0.5rem 1rem; background: #f9f9ff; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f4f4f4; font-weight: 600; }
    img { max-width: 100%; height: auto; }
    ul, ol { padding-left: 1.5rem; }
    a { color: #6c63ff; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
  }

  /**
   * Converts markdown text into a Buffer containing a .docx file.
   * Supports GFM tables, task lists, math (LaTeX), and Mermaid diagrams.
   *
   * Uses @m2d/md2docx which is built on the unified/remark ecosystem
   * (already a dependency of the backend).
   */
  public static async generateDocx(markdown: string): Promise<Buffer> {
    const result = await md2docx(
      markdown,
      // Document-level metadata
      {
        title: "Plan AI — Generated Document",
        creator: "Plan AI",
      },
      // Section props — use library defaults (Letter, 1-inch margins)
      undefined,
      // Output type — Node.js Buffer (docx uses "nodebuffer" as the key)
      "nodebuffer",
    );

    return result as Buffer;
  }
}
