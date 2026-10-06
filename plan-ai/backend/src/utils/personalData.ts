/**
 * Finds personal data in text with rules: no model, nothing leaves the server.
 *
 * It finds what has a recognisable shape: email addresses, phone numbers,
 * bank accounts (IBAN), payment cards and identity numbers (Spanish DNI and
 * NIE, Emirates ID). Where a checksum exists it is verified, so a random run
 * of digits is not flagged.
 *
 * It does not find names, addresses, health details or anything else that
 * needs understanding the sentence. Speech recognition also writes some of
 * these in words ("six one two..."), and those are missed.
 */

export type PersonalDataType = "EMAIL" | "PHONE" | "IBAN" | "CARD" | "NATIONAL_ID";

export interface PersonalDataSpan {
  type: PersonalDataType;
  /** Offsets into the text: start inclusive, end exclusive. */
  start: number;
  end: number;
}

const digitsOf = (s: string) => s.replace(/\D/g, "");

function luhnOk(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** ISO 13616: move the first four characters to the end, letters to numbers, mod 97. */
function ibanOk(raw: string): boolean {
  const iban = raw.replace(/\s/g, "").toUpperCase();
  if (iban.length < 15 || iban.length > 34) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of value) remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97;
  }
  return remainder === 1;
}

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

function spanishIdOk(raw: string): boolean {
  const id = raw.replace(/[\s-]/g, "").toUpperCase();
  const number = id.replace(/^X/, "0").replace(/^Y/, "1").replace(/^Z/, "2").slice(0, 8);
  return DNI_LETTERS[Number(number) % 23] === id[id.length - 1];
}

interface Rule {
  type: PersonalDataType;
  pattern: RegExp;
  valid?: (match: string) => boolean;
}

// In order of priority: when two rules match overlapping text, the first wins.
const RULES: Rule[] = [
  { type: "EMAIL", pattern: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu },
  {
    type: "IBAN",
    pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/gi,
    valid: ibanOk,
  },
  {
    type: "CARD",
    pattern: /(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g,
    valid: (m) => {
      const digits = digitsOf(m);
      return digits.length >= 13 && digits.length <= 19 && luhnOk(digits);
    },
  },
  // Emirates ID: 784, year of birth, seven digits, check digit.
  { type: "NATIONAL_ID", pattern: /(?<!\d)784[- ]?(?:19|20)\d{2}[- ]?\d{7}[- ]?\d(?!\d)/g },
  // Spanish DNI (8 digits and a letter) and NIE (X, Y or Z, 7 digits and a letter).
  {
    type: "NATIONAL_ID",
    pattern: /(?<![\p{L}\d])\d{8}[- ]?[A-Z](?![\p{L}\d])/giu,
    valid: spanishIdOk,
  },
  {
    type: "NATIONAL_ID",
    pattern: /(?<![\p{L}\d])[XYZ][- ]?\d{7}[- ]?[A-Z](?![\p{L}\d])/giu,
    valid: spanishIdOk,
  },
  // With a country prefix: +34 612 345 678, 0034 612345678, +971 50 123 4567.
  // No country code starts with 0, which keeps "900 000 000 000" out.
  {
    type: "PHONE",
    pattern: /(?<![\d+])(?:\+|00)[1-9]\d{0,2}[ .-]?(?:\(?\d{1,4}\)?[ .-]?){2,5}\d{2,4}(?!\d)/g,
    valid: (m) => {
      const n = digitsOf(m).length;
      return n >= 9 && n <= 15;
    },
  },
  // Spanish numbers without prefix: nine digits starting with 6, 7, 8 or 9,
  // and no more digits after them (a longer run is an amount, not a phone).
  { type: "PHONE", pattern: /(?<![\d.,])[6789]\d{2}(?:[ .-]?\d{3}){2}(?![ .,-]?\d)/g },
  { type: "PHONE", pattern: /(?<![\d.,])[6789]\d{2}(?:[ .-]?\d{2}){3}(?![ .,-]?\d)/g },
  // UAE mobiles without prefix: 05X XXX XXXX.
  { type: "PHONE", pattern: /(?<![\d.,])05\d[ -]?\d{3}[ -]?\d{4}(?!\d)/g },
];

/** The personal data found in the text, in order, without overlaps. */
export function detectPersonalData(text: string): PersonalDataSpan[] {
  if (!text) return [];
  const spans: PersonalDataSpan[] = [];
  for (const rule of RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      const raw = match[0];
      if (rule.valid && !rule.valid(raw)) continue;
      // A match can end in a separator that belongs to the sentence.
      const trimmed = raw.replace(/[\s.-]+$/, "");
      const start = match.index ?? 0;
      const end = start + trimmed.length;
      if (spans.some((s) => start < s.end && end > s.start)) continue;
      spans.push({ type: rule.type, start, end });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

const LABELS: Record<PersonalDataType, string> = {
  EMAIL: "[email]",
  PHONE: "[phone]",
  IBAN: "[bank account]",
  CARD: "[card]",
  NATIONAL_ID: "[id number]",
};

/** The text with each piece of personal data replaced by a label such as "[email]". */
export function maskPersonalData(text: string, spans = detectPersonalData(text)): string {
  if (spans.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const span of spans) {
    out += text.slice(cursor, span.start) + LABELS[span.type];
    cursor = span.end;
  }
  return out + text.slice(cursor);
}

export type PersonalDataCounts = Record<PersonalDataType, number>;

export const emptyCounts = (): PersonalDataCounts => ({
  EMAIL: 0,
  PHONE: 0,
  IBAN: 0,
  CARD: 0,
  NATIONAL_ID: 0,
});
