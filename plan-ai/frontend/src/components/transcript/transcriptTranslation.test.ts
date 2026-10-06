import { applyTranslation, languageLabel } from "./transcriptTranslation";

describe("applyTranslation", () => {
  it("returns the transcript untouched without a translation", () => {
    const transcript = { utterances: [{ transcript: "hola" }] };
    expect(applyTranslation(transcript, null)).toBe(transcript);
  });

  it("swaps the text of each utterance and keeps speaker and time", () => {
    const transcript = {
      id: "t1",
      utterances: [
        { speaker: "User 0", start: 1.5, transcript: "bon dia" },
        { speaker: "Speaker 1", start: 4, transcript: "hola" },
      ],
    };
    const out = applyTranslation(transcript, { lines: ["good morning", "hello"] });
    expect(out.utterances).toEqual([
      { speaker: "User 0", start: 1.5, transcript: "good morning" },
      { speaker: "Speaker 1", start: 4, transcript: "hello" },
    ]);
    expect(out.id).toBe("t1");
    expect(transcript.utterances[0].transcript).toBe("bon dia");
  });

  it("swaps a flat transcript line by line", () => {
    const transcript = { utterances: null, transcript: "User: bon dia\n\nOthers: hola" };
    const out = applyTranslation(transcript, {
      lines: ["User: good morning", "", "Others: hello"],
    });
    expect(out.transcript).toBe("User: good morning\n\nOthers: hello");
  });

  it("keeps the original when the translation does not line up", () => {
    const withUtterances = { utterances: [{ transcript: "uno" }, { transcript: "dos" }] };
    expect(applyTranslation(withUtterances, { lines: ["one"] })).toBe(withUtterances);
    const flat = { transcript: "uno\ndos" };
    expect(applyTranslation(flat, { lines: ["one", "two", "three"] })).toBe(flat);
  });
});

describe("languageLabel", () => {
  it("names the language in the language of the interface", () => {
    expect(languageLabel("en", "es")).toBe("Inglés");
    expect(languageLabel("ca", "en")).toBe("Catalan");
  });
});
