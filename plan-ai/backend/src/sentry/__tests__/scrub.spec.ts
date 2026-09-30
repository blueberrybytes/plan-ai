import { describe, expect, it } from "vitest";
import { scrubExceptionMessage } from "../sentry";

describe("Sentry scrubbing", () => {
  it("drops the query arguments from a Prisma error", () => {
    const message = [
      "Invalid `prisma.note.create()` invocation in",
      "/app/src/services/noteService.ts:120:5",
      '  body: "I ate two eggs and weighed 81 kg"',
      "Argument `workspace` is missing.",
    ].join("\n");
    const out = scrubExceptionMessage("PrismaClientValidationError", message);
    expect(out).not.toContain("eggs");
    expect(out).toContain("prisma.note.create()");
    expect(out).toContain("Argument `workspace` is missing.");
  });

  it("leaves other errors alone but caps their length", () => {
    expect(scrubExceptionMessage("Error", "Deepgram timeout")).toBe("Deepgram timeout");
    expect(scrubExceptionMessage("Error", "x".repeat(5000)).length).toBeLessThan(1100);
  });
});
