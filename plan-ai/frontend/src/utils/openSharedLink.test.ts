import { openSharedLink, publicLinkKey, shareAndGetLinkKey } from "./openSharedLink";

describe("public link keys", () => {
  it("uses the share token, or the id for items shared before tokens existed", () => {
    expect(publicLinkKey({ id: "doc-1", shareToken: "tok-abc" })).toBe("tok-abc");
    expect(publicLinkKey({ id: "doc-1", shareToken: null })).toBe("doc-1");
    expect(publicLinkKey({ id: "doc-1" })).toBe("doc-1");
  });

  it("does not share again when the item is already public", async () => {
    const enable = jest.fn();
    await expect(
      shareAndGetLinkKey({ id: "p1", isPublic: true, shareToken: "tok" }, enable),
    ).resolves.toBe("tok");
    expect(enable).not.toHaveBeenCalled();
  });

  it("shares a private item and uses the new token from the response", async () => {
    const enable = jest.fn().mockResolvedValue({ id: "p1", isPublic: true, shareToken: "new-tok" });
    await expect(
      shareAndGetLinkKey({ id: "p1", isPublic: false, shareToken: null }, enable),
    ).resolves.toBe("new-tok");
    expect(enable).toHaveBeenCalledTimes(1);
  });
});

describe("openSharedLink", () => {
  const originalOpen = window.open;
  afterEach(() => {
    window.open = originalOpen;
  });

  it("opens the tab first, then points it to the public path", async () => {
    const tab = { opener: {}, location: { href: "" }, close: jest.fn() };
    window.open = jest.fn().mockReturnValue(tab);
    await openSharedLink(
      (key) => `/doc/public/${key}`,
      async () => "tok-1",
    );
    expect(tab.location.href).toBe("/doc/public/tok-1");
    expect(tab.opener).toBeNull();
  });

  it("closes the tab when sharing fails", async () => {
    const tab = { opener: {}, location: { href: "" }, close: jest.fn() };
    window.open = jest.fn().mockReturnValue(tab);
    await expect(
      openSharedLink(
        (key) => `/p/${key}`,
        async () => {
          throw new Error("nope");
        },
      ),
    ).rejects.toThrow("nope");
    expect(tab.close).toHaveBeenCalled();
  });
});
