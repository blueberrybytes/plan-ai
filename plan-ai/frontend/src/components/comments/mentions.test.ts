import type { components } from "../../types/api";
import {
  bodyParts,
  filterCandidates,
  insertMention,
  mentionQueryAt,
  toCandidates,
  toFieldText,
  toStoredBody,
} from "./mentions";

type WorkspaceMember = components["schemas"]["WorkspaceMemberResponse"];

const member = (over: Partial<WorkspaceMember>): WorkspaceMember => ({
  id: "m",
  userId: "u",
  name: "Name",
  email: "name@example.com",
  role: "MEMBER",
  personas: [],
  status: "ACTIVE",
  createdAt: "2026-10-01T00:00:00Z",
  ...over,
});

const ana = { userId: "ana", name: "Ana" };
const anaMaria = { userId: "am", name: "Ana María" };
const bob = { userId: "bob", name: "Bob" };

describe("who can be mentioned", () => {
  it("keeps active members with an account and gives each a name", () => {
    const candidates = toCandidates([
      member({ userId: "ana", name: "Ana", email: "ana@example.com" }),
      member({ userId: null, name: null, email: "invited@example.com", status: "PENDING" }),
      member({ userId: "x", name: "Pending", status: "PENDING" }),
      member({ userId: "noname", name: "  ", email: "jordi.vidal@example.com" }),
      member({ userId: "br", name: "Zoe [QA]", email: "zoe@example.com" }),
    ]);
    expect(candidates).toEqual([
      { userId: "ana", name: "Ana", email: "ana@example.com" },
      { userId: "noname", name: "jordi.vidal", email: "jordi.vidal@example.com" },
      { userId: "br", name: "Zoe QA", email: "zoe@example.com" },
    ]);
  });

  it("filters by name or email, ignoring case and accents, best match first", () => {
    const people = [
      { userId: "1", name: "Mariana Pons", email: "mp@example.com" },
      { userId: "2", name: "José María", email: "jm@example.com" },
      { userId: "3", name: "María Puig", email: "maria@example.com" },
      { userId: "4", name: "Bob", email: "bob.maris@example.com" },
      { userId: "5", name: "Cleo", email: "cleo@example.com" },
    ];
    expect(filterCandidates(people, "MARI").map((p) => p.userId)).toEqual(["1", "3", "2", "4"]);
    expect(filterCandidates(people, "maría p").map((p) => p.userId)).toEqual(["3"]);
    expect(filterCandidates(people, "zzz")).toEqual([]);
    expect(filterCandidates(people, "", 2).map((p) => p.userId)).toEqual(["1", "2"]);
  });
});

describe("typing a mention", () => {
  it("finds the mention at the caret", () => {
    expect(mentionQueryAt("hi @an", 6)).toEqual({ start: 3, query: "an" });
    expect(mentionQueryAt("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionQueryAt("hi @Ana Ma", 10)).toEqual({ start: 3, query: "Ana Ma" });
    expect(mentionQueryAt("(@bo", 4)).toEqual({ start: 1, query: "bo" });
  });

  it("is not in a mention inside an email, after a space or on another line", () => {
    expect(mentionQueryAt("mail me at ana@exam", 19)).toBeNull();
    expect(mentionQueryAt("hi @Ana ", 8)).toBeNull();
    expect(mentionQueryAt("hi @ an", 7)).toBeNull();
    expect(mentionQueryAt("@ana\nnext", 9)).toBeNull();
    expect(mentionQueryAt("no mention here", 5)).toBeNull();
  });

  it("puts the picked name in place of what was typed", () => {
    expect(insertMention("hi @an, look", 3, 6, "Ana María")).toEqual({
      text: "hi @Ana María, look",
      caret: 13,
    });
    expect(insertMention("@bo rest", 0, 3, "Bob")).toEqual({ text: "@Bob rest", caret: 4 });
    expect(insertMention("@bo", 0, 3, "Bob")).toEqual({ text: "@Bob ", caret: 5 });
  });
});

describe("what the field shows and what is stored", () => {
  it("turns each picked name into the stored form", () => {
    expect(toStoredBody("@Bob and @Ana, see @Bob.", [ana, bob])).toBe(
      "@[Bob](user:bob) and @[Ana](user:ana), see @[Bob](user:bob).",
    );
  });

  it("prefers the longest name", () => {
    expect(toStoredBody("@Ana María and @Ana", [ana, anaMaria])).toBe(
      "@[Ana María](user:am) and @[Ana](user:ana)",
    );
  });

  it("drops a mention whose text was edited", () => {
    expect(toStoredBody("@Bo and @Bobby and bob@example.com", [bob])).toBe(
      "@Bo and @Bobby and bob@example.com",
    );
    expect(toStoredBody("plain @Bob", [])).toBe("plain @Bob");
  });

  it("goes back to the field text for editing", () => {
    const stored = "@[Robert](user:bob) and @[Gone](user:gone) and @[Robert](user:bob)";
    expect(toFieldText(stored, [{ userId: "bob", name: "Bob" }])).toEqual({
      text: "@Bob and @Gone and @Bob",
      picked: [bob],
    });
  });

  it("round trips", () => {
    const stored = "hi @[Ana María](user:am),\nline two @[Bob](user:bob)";
    const { text, picked } = toFieldText(stored, [anaMaria, bob]);
    expect(text).toBe("hi @Ana María,\nline two @Bob");
    expect(toStoredBody(text, picked)).toBe(stored);
  });
});

describe("rendering a body", () => {
  it("splits text and mentions, with the name the server gives", () => {
    expect(bodyParts("hi @[Robert](user:bob)!\nbye", [{ userId: "bob", name: "Bob" }])).toEqual([
      { type: "text", text: "hi " },
      { type: "mention", userId: "bob", name: "Bob" },
      { type: "text", text: "!\nbye" },
    ]);
  });

  it("shows a mention the server does not list as plain text", () => {
    expect(bodyParts("a @[Eve](user:eve) b", [])).toEqual([{ type: "text", text: "a @Eve b" }]);
  });

  it("leaves markup and malformed mentions as text", () => {
    const body = "<b>x</b> [link](http://a) @[Bob](bob) @Bob";
    expect(bodyParts(body, [{ userId: "bob", name: "Bob" }])).toEqual([
      { type: "text", text: body },
    ]);
    expect(bodyParts("", [])).toEqual([]);
  });
});
