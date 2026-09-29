/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../prisma/prismaClient", () => ({ default: {} }));
vi.mock("../../firebase/firebaseAdmin", () => ({ firebaseAdmin: {} }));

import { signInClaims, signInInfoFromToken } from "../authMiddleware";

describe("sign-in info from a Firebase token", () => {
  it("reads the provider and second factor Firebase reports", () => {
    const info = signInInfoFromToken({
      email: "a@acme.com",
      firebase: { sign_in_provider: "google.com", sign_in_second_factor: "totp" },
    } as any);
    expect(info).toEqual({
      email: "a@acme.com",
      signInProvider: "google.com",
      secondFactor: "totp",
    });
  });

  it("carries the original sign-in through a custom token (desktop recorder)", () => {
    const claims = signInClaims({ signInProvider: "saml.acme", secondFactor: "totp" });
    const info = signInInfoFromToken({
      email: "a@acme.com",
      firebase: { sign_in_provider: "custom" },
      ...claims,
    } as any);
    expect(info.signInProvider).toBe("saml.acme");
    expect(info.secondFactor).toBe("totp");
  });

  it("treats a custom token without claims as plain custom, with no second factor", () => {
    const info = signInInfoFromToken({ firebase: { sign_in_provider: "custom" } } as any);
    expect(info.signInProvider).toBe("custom");
    expect(info.secondFactor).toBeUndefined();
  });
});
