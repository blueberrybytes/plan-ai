import { blendOver, contrastRatio, readableOn, slideTitleColor } from "./slideColors";

describe("contrastRatio", () => {
  it("gives 21 for black on white and 1 for the same colour", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });

  it("reads 3-digit hex and hex with alpha", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#000000ff", "FFFFFF")).toBeCloseTo(21, 5);
  });

  it("gives null for a colour it cannot read", () => {
    expect(contrastRatio("tomato", "#fff")).toBeNull();
    expect(contrastRatio("#fff", "rgb(0,0,0)")).toBeNull();
    expect(contrastRatio(undefined, "#fff")).toBeNull();
    expect(contrastRatio("#12", "#fff")).toBeNull();
  });
});

describe("readableOn", () => {
  it("keeps a colour that can be read on the background", () => {
    expect(readableOn("#0f172a", "#ffffff", "#000000")).toBe("#ffffff");
  });

  it("falls back when a pale colour sits on a light background", () => {
    expect(readableOn("#ffffff", "#fde68a", "#111111", "title")).toBe("#111111");
    expect(readableOn("#ffffff", "#fde68a", "inherit")).toBe("inherit");
  });

  it("asks for 3 on titles and 4.5 on body text", () => {
    // #6366f1 on #0f172a is about 4: enough for a title, not for body text.
    const ratio = contrastRatio("#0f172a", "#6366f1") as number;
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(4.5);
    expect(readableOn("#0f172a", "#6366f1", "inherit", "title")).toBe("#6366f1");
    expect(readableOn("#0f172a", "#6366f1", "inherit", "body")).toBe("inherit");
  });

  it("returns the fallback for invalid colours and never throws", () => {
    expect(readableOn("not a colour", "#fff", "inherit")).toBe("inherit");
    expect(readableOn("#fff", "", "inherit")).toBe("inherit");
    expect(readableOn(null, "#fff", "inherit")).toBe("inherit");
    expect(readableOn("#fff", "#zzz", "inherit")).toBe("inherit");
  });

  it("accepts 3-digit hex", () => {
    expect(readableOn("#fff", "#000", "inherit")).toBe("#000");
  });
});

describe("slideTitleColor", () => {
  it("uses the primary colour when it can be read", () => {
    expect(slideTitleColor({ primary: "#0070f3", background: "#000000" })).toBe("#0070f3");
    expect(slideTitleColor()).toBe("#6366f1");
  });

  it("uses the slide text colour for a pale primary on a light background", () => {
    expect(slideTitleColor({ primary: "#a5f3fc", background: "#ffffff" })).toBe("inherit");
  });
});

describe("quote column", () => {
  it("picks dark text on a light theme and light text on a dark one", () => {
    const light = blendOver("#ffffff", "#000000", 0.4);
    expect(light).toBe("#999999");
    // Light text on that grey is under 3, which was the bug.
    expect(contrastRatio(light, "#f8fafc") as number).toBeLessThan(3);
    expect(readableOn(light, "#f8fafc", "#0f172a")).toBe("#0f172a");

    const dark = blendOver("#0f172a", "#000000", 0.4);
    expect(readableOn(dark, "#f8fafc", "#0f172a")).toBe("#f8fafc");
  });

  it("gives null when the background cannot be read", () => {
    expect(blendOver("papayawhip", "#000", 0.4)).toBeNull();
  });
});
