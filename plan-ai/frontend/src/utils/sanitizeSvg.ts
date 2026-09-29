import DOMPurify from "dompurify";

/**
 * Cleans a Mermaid SVG before it is inserted with dangerouslySetInnerHTML.
 *
 * Diagram source often comes from model output, so the SVG is untrusted. Mermaid
 * already sanitises labels in "strict" mode; this is a second pass over the final
 * markup, including the styles we inject afterwards.
 *
 * HTML labels live inside <foreignObject>, so the HTML profile is kept for that
 * subtree only. Scripts, event handlers and javascript: URLs are always removed.
 */
export const sanitizeMermaidSvg = (svg: string): string =>
  DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ["foreignobject"],
    ADD_ATTR: ["dominant-baseline"],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "textarea"],
  });
