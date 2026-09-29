import {
  bodySnippet,
  conflictedCopyTitle,
  firstLine,
  isTypingTarget,
  localDateKey,
  makeDraftNote,
  newNoteId,
  noteHeading,
  parseDateKey,
} from "./noteUtils";

describe("note utils", () => {
  it("uses the local calendar day", () => {
    expect(localDateKey(new Date(2026, 8, 29, 23, 59))).toBe("2026-09-29");
    expect(localDateKey(new Date(2026, 0, 5, 0, 1))).toBe("2026-01-05");
    const parsed = parseDateKey("2026-09-29");
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(8);
    expect(parsed?.getDate()).toBe(29);
    expect(parseDateKey("29/09/2026")).toBeNull();
  });

  it("makes ids the API accepts", () => {
    const id = newNoteId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(newNoteId()).not.toBe(id);
  });

  it("reads the first line of markdown as plain text", () => {
    expect(firstLine("\n\n## Plan for **Monday**\nmore")).toBe("Plan for Monday");
    expect(firstLine("- [ ] call [Ana](https://x.y)")).toBe("call Ana");
    expect(firstLine("  \n")).toBe("");
  });

  it("builds snippets and headings", () => {
    expect(bodySnippet("# One\n\n- two\n> three")).toBe("One two three");
    expect(bodySnippet("a".repeat(200), 10)).toHaveLength(10);
    expect(noteHeading({ title: "  Title ", body: "x" })).toBe("Title");
    expect(noteHeading({ title: null, body: "# From body" })).toBe("From body");
    expect(noteHeading({ title: "", body: "" })).toBeNull();
  });

  it("names the conflicted copy within the title limit", () => {
    expect(conflictedCopyTitle("Standup", "conflicted copy")).toBe("Standup (conflicted copy)");
    const long = conflictedCopyTitle("x".repeat(300), "conflicted copy");
    expect(long.length).toBe(200);
    expect(long.endsWith(" (conflicted copy)")).toBe(true);
  });

  it("detects fields where the user types", () => {
    const input = document.createElement("input");
    const div = document.createElement("div");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(div)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("makes a draft with the given links", () => {
    const draft = makeDraftNote("abcdefghijklmnop", { projectId: "p1" });
    expect(draft).toMatchObject({
      id: "abcdefghijklmnop",
      isMine: true,
      projectId: "p1",
      transcriptId: null,
      version: 0,
      visibility: "PRIVATE",
    });
  });
});
