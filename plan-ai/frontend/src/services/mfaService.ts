import {
  GoogleAuthProvider,
  OAuthProvider,
  reauthenticateWithPopup,
  getMultiFactorResolver,
  multiFactor,
  MultiFactorError,
  MultiFactorInfo,
  TotpMultiFactorGenerator,
  TotpSecret,
  User,
  UserCredential,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth } from "../firebase/firebase";

/**
 * Two-step verification with an authenticator app (TOTP), through the Firebase JS SDK.
 *
 * It only works once the Firebase project has Identity Platform and TOTP turned on.
 * Until then Firebase answers with an error, which mfaErrorKey() turns into a clear message.
 */

// ── Code prompt ──────────────────────────────────────────────────────────────
// Sign-in runs in a saga, which cannot render UI. The saga asks for a code through
// this bridge and MfaCodeDialog (mounted once in App) shows the prompt.

export interface MfaCodePrompt {
  /** i18n key of the error to show above the field, after a wrong code */
  errorKey?: string;
  submit: (code: string) => void;
  cancel: () => void;
}

type PromptListener = (prompt: MfaCodePrompt | null) => void;

let promptListener: PromptListener | null = null;

export const setMfaPromptListener = (listener: PromptListener | null): void => {
  promptListener = listener;
};

const askForCode = (errorKey?: string): Promise<string | null> =>
  new Promise((resolve) => {
    if (!promptListener) {
      resolve(null);
      return;
    }
    const listener = promptListener;
    listener({
      errorKey,
      submit: (code) => {
        listener(null);
        resolve(code);
      },
      cancel: () => {
        listener(null);
        resolve(null);
      },
    });
  });

// ── Errors ───────────────────────────────────────────────────────────────────

const errorCode = (error: unknown): string =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";

/**
 * An error raised during the second step of a sign-in. Keeping it apart from
 * first-step errors matters: "auth/operation-not-allowed" there means TOTP is
 * not enabled, while on the first step it means the sign-in method is disabled.
 */
export class MfaFlowError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }

  static from(error: unknown): MfaFlowError {
    if (error instanceof MfaFlowError) return error;
    return new MfaFlowError(errorCode(error), error instanceof Error ? error.message : "");
  }
}

/** The user closed the code prompt. */
export class MfaCancelledError extends MfaFlowError {
  constructor() {
    super("mfa/cancelled", "Two-step verification was cancelled.");
  }
}

/** The account has a second factor this app cannot handle (only TOTP is supported). */
export class MfaUnsupportedFactorError extends MfaFlowError {
  constructor() {
    super("mfa/unsupported-factor", "This account uses a second factor this app does not support.");
  }
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : "");

export const isMfaRequiredError = (error: unknown): error is MultiFactorError =>
  error instanceof FirebaseError && error.code === "auth/multi-factor-auth-required";

/**
 * i18n key for an error from the two-step verification flow, or null when the
 * error has nothing to do with it (so the caller keeps its own message).
 */
export const mfaErrorKey = (error: unknown): string | null => {
  const code = errorCode(error);
  const message = errorMessage(error).toUpperCase();

  if (
    code === "auth/operation-not-allowed" ||
    code === "auth/admin-restricted-operation" ||
    message.includes("NOT_ENABLED") ||
    message.includes("NOT ENABLED")
  ) {
    return "mfa.errors.notEnabled";
  }

  switch (code) {
    case "mfa/cancelled":
      return "mfa.errors.cancelled";
    case "mfa/unsupported-factor":
      return "mfa.errors.unsupportedFactor";
    case "auth/invalid-verification-code":
      return "mfa.errors.invalidCode";
    case "auth/requires-recent-login":
      return "mfa.errors.recentLogin";
    case "auth/unverified-email":
      return "mfa.errors.unverifiedEmail";
    case "auth/unsupported-first-factor":
      return "mfa.errors.unsupportedFirstFactor";
    case "auth/second-factor-already-in-use":
      return "mfa.errors.alreadyEnrolled";
    case "auth/maximum-second-factor-count-exceeded":
      return "mfa.errors.tooManyFactors";
    case "auth/code-expired":
    case "auth/totp-challenge-timeout":
    case "auth/missing-multi-factor-session":
    case "auth/multi-factor-info-not-found":
      return "mfa.errors.expired";
    case "auth/user-token-expired":
      return "mfa.errors.signInAgain";
    default:
      return null;
  }
};

// ── Sign-in ──────────────────────────────────────────────────────────────────

/**
 * Runs a Firebase sign-in. When the account has two-step verification, asks for
 * the authenticator code and finishes the sign-in. A wrong code asks again.
 */
export const signInWithMfa = async (
  signIn: () => Promise<UserCredential>,
): Promise<UserCredential> => {
  try {
    return await signIn();
  } catch (error) {
    if (!isMfaRequiredError(error)) throw error;

    try {
      return await resolveWithTotp(error);
    } catch (mfaError) {
      throw MfaFlowError.from(mfaError);
    }
  }
};

const resolveWithTotp = async (error: MultiFactorError): Promise<UserCredential> => {
  const resolver = getMultiFactorResolver(auth, error);
  const totpHint = resolver.hints.find(
    (hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID,
  );
  if (!totpHint) throw new MfaUnsupportedFactorError();

  let promptErrorKey: string | undefined;
  for (;;) {
    const code = await askForCode(promptErrorKey);
    if (code === null) throw new MfaCancelledError();
    try {
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(totpHint.uid, code);
      return await resolver.resolveSignIn(assertion);
    } catch (resolveError) {
      if (errorCode(resolveError) === "auth/invalid-verification-code") {
        promptErrorKey = "mfa.errors.invalidCode";
        continue;
      }
      throw resolveError;
    }
  }
};

/** Message key for a sign-in error from the second step, or null for any other error. */
export const mfaSignInErrorKey = (error: unknown): string | null =>
  error instanceof MfaFlowError ? (mfaErrorKey(error) ?? "mfa.errors.generic") : null;

// ── Enrolment (profile) ──────────────────────────────────────────────────────

const POPUP_PROVIDERS = ["google.com", "microsoft.com", "apple.com"];

/**
 * Firebase asks for a recent sign-in before a factor is added or removed.
 * Accounts that use Google, Microsoft or Apple confirm it in a popup here.
 * Returns false for email and password accounts: they sign out and in again.
 */
export const reauthenticateWithProvider = async (user: User): Promise<boolean> => {
  const providerId = user.providerData
    .map((p) => p.providerId)
    .find((id) => POPUP_PROVIDERS.includes(id));
  if (!providerId) return false;
  const provider =
    providerId === "google.com" ? new GoogleAuthProvider() : new OAuthProvider(providerId);
  await signInWithMfa(() => reauthenticateWithPopup(user, provider));
  return true;
};

/** Runs a sensitive change, confirming the sign-in first when Firebase asks for it. */
export const withRecentLogin = async <T>(user: User, change: () => Promise<T>): Promise<T> => {
  try {
    return await change();
  } catch (error) {
    if (errorCode(error) !== "auth/requires-recent-login") throw error;
    if (!(await reauthenticateWithProvider(user))) throw error;
    return change();
  }
};

export const getTotpFactors = (user: User): MultiFactorInfo[] =>
  multiFactor(user).enrolledFactors.filter(
    (factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID,
  );

/** Step 1: creates the secret the user adds to an authenticator app. */
export const startTotpEnrollment = async (user: User): Promise<TotpSecret> => {
  const session = await multiFactor(user).getSession();
  return TotpMultiFactorGenerator.generateSecret(session);
};

/** Step 2: checks a code from the app and turns two-step verification on. */
export const finishTotpEnrollment = async (
  user: User,
  secret: TotpSecret,
  code: string,
  displayName: string,
): Promise<void> => {
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code);
  await multiFactor(user).enroll(assertion, displayName);
};

export const removeFactor = async (user: User, factor: MultiFactorInfo): Promise<void> => {
  await multiFactor(user).unenroll(factor);
};
