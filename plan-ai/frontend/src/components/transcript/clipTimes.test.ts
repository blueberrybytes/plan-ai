import { defaultClipRange, formatClipClock, parseClock, readClipRange } from "./clipTimes";

describe("parseClock", () => {
  it("reads seconds, mm:ss and h:mm:ss", () => {
    expect(parseClock("45")).toBe(45);
    expect(parseClock("1:15")).toBe(75);
    expect(parseClock(" 01:02:05 ")).toBe(3725);
    expect(parseClock("1:02.5")).toBe(62.5);
    expect(parseClock("90")).toBe(90);
  });

  it("refuses what is not a time", () => {
    for (const text of ["", "abc", "1:75", "1:2:3:4", "-5", "1:", "1.5:00", "1:60:00"]) {
      expect(parseClock(text)).toBeNull();
    }
  });
});

describe("formatClipClock", () => {
  it("round-trips with parseClock", () => {
    for (const seconds of [0, 59, 75, 3725]) {
      expect(parseClock(formatClipClock(seconds))).toBe(seconds);
    }
    expect(formatClipClock(75)).toBe("1:15");
  });
});

describe("defaultClipRange", () => {
  it("starts where the player is and lasts 30 seconds", () => {
    expect(defaultClipRange(12.7, 600)).toEqual({ start: 12, end: 42 });
  });

  it("starts at 0 without a player position", () => {
    expect(defaultClipRange(null, 600)).toEqual({ start: 0, end: 30 });
    expect(defaultClipRange(null, null)).toEqual({ start: 0, end: 30 });
  });

  it("does not pass the end of the recording", () => {
    expect(defaultClipRange(590, 600)).toEqual({ start: 590, end: 600 });
    expect(defaultClipRange(600, 600)).toEqual({ start: 570, end: 600 });
    expect(defaultClipRange(0, 10)).toEqual({ start: 0, end: 10 });
  });
});

describe("readClipRange", () => {
  it("returns the range in seconds", () => {
    expect(readClipRange("1:00", "1:30", 600)).toEqual({ startSeconds: 60, endSeconds: 90 });
  });

  it("says what is wrong", () => {
    expect(readClipRange("x", "1:30")).toEqual({ error: "format" });
    expect(readClipRange("2:00", "1:30")).toEqual({ error: "order" });
    expect(readClipRange("1:00", "1:00.5")).toEqual({ error: "tooShort" });
    expect(readClipRange("0:00", "5:01")).toEqual({ error: "tooLong" });
    expect(readClipRange("9:50", "10:10", 600)).toEqual({ error: "outside" });
  });

  it("allows 5 minutes exactly and an unknown duration", () => {
    expect(readClipRange("0:00", "5:00")).toEqual({ startSeconds: 0, endSeconds: 300 });
    expect(readClipRange("99:00", "99:30", null)).toEqual({
      startSeconds: 5940,
      endSeconds: 5970,
    });
  });
});
