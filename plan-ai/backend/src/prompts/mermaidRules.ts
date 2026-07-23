/**
 * Canonical Mermaid syntax rules injected into EVERY LLM prompt that generates
 * Mermaid diagrams (doc generation, diagram generation/improvement, chat,
 * slides, and the AI "fix diagram" fallback).
 *
 * Single source of truth — previously these rules were copy-pasted (and had
 * drifted) across ~6 prompts, while the doc-generation path shipped only a
 * watered-down subset. Keep this aligned with the frontend renderer's tolerance
 * in `frontend/src/utils/mermaidUtils.ts` (especially `repairMermaidSyntax`).
 *
 * NOTE: this constant covers SYNTAX only. Each call site keeps its own
 * output-format framing (raw mermaid vs. a fenced ```mermaid block).
 */
export const MERMAID_SYNTAX_RULES = `CRITICAL MERMAID SYNTAX RULES:
1. NODE IDs: Node IDs MUST be strictly alphanumeric or underscores. NEVER use dots, slashes, hyphens, or spaces in Node IDs (e.g. use \`NodeJS\`, not \`Node.js\`).
2. NODE LABELS: ANY node label containing spaces, parentheses "()", ampersands "&", hyphens "-", slashes "/", colons ":", quotes, or other punctuation MUST be enclosed in double quotes. Example: A["Menu (Client)"] instead of A[Menu (Client)]. This applies to ALL node shapes — rectangle A["Label"], rhombus/decision B{"Is it valid?"}, rounded C("Label") — including compound ones: circle E(("Endpoint")), stadium S(["Start/Stop"]), cylinder D[("User DB")], subroutine X[["Sub-call"]], hexagon H{{"Decision"}}.
3. QUOTES INSIDE LABELS: a label that mentions a quoted name is STILL wrapped in double quotes — convert the inner quotes to single quotes '. Write B{"AI Agent 'Berry'"}, NEVER B{AI Agent "Berry"} and NEVER B{"AI Agent "Berry""}. Leaving such a label unquoted crashes the parser: Mermaid reads the inner " as the start of a string token and reports 'got STR' while expecting the shape's closing delimiter.
4. EDGE LABELS: keep edge labels (\`-->|label|\`) free of parentheses, braces and ampersands; if unavoidable, wrap the label in double quotes.
5. SUBGRAPHS: Every \`subgraph\` MUST be closed with a matching \`end\` keyword. Never leave a subgraph unclosed or truncate the diagram.
6. STATE DIAGRAMS: NEVER use double quotes directly in transition arrows. Define an alias first using 'state "Label" as ID', then transition between IDs.
7. ER DIAGRAMS: Attribute types and names MUST be strictly alphanumeric. NEVER use '?', '!', '[', ']' or '()' in types/field names (use 'String email', not 'String? email').
8. CLASS DIAGRAMS: Generic types MUST use tildes: 'List~String~' instead of 'List<String>'.
9. GANTT: Include a valid 'dateFormat' (e.g. 'YYYY-MM-DD') and ensure every date matches it exactly.
10. XYCHART: Start with 'xychart-beta' and define both x-axis and y-axis; x-axis items go in brackets (e.g. x-axis ["A", "B"]).
11. THEMING: NEVER emit 'style', 'classDef', 'linkStyle' or 'theme' directives unless the user explicitly requests a specific color — the platform applies unified dynamic CSS theming and manual overrides will break it.`;
