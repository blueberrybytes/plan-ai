import {
  CORNER_LOGO_BOX,
  TITLE_LOGO_BOX,
  fitImageInBox,
  imageAspectProps,
} from "./pptxExportService";

jest.mock("pptxgenjs", () => jest.fn());
jest.mock("./tokenService", () => ({ TokenService: { getIdToken: jest.fn() } }));

describe("fitImageInBox", () => {
  it("keeps the aspect ratio of a wide logo in the corner box", () => {
    // 600 x 100 in a 1.5 x 0.6 in box: the width is the limit.
    const box = fitImageInBox({ width: 600, height: 100 }, CORNER_LOGO_BOX, "right");

    expect(box.w).toBeCloseTo(1.5, 3);
    expect(box.h).toBeCloseTo(0.25, 3);
    expect(box.w / box.h).toBeCloseTo(6, 2);
    // Vertically centred, and the right edge stays where the box ends.
    expect(box.y).toBeCloseTo(0.3 + (0.6 - 0.25) / 2, 3);
    expect(box.x + box.w).toBeCloseTo(CORNER_LOGO_BOX.x + CORNER_LOGO_BOX.w, 3);
  });

  it("aligns a square logo to the right of the corner box", () => {
    const box = fitImageInBox({ width: 200, height: 200 }, CORNER_LOGO_BOX, "right");

    expect(box).toEqual({ x: 9.1, y: 0.3, w: 0.6, h: 0.6 });
  });

  it("centres the logo of the title slide", () => {
    // 100 x 200 in a 2 x 1 in box: the height is the limit.
    const box = fitImageInBox({ width: 100, height: 200 }, TITLE_LOGO_BOX);

    expect(box).toEqual({ x: 4.75, y: 0.8, w: 0.5, h: 1 });
  });

  it("never draws outside the box", () => {
    [
      { width: 3000, height: 10 },
      { width: 10, height: 3000 },
      { width: 1, height: 1 },
    ].forEach((size) => {
      const box = fitImageInBox(size, TITLE_LOGO_BOX);
      expect(box.w).toBeLessThanOrEqual(TITLE_LOGO_BOX.w);
      expect(box.h).toBeLessThanOrEqual(TITLE_LOGO_BOX.h);
      expect(box.x).toBeGreaterThanOrEqual(TITLE_LOGO_BOX.x);
      expect(box.y).toBeGreaterThanOrEqual(TITLE_LOGO_BOX.y);
    });
  });

  it("fills the box when the size of the image is unknown", () => {
    expect(fitImageInBox(null, CORNER_LOGO_BOX, "right")).toEqual(CORNER_LOGO_BOX);
    expect(fitImageInBox({ width: 0, height: 0 }, TITLE_LOGO_BOX)).toEqual(TITLE_LOGO_BOX);
  });
});

describe("imageAspectProps", () => {
  it("gives the ratio of the image for cover and contain", () => {
    expect(imageAspectProps({ width: 1600, height: 900 })).toEqual({ w: 1.778, h: 1 });
  });

  it("gives nothing when the size is unknown", () => {
    expect(imageAspectProps(null)).toEqual({});
    expect(imageAspectProps({ width: 0, height: 10 })).toEqual({});
  });
});
