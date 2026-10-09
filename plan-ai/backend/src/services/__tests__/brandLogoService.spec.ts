import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), upload: vi.fn() }));
vi.mock("../../utils/ssrfGuard", () => ({ safeAxios: { get: mocks.get } }));
vi.mock("../../firebase/privateStorage", () => ({ uploadWithDownloadUrl: mocks.upload }));

import { adoptLogo, isExternalLogo } from "../brandLogoService";

const OURS =
  "https://firebasestorage.googleapis.com/v0/b/b/o/themes%2Fu%2Flogos%2Fx.png?alt=media&token=t";

beforeEach(() => {
  mocks.get.mockReset();
  mocks.upload.mockReset();
  mocks.upload.mockResolvedValue(OURS);
});

describe("isExternalLogo", () => {
  it("tells an image on another site from one in our storage", () => {
    expect(isExternalLogo("https://decoolo.com/logo.svg")).toBe(true);
    expect(isExternalLogo(OURS)).toBe(false);
    expect(isExternalLogo("https://storage.googleapis.com/bucket/x.png")).toBe(false);
    expect(isExternalLogo("data:image/png;base64,AAAA")).toBe(false);
    expect(isExternalLogo("not a url")).toBe(false);
    expect(isExternalLogo(null)).toBe(false);
    expect(isExternalLogo(undefined)).toBe(false);
  });
});

describe("adoptLogo", () => {
  it("copies an external image to the user's logo folder and returns our address", async () => {
    mocks.get.mockResolvedValue({
      data: Buffer.from("<svg/>"),
      headers: { "content-type": "image/svg+xml; charset=utf-8" },
    });
    expect(await adoptLogo("u1", "https://decoolo.com/logo.svg")).toBe(OURS);
    const [path, data, type] = mocks.upload.mock.calls[0];
    expect(path).toMatch(/^themes\/u1\/logos\/[0-9a-f-]{36}\.svg$/);
    expect(data.toString()).toBe("<svg/>");
    expect(type).toBe("image/svg+xml");
  });

  it("leaves a logo that is already ours, and an empty one, as they are", async () => {
    expect(await adoptLogo("u1", OURS)).toBe(OURS);
    expect(await adoptLogo("u1", null)).toBeNull();
    expect(await adoptLogo("u1", undefined)).toBeUndefined();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("keeps the original address when the answer is not an image", async () => {
    mocks.get.mockResolvedValue({
      data: Buffer.from("<html>"),
      headers: { "content-type": "text/html" },
    });
    expect(await adoptLogo("u1", "https://x.test/logo.png")).toBe("https://x.test/logo.png");
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("keeps the original address when the download or the upload fails", async () => {
    mocks.get.mockRejectedValue(new Error("That address is not reachable from Plan AI."));
    expect(await adoptLogo("u1", "http://10.0.0.5/logo.png")).toBe("http://10.0.0.5/logo.png");
    mocks.get.mockResolvedValue({
      data: Buffer.from("x"),
      headers: { "content-type": "image/png" },
    });
    mocks.upload.mockRejectedValue(new Error("bucket down"));
    expect(await adoptLogo("u1", "https://x.test/logo.png")).toBe("https://x.test/logo.png");
  });
});
