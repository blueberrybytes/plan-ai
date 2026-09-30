import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deepgramKeyFor, usesPlatformKeys } from "../platformKeys";

const OWN = "a".repeat(40);
const workspace = (over: Record<string, unknown> = {}) => ({
  isCourtesy: false,
  subscriptionTrack: null,
  subscriptionStatus: null,
  deepgramKey: null,
  ...over,
});

beforeEach(() => {
  process.env.DEEPGRAM_API_KEY = "platform-key";
});
afterEach(() => {
  delete process.env.DEEPGRAM_API_KEY;
});

describe("platform keys", () => {
  it("are for courtesy workspaces and paid MANAGED plans only", () => {
    expect(usesPlatformKeys(workspace({ isCourtesy: true }) as never)).toBe(true);
    expect(
      usesPlatformKeys(
        workspace({ subscriptionTrack: "MANAGED", subscriptionStatus: "ACTIVE" }) as never,
      ),
    ).toBe(true);
    expect(
      usesPlatformKeys(
        workspace({ subscriptionTrack: "MANAGED", subscriptionStatus: "TRIALING" }) as never,
      ),
    ).toBe(true);
    // A cancelled managed plan, a BYOK plan and no plan get nothing.
    expect(
      usesPlatformKeys(
        workspace({ subscriptionTrack: "MANAGED", subscriptionStatus: "CANCELED" }) as never,
      ),
    ).toBe(false);
    expect(
      usesPlatformKeys(
        workspace({ subscriptionTrack: "BYOK", subscriptionStatus: "ACTIVE" }) as never,
      ),
    ).toBe(false);
    expect(usesPlatformKeys(workspace() as never)).toBe(false);
  });
});

describe("Deepgram key", () => {
  it("prefers the workspace's own key, even on a managed plan", () => {
    expect(
      deepgramKeyFor(
        workspace({
          deepgramKey: OWN,
          subscriptionTrack: "MANAGED",
          subscriptionStatus: "ACTIVE",
        }) as never,
      ),
    ).toBe(OWN);
  });

  it("gives a paid managed plan the platform key", () => {
    expect(
      deepgramKeyFor(
        workspace({ subscriptionTrack: "MANAGED", subscriptionStatus: "ACTIVE" }) as never,
      ),
    ).toBe("platform-key");
  });

  it("gives a BYOK workspace without a key nothing", () => {
    expect(
      deepgramKeyFor(
        workspace({ subscriptionTrack: "BYOK", subscriptionStatus: "ACTIVE" }) as never,
      ),
    ).toBeNull();
    expect(deepgramKeyFor(workspace({ deepgramKey: "not-a-key" }) as never)).toBeNull();
  });
});
