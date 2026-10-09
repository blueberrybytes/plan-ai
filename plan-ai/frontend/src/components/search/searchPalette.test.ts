import type { SearchHit } from "../../store/apis/searchApi";
import {
  buildNavCommands,
  flattenGroups,
  formatHitTime,
  groupHits,
  hitRoute,
  moveSelection,
  paletteMode,
} from "./searchPalette";

const hit = (over: Partial<SearchHit>): SearchHit => ({
  type: "meeting",
  id: "x",
  title: "x",
  snippet: null,
  titleMatch: false,
  projectId: null,
  projectTitle: null,
  date: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("hitRoute", () => {
  it("opens a project meeting in its project", () => {
    expect(hitRoute({ type: "meeting", id: "t1", projectId: "p1" })).toBe(
      "/projects/p1/info/transcripts/t1",
    );
  });

  it("opens a standalone meeting in recordings", () => {
    expect(hitRoute({ type: "meeting", id: "t1", projectId: null })).toBe("/recordings/t1");
  });

  it("opens a task on its project's board", () => {
    expect(hitRoute({ type: "task", id: "k 1", projectId: "p1" })).toBe(
      "/projects/p1?tab=board&task=k%201",
    );
    expect(hitRoute({ type: "task", id: "k1", projectId: null })).toBe("/projects");
  });

  it("opens a document and a project", () => {
    expect(hitRoute({ type: "document", id: "d1", projectId: "p1" })).toBe("/docs/view/d1");
    expect(hitRoute({ type: "project", id: "p1", projectId: "p1" })).toBe("/projects/p1");
  });
});

describe("groupHits", () => {
  const hits = [
    hit({ type: "task", id: "k1" }),
    hit({ type: "meeting", id: "m1" }),
    hit({ type: "project", id: "p1" }),
    hit({ type: "task", id: "k2" }),
    hit({ type: "meeting", id: "m2" }),
  ];

  it("groups by type in a fixed order and keeps the ranking inside a group", () => {
    const groups = groupHits(hits);
    expect(groups.map((g) => g.type)).toEqual(["meeting", "task", "project"]);
    expect(groups[0].hits.map((h) => h.id)).toEqual(["m1", "m2"]);
    expect(groups[1].hits.map((h) => h.id)).toEqual(["k1", "k2"]);
  });

  it("leaves out empty groups", () => {
    expect(groupHits([])).toEqual([]);
    expect(groupHits([hit({ type: "document" })]).map((g) => g.type)).toEqual(["document"]);
  });

  it("flattens in the order the rows are drawn", () => {
    expect(flattenGroups(groupHits(hits)).map((h) => h.id)).toEqual(["m1", "m2", "k1", "k2", "p1"]);
  });
});

describe("moveSelection", () => {
  it("moves down and up", () => {
    expect(moveSelection(0, 3, "ArrowDown")).toBe(1);
    expect(moveSelection(2, 3, "ArrowUp")).toBe(1);
  });

  it("wraps around at both ends", () => {
    expect(moveSelection(2, 3, "ArrowDown")).toBe(0);
    expect(moveSelection(0, 3, "ArrowUp")).toBe(2);
  });

  it("jumps to the first and the last row", () => {
    expect(moveSelection(1, 5, "Home")).toBe(0);
    expect(moveSelection(1, 5, "End")).toBe(4);
  });

  it("stays at 0 in an empty list", () => {
    expect(moveSelection(4, 0, "ArrowDown")).toBe(0);
    expect(moveSelection(0, 0, "ArrowUp")).toBe(0);
  });
});

describe("paletteMode", () => {
  it("shows the commands for an empty box", () => {
    expect(paletteMode("")).toBe("commands");
    expect(paletteMode("   ")).toBe("commands");
  });

  it("waits for two characters before searching", () => {
    expect(paletteMode(" a ")).toBe("tooShort");
    expect(paletteMode("ab")).toBe("search");
  });
});

describe("buildNavCommands", () => {
  it("lists plain entries, the pages of a grouped entry, and the extras", () => {
    const commands = buildNavCommands(
      [
        { labelKey: "nav.home", path: "/home" },
        {
          labelKey: "nav.studio",
          path: "/docs",
          section: [
            { labelKey: "nav.documents", path: "/docs" },
            { labelKey: "nav.slides", path: "/slides" },
          ],
        },
      ],
      [{ labelKey: "nav.settings", path: "/profile" }],
    );
    expect(commands).toEqual([
      { labelKey: "nav.home", path: "/home" },
      { labelKey: "nav.documents", path: "/docs" },
      { labelKey: "nav.slides", path: "/slides" },
      { labelKey: "nav.settings", path: "/profile" },
    ]);
  });

  it("keeps one command per page", () => {
    const commands = buildNavCommands(
      [{ labelKey: "a", path: "/x" }],
      [{ labelKey: "b", path: "/x" }],
    );
    expect(commands).toEqual([{ labelKey: "a", path: "/x" }]);
  });
});

describe("formatHitTime", () => {
  it("writes minutes and seconds, and hours when there are any", () => {
    expect(formatHitTime(95)).toBe("1:35");
    expect(formatHitTime(5)).toBe("0:05");
    expect(formatHitTime(3725)).toBe("1:02:05");
  });
});
