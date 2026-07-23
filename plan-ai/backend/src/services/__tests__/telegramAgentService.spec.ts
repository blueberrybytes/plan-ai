import { describe, it, expect } from "vitest";
import { appendTurn, parseConversation } from "../telegramAgentService";
import type { ConversationTurn } from "../telegramAgentService";

describe("parseConversation", () => {
  it("reads a well-formed history", () => {
    const stored = [
      { role: "user", text: "hola" },
      { role: "bot", text: "¿qué quieres construir?" },
    ];
    expect(parseConversation(stored)).toHaveLength(2);
  });

  /**
   * The column is untyped JSON, so anything could be in there — a failed write,
   * a hand-edited row, an older shape. A malformed history must degrade to "no
   * context", never throw and cost the prospect their reply.
   */
  it("returns empty for anything that is not an array", () => {
    expect(parseConversation(null)).toEqual([]);
    expect(parseConversation(undefined)).toEqual([]);
    expect(parseConversation("texto")).toEqual([]);
    expect(parseConversation({ role: "user" })).toEqual([]);
  });

  it("drops malformed turns but keeps the good ones", () => {
    const stored = [
      { role: "user", text: "válido" },
      { role: "alien", text: "rol inválido" },
      { role: "bot" },
      null,
      { role: "bot", text: "también válido" },
    ];
    const parsed = parseConversation(stored);
    expect(parsed).toHaveLength(2);
    expect(parsed.map((t) => t.text)).toEqual(["válido", "también válido"]);
  });
});

describe("appendTurn", () => {
  it("appends in order", () => {
    const history = appendTurn(appendTurn([], "user", "hola"), "bot", "¿qué necesitas?");
    expect(history).toEqual([
      { role: "user", text: "hola" },
      { role: "bot", text: "¿qué necesitas?" },
    ]);
  });

  it("keeps only the most recent turns so the prompt cannot grow forever", () => {
    let history: ConversationTurn[] = [];
    for (let i = 0; i < 40; i += 1) history = appendTurn(history, "user", `mensaje ${i}`);

    expect(history).toHaveLength(10);
    expect(history[history.length - 1].text).toBe("mensaje 39");
    expect(history[0].text).toBe("mensaje 30");
  });

  it("does not mutate the history it was given", () => {
    const original: ConversationTurn[] = [{ role: "user", text: "hola" }];
    appendTurn(original, "bot", "respuesta");
    expect(original).toHaveLength(1);
  });
});
