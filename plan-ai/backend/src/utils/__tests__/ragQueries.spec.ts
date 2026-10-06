import { describe, expect, it } from "vitest";
import { interleaveUnique, spreadQueries } from "../ragQueries";

describe("spreadQueries", () => {
  it("gives nothing for an empty text", () => {
    expect(spreadQueries("   ")).toEqual([]);
  });

  it("gives a short text back as one query", () => {
    expect(spreadQueries("Quick sync about the invoice.")).toEqual([
      "Quick sync about the invoice.",
    ]);
  });

  it("covers the start, the middle and the end of a long meeting", () => {
    const part = (word: string) => `${word} `.repeat(400);
    const text = `${part("hello")}${part("budget")}${part("contract")}${part("deadline")}${part("goodbye")}`;
    const queries = spreadQueries(text);
    expect(queries).toHaveLength(5);
    expect(queries[0]).toContain("hello");
    expect(queries[2]).toContain("contract");
    expect(queries[4]).toContain("goodbye");
    expect(queries.join(" ")).toContain("budget");
    expect(queries.join(" ")).toContain("deadline");
    for (const q of queries) expect(q.length).toBeLessThanOrEqual(600);
  });

  it("does not start a query in the middle of a word", () => {
    const text = "alphabet ".repeat(1000);
    for (const q of spreadQueries(text)) expect(q.startsWith("alphabet")).toBe(true);
  });

  it("uses fewer windows when the text is only a little long", () => {
    expect(spreadQueries("word ".repeat(300)).length).toBeLessThan(5);
  });
});

describe("interleaveUnique", () => {
  it("takes one from each list in turn and drops repeats", () => {
    expect(
      interleaveUnique(
        [
          ["a1", "shared", "a3"],
          ["b1", "b2"],
          ["shared", "c2"],
        ],
        10,
      ),
    ).toEqual(["a1", "b1", "shared", "b2", "c2", "a3"]);
  });

  it("stops at the limit, keeping the best of every list", () => {
    expect(
      interleaveUnique(
        [
          ["a1", "a2", "a3"],
          ["b1", "b2", "b3"],
        ],
        3,
      ),
    ).toEqual(["a1", "b1", "a2"]);
  });

  it("handles no lists", () => {
    expect(interleaveUnique([], 5)).toEqual([]);
  });
});
