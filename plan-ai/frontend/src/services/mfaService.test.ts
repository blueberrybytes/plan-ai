import { FirebaseError } from "firebase/app";
import {
  MfaCancelledError,
  MfaCodePrompt,
  mfaErrorKey,
  mfaSignInErrorKey,
  setMfaPromptListener,
  signInWithMfa,
} from "./mfaService";

// jest.mock calls below are hoisted above the imports by babel-jest.
const mockResolveSignIn = jest.fn();
const mockGetMultiFactorResolver = jest.fn();

jest.mock("../firebase/firebase", () => ({ auth: {} }));
jest.mock("firebase/auth", () => ({
  getMultiFactorResolver: (...args: unknown[]) => mockGetMultiFactorResolver(...args),
  multiFactor: jest.fn(),
  TotpMultiFactorGenerator: {
    FACTOR_ID: "totp",
    assertionForSignIn: (uid: string, code: string) => ({ uid, code }),
  },
}));

const mfaRequired = () =>
  new FirebaseError("auth/multi-factor-auth-required", "Second factor required");

describe("signInWithMfa", () => {
  beforeEach(() => {
    mockResolveSignIn.mockReset();
    mockGetMultiFactorResolver.mockReset();
    mockGetMultiFactorResolver.mockReturnValue({
      hints: [{ factorId: "totp", uid: "factor-1" }],
      resolveSignIn: mockResolveSignIn,
    });
  });

  afterEach(() => setMfaPromptListener(null));

  it("returns the credential when no second factor is needed", async () => {
    const credential = { user: { uid: "u1" } };
    await expect(signInWithMfa(async () => credential as never)).resolves.toBe(credential);
  });

  it("asks for a code, asks again after a wrong one, then signs in", async () => {
    const prompts: MfaCodePrompt[] = [];
    setMfaPromptListener((prompt) => {
      if (!prompt) return;
      prompts.push(prompt);
      prompt.submit(prompts.length === 1 ? "111111" : "222222");
    });
    mockResolveSignIn
      .mockRejectedValueOnce(new FirebaseError("auth/invalid-verification-code", "bad"))
      .mockResolvedValueOnce({ user: { uid: "u1" } });

    const result = await signInWithMfa(async () => {
      throw mfaRequired();
    });

    expect(result).toEqual({ user: { uid: "u1" } });
    expect(prompts).toHaveLength(2);
    expect(prompts[1].errorKey).toBe("mfa.errors.invalidCode");
    expect(mockResolveSignIn).toHaveBeenLastCalledWith({ uid: "factor-1", code: "222222" });
  });

  it("fails with MfaCancelledError when the user closes the prompt", async () => {
    setMfaPromptListener((prompt) => prompt?.cancel());
    const error = await signInWithMfa(async () => {
      throw mfaRequired();
    }).catch((e) => e);
    expect(error).toBeInstanceOf(MfaCancelledError);
    expect(mfaSignInErrorKey(error)).toBe("mfa.errors.cancelled");
  });

  it("reports TOTP not enabled only for errors from the second step", async () => {
    setMfaPromptListener((prompt) => prompt?.submit("123456"));
    mockResolveSignIn.mockRejectedValueOnce(
      new FirebaseError("auth/operation-not-allowed", "TOTP not enabled"),
    );
    const secondStep = await signInWithMfa(async () => {
      throw mfaRequired();
    }).catch((e) => e);
    expect(mfaSignInErrorKey(secondStep)).toBe("mfa.errors.notEnabled");

    const firstStep = new FirebaseError("auth/operation-not-allowed", "Provider disabled");
    await expect(
      signInWithMfa(async () => {
        throw firstStep;
      }),
    ).rejects.toBe(firstStep);
    expect(mfaSignInErrorKey(firstStep)).toBeNull();
  });
});

describe("mfaErrorKey", () => {
  it("maps Firebase codes to messages", () => {
    expect(mfaErrorKey({ code: "auth/operation-not-allowed" })).toBe("mfa.errors.notEnabled");
    expect(mfaErrorKey({ code: "auth/requires-recent-login" })).toBe("mfa.errors.recentLogin");
    expect(mfaErrorKey({ code: "auth/network-request-failed" })).toBeNull();
  });
});
