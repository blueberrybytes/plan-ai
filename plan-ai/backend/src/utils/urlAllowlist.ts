/** A URL in a comparable form: no trailing punctuation, no fragment. */
export const normalizeUrl = (raw: string): string => {
  const trimmed = raw.trim().replace(/[.,;:!?)\]}>'"]+$/, "");
  try {
    const url = new URL(trimmed);
    url.hash = "";
    return url.toString();
  } catch {
    return trimmed;
  }
};

/** Every http(s) URL in a text, normalized. */
export const extractUrls = (text: string): string[] =>
  Array.from(text.matchAll(/https?:\/\/[^\s<>"'`]+/gi), (m) => normalizeUrl(m[0]));
