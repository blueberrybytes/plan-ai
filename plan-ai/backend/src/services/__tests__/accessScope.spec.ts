import { describe, expect, it, vi } from "vitest";
import express from "express";
import http from "http";
import type { AddressInfo } from "net";

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    $extends() {
      return this;
    }
  },
}));

import {
  accessScopeMiddleware,
  hiddenFromCaller,
  runWithHidden,
  setHiddenForRequest,
} from "../accessScope";
import { HIDDEN_FILTERS, withHiddenFilter } from "../../prisma/prismaClient";

const hidden = { projectIds: ["p_secret"], contextIds: ["c_secret"] };

describe("access scope", () => {
  it("is empty outside a request, and setting it there does nothing", () => {
    setHiddenForRequest(hidden);
    expect(hiddenFromCaller()).toBeNull();
  });

  it("holds what is hidden inside runWithHidden and nowhere else", async () => {
    const inside = await runWithHidden(hidden, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return hiddenFromCaller();
    });
    expect(inside).toEqual(hidden);
    expect(hiddenFromCaller()).toBeNull();
  });

  it("treats an empty list as nothing hidden", () => {
    runWithHidden({ projectIds: [], contextIds: [] }, () => {
      expect(hiddenFromCaller()).toBeNull();
    });
  });

  it("keeps each request's scope apart through body parsing and awaits", async () => {
    const app = express();
    app.use(accessScopeMiddleware);
    app.use(express.json());
    app.post("/who", async (req, res) => {
      // What resolveWorkspaceAccess does: set it some awaits into the request.
      await new Promise((r) => setTimeout(r, req.body.delay));
      setHiddenForRequest({ projectIds: req.body.hide, contextIds: [] });
      await new Promise((r) => setTimeout(r, req.body.delay));
      res.json({ hidden: hiddenFromCaller()?.projectIds ?? [] });
    });
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/who`;
    const call = (hide: string[], delay: number) =>
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hide, delay }),
      }).then((r) => r.json());
    // Overlapping requests of three callers, finishing out of order.
    const results = await Promise.all([call(["a"], 30), call([], 5), call(["b", "c"], 15)]);
    await new Promise((r) => server.close(r));
    expect(results).toEqual([{ hidden: ["a"] }, { hidden: [] }, { hidden: ["b", "c"] }]);
  });
});

describe("hidden filters", () => {
  it("keeps unique fields at the top level and adds to an existing AND", () => {
    expect(withHiddenFilter({ id: "t1" }, { x: 1 })).toEqual({ id: "t1", AND: [{ x: 1 }] });
    expect(withHiddenFilter({ id: "t1", AND: { y: 2 } }, { x: 1 })).toEqual({
      id: "t1",
      AND: [{ y: 2 }, { x: 1 }],
    });
    expect(withHiddenFilter({ AND: [{ y: 2 }] }, { x: 1 })).toEqual({ AND: [{ y: 2 }, { x: 1 }] });
    expect(withHiddenFilter(undefined, { x: 1 })).toEqual({ AND: [{ x: 1 }] });
  });

  it("covers every model that hangs from a project", () => {
    expect(Object.keys(HIDDEN_FILTERS).sort()).toEqual(
      [
        "ChatThread",
        "Comment",
        "Context",
        "ContextFile",
        "Diagram",
        "DocDocument",
        "Note",
        "PainPoint",
        "Presentation",
        "Project",
        "Task",
        "TaskTranscriptLink",
        "Transcript",
        "TranscriptTranslation",
      ].sort(),
    );
  });

  it("lets a meeting without project through, unless it uses a hidden knowledge base", () => {
    expect(HIDDEN_FILTERS.Transcript(hidden)).toEqual({
      AND: [
        { OR: [{ projectId: null }, { projectId: { notIn: ["p_secret"] } }] },
        { NOT: { contextIds: { hasSome: ["c_secret"] } } },
      ],
    });
  });
});
