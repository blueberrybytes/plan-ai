import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { parse } from "parse5";
import * as cheerio from "cheerio";
import { logger } from "./logger";

/**
 * Sanitizes LLM-authored HTML before it is stored or served.
 *
 * THREAT MODEL — read this before relaxing anything here.
 *
 * The HTML is written by a model, from a message typed by an anonymous stranger
 * on Telegram, and is then served from OUR domain. Any script that survives runs
 * on the same origin as the logged-in application: it can read `localStorage`,
 * call the API with the viewer's session, and rewrite the page. That is stored
 * XSS, and the prospect's brief is the injection vector.
 *
 * Defence is layered, because no single layer should be load-bearing:
 *   1. This sanitizer strips scripts, event handlers and external references.
 *   2. The public route serves it with a restrictive CSP.
 *   3. The viewer renders it inside a fully-sandboxed <iframe> — no scripts, no
 *      same-origin — so anything that slips through has no origin to abuse.
 *
 * `dompurify` and `jsdom` are already dependencies; nothing new is introduced.
 */

/** Prototypes are single screens. Anything larger is a runaway generation. */
const MAX_HTML_BYTES = 400_000;

/**
 * Tags a static prototype legitimately needs. Everything else is dropped.
 * `style` is allowed because the prototype ships its own CSS inline — that is
 * what makes it self-contained and free of external requests.
 */
const ALLOWED_TAGS = [
  "html", "head", "body", "style", "title", "meta",
  "div", "span", "section", "header", "footer", "main", "nav", "aside", "article",
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "a", "button", "label", "input", "select", "option", "textarea", "form",
  "img", "svg", "path", "circle", "rect", "line", "polyline", "polygon", "g", "text",
  "strong", "em", "b", "i", "small", "code", "pre", "blockquote", "figure", "figcaption",
];

const ALLOWED_ATTR = [
  "class", "id", "style", "title", "alt", "role", "type", "placeholder", "value",
  "checked", "disabled", "readonly", "name", "for", "colspan", "rowspan",
  "width", "height", "viewBox", "fill", "stroke", "stroke-width", "d", "cx", "cy",
  "r", "x", "y", "x1", "y1", "x2", "y2", "points", "rx", "ry", "transform",
  "text-anchor", "font-size", "font-family", "font-weight", "opacity", "charset",
  // `href` enables in-page navigation between screens (`href="#pantalla2"`), the
  // pure-CSS `:target` flow that lets a prototype have several screens with no
  // JavaScript. It is constrained to fragments only by ALLOWED_URI_REGEXP below.
  "href",
];

/**
 * `href` is restricted to page-internal fragments. This is what makes a
 * multi-screen `:target` flow possible while keeping every external URL out —
 * a remote `href` would leak the viewer's IP and let the page phone home.
 * Anything not matching (https:, //, javascript:, data:) is dropped by DOMPurify.
 */
const FRAGMENT_ONLY_URI = /^#[A-Za-z0-9_-]*$/;

/**
 * Remote references would leak the viewer's IP to third parties and let a
 * generated page phone home. A prototype must be entirely self-contained. `href`
 * is deliberately excluded here (fragments are legal); the rest stay flagged.
 */
// NOT global. A `/g` regex carries `lastIndex` between calls, so using the same
// object for `.test()` and then `.replace()` makes the second call start
// mid-string and silently miss matches — in a security filter, that is a hole.
const EXTERNAL_REF = /\b(?:src|xlink:href|action|formaction|background|poster)\s*=/i;
// `["'\s]*` is ONE quantifier, not two `\s*` split by an optional char. The old
// `\s*['"]?\s*` was ambiguous: on `url(` + a long whitespace run the engine
// tried every split point before failing — O(n²), a synchronous stall that
// freezes the whole event loop (measured 64k chars → ~4.8s). This form is linear.
const HAS_CSS_REMOTE = /url\(["'\s]*(?:https?:)?\/\//i;
const HAS_CSS_IMPORT = /@import\b/i;

// Replacements match the WHOLE construct, not just its scheme: rewriting
// `url('https://evil.com/x.png')` to `url(` would leave `evil.com/x.png')`
// behind as a relative URL and corrupt the stylesheet.
const CSS_REMOTE_DECL = /url\(["'\s]*(?:https?:)?\/\/[^)]*\)/gi;
const CSS_IMPORT_DECL = /@import[^;]*;?/gi;

export interface SanitizeResult {
  html: string;
  /** What was removed, for logging. Never shown to the prospect. */
  removed: string[];
  /** HTML parse errors found before sanitizing. */
  syntaxErrors: string[];
}

/**
 * The closest thing HTML has to a compile step.
 *
 * HTML never fails to "compile" — the spec REQUIRES parsers to recover from
 * anything, so a browser silently repairs a missing `</div>` and moves on. That
 * recovery is what makes broken output dangerous: nothing complains, but the
 * page renders wrong, and a stray unclosed tag can swallow every element after
 * it — a prototype that looks fine to the generator and empty to the prospect.
 *
 * `parse5` reports the spec-level errors a browser silently swallows, which
 * gives us a real syntax check to gate the generation on.
 *
 * Codes are things like `missing-end-tag`, `unexpected-character-in-attribute-name`,
 * `duplicate-attribute`.
 */
export const findHtmlSyntaxErrors = (html: string, limit = 25): string[] => {
  const errors: string[] = [];
  try {
    parse(html, {
      sourceCodeLocationInfo: false,
      onParseError: (err) => {
        if (errors.length < limit) errors.push(`${err.code} (línea ${err.startLine})`);
      },
    });
  } catch (err) {
    // parse5 throwing at all would be remarkable; treat it as fatally malformed.
    errors.push(`parser-crash: ${err instanceof Error ? err.message : String(err)}`);
  }
  return errors;
};

/**
 * Errors that DESTROY content, as opposed to merely being untidy.
 *
 * Note what is deliberately NOT here: an unclosed `<div>` or `<p>`. The HTML
 * spec defines implied end tags, so parse5 reports no error and no content is
 * lost — flagging it would reject perfectly good prototypes.
 *
 * The `eof-in-*` family is the dangerous one. Verified against parse5 8.0:
 *
 *   <style>body{}<div><h1>Comandas</h1>   → eof-in-element-that-can-contain-only-text
 *                                           visible text: ""   ← page swallowed
 *   <div class="card><h1>Comandas</h1>    → eof-in-tag
 *                                           visible text: ""   ← page swallowed
 *
 * Both render as a blank page. `duplicate-attribute` and `missing-doctype` are
 * excluded on purpose: they render fine and would only cause needless retries.
 */
const STRUCTURAL_ERROR = /eof-in-|abrupt-|unexpected-character-in-attribute/;

export const hasStructuralErrors = (errors: string[]): boolean =>
  errors.some((code) => STRUCTURAL_ERROR.test(code));

/**
 * Returns sanitized HTML, or null when nothing usable survives.
 *
 * Deliberately conservative: for a sales prototype, dropping a questionable
 * element costs a bit of polish, while letting one through costs a session.
 */
export const sanitizePrototypeHtml = (raw: string): SanitizeResult | null => {
  if (!raw?.trim()) return null;

  const removed: string[] = [];

  // Models like to wrap output in a markdown fence even when told not to.
  let html = raw.trim().replace(/^```(?:html)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    logger.warn(`[prototype] html over size cap (${Buffer.byteLength(html, "utf8")}B)`);
    return null;
  }

  // Checked on the RAW output: sanitizing rewrites the markup, so errors found
  // afterwards would be ours, not the model's.
  const syntaxErrors = findHtmlSyntaxErrors(html);
  if (syntaxErrors.length) {
    logger.warn(
      `[prototype] ${syntaxErrors.length} error(es) de sintaxis: ${syntaxErrors.slice(0, 5).join(", ")}`,
    );
  }

  if (EXTERNAL_REF.test(html)) removed.push("external-refs");
  if (HAS_CSS_REMOTE.test(html) || HAS_CSS_IMPORT.test(html)) removed.push("remote-css");

  // Strip remote CSS before DOMPurify: DOMPurify does not parse the contents of
  // a <style> block, so a `url(https://…)` or `@import` inside one would survive.
  html = html.replace(CSS_REMOTE_DECL, "none").replace(CSS_IMPORT_DECL, "");

  const window = new JSDOM("").window;
  const purify = createDOMPurify(window as unknown as Window & typeof globalThis);

  const clean = purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Only page-internal fragment links survive. `href="#screen2"` (the CSS
    // `:target` flow) passes; `https:`, `//`, `javascript:` and `data:` do not.
    ALLOWED_URI_REGEXP: FRAGMENT_ONLY_URI,
    WHOLE_DOCUMENT: true,
    // Belt and braces: these are already absent from ALLOWED_TAGS, but naming
    // them makes the intent explicit to anyone editing the list above.
    FORBID_TAGS: ["script", "iframe", "object", "embed", "link", "base", "form"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "srcdoc", "formaction"],
    ALLOW_DATA_ATTR: false,
  });

  if (purify.removed.length) removed.push(`dompurify:${purify.removed.length}`);

  const text = clean.replace(/<[^>]*>/g, "").trim();
  // A document with markup but no words is a failed generation, not a prototype.
  if (!clean.trim() || text.length < 20) {
    logger.warn("[prototype] nothing usable survived sanitization");
    return null;
  }

  return { html: clean, removed, syntaxErrors };
};

/**
 * Wraps sanitized fragment HTML into a complete, responsive document.
 * Applied after sanitization so the wrapper itself can never be tampered with.
 */
export const wrapPrototypeDocument = (bodyHtml: string, title: string): string => {
  const safeTitle = title.replace(/[<>&"]/g, "");
  // This CSP is the REAL backstop for outbound requests, not the CSS regexes
  // above. Those are textual and cannot see through CSS's own escape layer
  // (`\75rl(...)`, `url(https:\2f\2f...)`), so a remote `url()` can survive
  // sanitization. `default-src 'none'` blocks every subresource — image, font,
  // stylesheet fetch — at render time regardless of what escaped, turning any
  // surviving beacon into a blocked request. `style-src 'unsafe-inline'` is
  // required because the prototype ships its CSS in an inline <style>; `img-src`
  // and `font-src data:` allow only self-contained data URIs.
  const csp =
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'";
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
</head>
<body>
${bodyHtml}
</body>
</html>`;
};

/** id used for the injected "not yet implemented" screen. */
const FALLBACK_SCREEN_ID = "pendiente-berry";

/**
 * Assembles the final prototype document from the sanitized (whole-document)
 * HTML, doing two things a raw wrap cannot:
 *
 * 1. WIRES DEAD LINKS. A generated `:target` flow always has buttons whose
 *    `href="#algo"` points at a screen the model never built — the prospect
 *    taps and nothing happens, which reads as broken. Every dangling fragment
 *    is redirected to an injected "en construcción" screen, so every button
 *    goes somewhere and the prototype feels complete.
 * 2. COLLAPSES the double document. Sanitization runs in WHOLE_DOCUMENT mode and
 *    returns a full `<html>`; wrapping that again nested two documents. Here we
 *    lift the styles and body out and emit ONE clean document with the CSP.
 */
export interface FallbackLabels {
  title: string;
  body: string;
  back: string;
}

const DEFAULT_FALLBACK: FallbackLabels = {
  title: "Screen under construction",
  body: "This part of the flow is built in the final project. This is a prototype to set the direction.",
  back: "Back",
};

export const finalizePrototypeHtml = (
  sanitizedHtml: string,
  title: string,
  labels: FallbackLabels = DEFAULT_FALLBACK,
): string => {
  const $ = cheerio.load(sanitizedHtml);

  // Every id present in the document — the set of valid link targets.
  const ids = new Set<string>();
  $("[id]").each((_, el) => {
    const id = $(el).attr("id");
    if (id) ids.add(id);
  });

  // Redirect fragment links whose target does not exist. A bare "#" counts as
  // dead too — it is the model's placeholder for "no destination yet".
  let dangling = 0;
  $('a[href^="#"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const target = href.slice(1);
    if (!target || !ids.has(target)) {
      $(el).attr("href", `#${FALLBACK_SCREEN_ID}`);
      dangling += 1;
    }
  });

  if (dangling) logger.info(`[prototype] ${dangling} enlace(s) muerto(s) → pantalla de aviso`);

  const styles = $("style")
    .map((_, el) => $(el).html() ?? "")
    .get()
    .join("\n");

  const body = $("body").html() ?? sanitizedHtml;

  // The fallback screen. `.screen` + `:target` styling comes from the model's
  // own CSS, so it hides until a redirected link targets it. The extra rules
  // here are namespaced to its id so they cannot disturb the design.
  const esc = (s: string) => s.replace(/[<>&"]/g, "");
  const fallback = `
<section class="screen" id="${FALLBACK_SCREEN_ID}">
  <div style="min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px;gap:12px">
    <div style="font-size:40px">🚧</div>
    <div style="font-size:18px;font-weight:600">${esc(labels.title)}</div>
    <div style="font-size:14px;opacity:0.7;max-width:280px">${esc(labels.body)}</div>
    <a href="#" style="margin-top:8px;font-size:14px;text-decoration:underline">${esc(labels.back)}</a>
  </div>
</section>`;

  const safeTitle = title.replace(/[<>&"]/g, "");
  const csp =
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>${styles}</style>
</head>
<body>
${body}
${fallback}
</body>
</html>`;
};
