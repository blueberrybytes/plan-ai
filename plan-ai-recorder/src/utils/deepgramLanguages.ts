// Full list of languages supported by Deepgram Nova-3 model
// https://developers.deepgram.com/docs/models-languages-overview

/**
 * Auto-detect ⇒ Deepgram `language=multi` (code-switching), which only covers
 * en, es, fr, de, hi, ru, pt, ja, it and nl. Picking it for any OTHER language
 * in the list below — Catalan included — returns an EMPTY transcript, not a
 * degraded one. The label has to say so; the codes below all work, but only
 * when selected explicitly.
 */
export const AUTO_LANGUAGE_OPTION = {
  code: "",
  name: "Auto-Detect (10 major languages only)",
};

export const DEEPGRAM_LANGUAGES: Record<string, string> = {
    ar: "Arabic",
    be: "Belarusian",
    bn: "Bengali",
    bs: "Bosnian",
    bg: "Bulgarian",
    ca: "Catalan",
    "zh-HK": "Chinese (Cantonese, Traditional)",
    zh: "Chinese (Mandarin, Simplified)",
    "zh-TW": "Chinese (Mandarin, Traditional)",
    hr: "Croatian",
    cs: "Czech",
    da: "Danish",
    nl: "Dutch",
    en: "English",
    et: "Estonian",
    fi: "Finnish",
    "nl-BE": "Flemish",
    fr: "French",
    de: "German",
    "de-CH": "German (Switzerland)",
    el: "Greek",
    gu: "Gujarati",
    he: "Hebrew",
    hi: "Hindi",
    hu: "Hungarian",
    id: "Indonesian",
    it: "Italian",
    ja: "Japanese",
    kn: "Kannada",
    ko: "Korean",
    lv: "Latvian",
    lt: "Lithuanian",
    mk: "Macedonian",
    ms: "Malay",
    mr: "Marathi",
    no: "Norwegian",
    fa: "Persian",
    pl: "Polish",
    pt: "Portuguese",
    ro: "Romanian",
    ru: "Russian",
    sr: "Serbian",
    sk: "Slovak",
    sl: "Slovenian",
    es: "Spanish",
    sv: "Swedish",
    tl: "Tagalog",
    ta: "Tamil",
    te: "Telugu",
    th: "Thai",
    tr: "Turkish",
    uk: "Ukrainian",
    ur: "Urdu",
    vi: "Vietnamese",
};
