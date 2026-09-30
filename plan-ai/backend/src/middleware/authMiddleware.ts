/* eslint-disable @typescript-eslint/no-explicit-any */
import { timingSafeEqual } from "crypto";
import { Request, Response, NextFunction } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import prisma from "../prisma/prismaClient";
import { firebaseAdmin } from "../firebase/firebaseAdmin";
import { Role } from "@prisma/client";
import * as Sentry from "@sentry/node";
import { logger } from "../utils/logger";

export interface AuthenticatedUser {
  uid: string;
  email: string;
  /** Set by authenticateUser (Express routers). */
  authRole?: Role;
  /** Set by expressAuthentication (TSOA routes). */
  role?: Role;
  emailVerified?: boolean;
  /** Firebase `sign_in_provider`, e.g. "google.com", "password", "saml.acme". */
  signInProvider?: string;
  /** Firebase `sign_in_second_factor`, set when the sign-in used MFA. */
  secondFactor?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  userRole?: Role;
}

// Firebase ID tokens live one hour. Checking revocation on every request
// means one call to Firebase each time, so the account state is cached for a
// minute: a disabled user or a "sign out everywhere" takes effect within 60 s.
const ACCOUNT_STATE_TTL_MS = 60_000;
const ACCOUNT_STATE_MAX_ENTRIES = 10_000;
const accountState = new Map<string, { validAfterSec: number; disabled: boolean; at: number }>();

const revokedError = (code: string, message: string) => Object.assign(new Error(message), { code });

// Firebase being down fails this check on every request: report it to
// Sentry once a minute, not once per request.
let lastAccountCheckReport = 0;

async function assertNotRevoked(decoded: DecodedIdToken): Promise<void> {
  const now = Date.now();
  let state = accountState.get(decoded.uid);
  if (!state || now - state.at > ACCOUNT_STATE_TTL_MS) {
    try {
      const record = await firebaseAdmin.auth().getUser(decoded.uid);
      state = {
        validAfterSec: record.tokensValidAfterTime
          ? Math.floor(Date.parse(record.tokensValidAfterTime) / 1000)
          : 0,
        disabled: record.disabled,
        at: now,
      };
      if (accountState.size >= ACCOUNT_STATE_MAX_ENTRIES) accountState.clear();
      accountState.set(decoded.uid, state);
    } catch (err: any) {
      if (err?.code === "auth/user-not-found") {
        throw revokedError("auth/user-disabled", "The account no longer exists");
      }
      // Firebase unreachable: keep serving with the last known state rather
      // than taking the whole API down. The token signature is still checked.
      if (now - lastAccountCheckReport > 60_000) {
        lastAccountCheckReport = now;
        logger.error("[Auth] Could not check account state with Firebase", err);
      } else {
        logger.warn(`[Auth] Could not check account state for ${decoded.uid}: ${err?.message}`);
      }
      if (!state) return;
    }
  }
  if (state.disabled) throw revokedError("auth/user-disabled", "The account is disabled");
  if (decoded.auth_time < state.validAfterSec) {
    throw revokedError("auth/id-token-revoked", "The session was revoked");
  }
}

/** Verifies a Firebase ID token and checks the account is not disabled or signed out. */
export async function verifyFirebaseIdToken(token: string): Promise<DecodedIdToken> {
  const decoded = await firebaseAdmin.auth().verifyIdToken(token);
  await assertNotRevoked(decoded);
  return decoded;
}

/**
 * How the user signed in. Sessions of the desktop recorder and the mobile
 * Microsoft sign-in start from a custom token the backend mints; Firebase
 * reports those as "custom", so the original provider and second factor
 * travel as claims inside the token (only the backend can mint one).
 */
export const signInInfoFromToken = (
  decoded: DecodedIdToken,
): { email?: string; signInProvider?: string; secondFactor?: string } => {
  const provider = decoded.firebase?.sign_in_provider;
  if (provider === "custom") {
    return {
      email: decoded.email,
      signInProvider: typeof decoded.pa_sip === "string" ? decoded.pa_sip : "custom",
      secondFactor: typeof decoded.pa_mfa === "string" ? decoded.pa_mfa : undefined,
    };
  }
  return {
    email: decoded.email,
    signInProvider: provider,
    secondFactor: decoded.firebase?.sign_in_second_factor,
  };
};

/** Claims for a custom token that carries on the sign-in of the session that asked for it. */
export const signInClaims = (signIn: {
  signInProvider?: string | null;
  secondFactor?: string | null;
}): Record<string, string> => ({
  ...(signIn.signInProvider ? { pa_sip: signIn.signInProvider } : {}),
  ...(signIn.secondFactor ? { pa_mfa: signIn.secondFactor } : {}),
});

const toAuthenticatedUser = (decoded: DecodedIdToken): AuthenticatedUser => {
  const signIn = signInInfoFromToken(decoded);
  return {
    uid: decoded.uid,
    email: decoded.email ?? "",
    emailVerified: decoded.email_verified === true,
    signInProvider: signIn.signInProvider,
    secondFactor: signIn.secondFactor,
  };
};

// Tag errors with the user id and workspace, never the email: Sentry is a
// third party and does not need it.
const tagSentryScope = (req: Request, uid: string): void => {
  try {
    const wsHeader = req.headers["x-workspace-id"];
    const workspaceId = Array.isArray(wsHeader) ? wsHeader[0] : wsHeader;
    const scope = Sentry.getCurrentScope();
    scope.setUser({ id: uid });
    if (workspaceId) scope.setTag("workspaceId", workspaceId);
    scope.setTag("route", `${req.method} ${req.path}`);
  } catch {
    // ignore: scope mutation must never break the request
  }
};

// The admin key unlocks global admin rights, so a short or default value
// (the old template shipped "test123") is treated as no key at all.
const MIN_ADMIN_KEY_LENGTH = 32;

const adminKeyMatches = (request: Request): boolean => {
  const envKey = process.env.API_ADMIN_KEY ?? "";
  if (envKey.length < MIN_ADMIN_KEY_LENGTH) return false;
  const headerKey = request.headers["x-admin-key"];
  const provided = Array.isArray(headerKey) ? headerKey[0] : headerKey;
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(envKey);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Middleware to authenticate Firebase users.
 */
export const authenticateUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];

    if (!token) {
      res.status(401).json({ message: "Unauthorized: No token provided" });
      return;
    }

    let decodedToken: DecodedIdToken;
    try {
      decodedToken = await verifyFirebaseIdToken(token);
    } catch (e: any) {
      logger.warn(`[AuthMiddleware] Firebase token rejected: ${e?.code ?? e?.message}`);
      res.status(401).json({ message: "Unauthorized: Invalid token" });
      return;
    }

    req.user = { ...toAuthenticatedUser(decodedToken), authRole: decodedToken.role || Role.CLIENT };
    tagSentryScope(req, decodedToken.uid);

    const dbUser = await prisma.user.findUnique({
      where: { firebaseUid: decodedToken.uid },
      select: { role: true },
    });

    if (!dbUser) {
      logger.warn(`[AuthMiddleware] No database user for firebaseUid ${decodedToken.uid}`);
      res.status(403).json({ message: "Unauthorized: User not found in db" });
      return;
    }
    req.userRole = dbUser.role;

    next();
  } catch (error) {
    logger.error("[AuthMiddleware] Unexpected error", error);
    res.status(500).json({ message: "Internal server error" });
    return;
  }
};

/**
 * Authentication middleware for TSOA with role-based access control
 */
export function expressAuthentication(
  request: AuthenticatedRequest,
  securityName: string,
): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      // Shortcut: allow AdminOnly via x-admin-key for service-to-service/admin automation
      if (
        (securityName === "AdminOnly" || securityName === "AdminKey") &&
        adminKeyMatches(request)
      ) {
        return resolve({ uid: "admin-key", email: "admin@local", role: Role.ADMIN });
      }
      if (securityName === "AdminKey") {
        reject(new Error("Invalid or missing x-admin-key"));
        return;
      }

      const authHeader = request.headers.authorization;
      if (!authHeader) {
        reject(new Error("No authorization header provided"));
        return;
      }

      const token = authHeader.split("Bearer ")[1];
      if (!token) {
        reject(new Error("Invalid authorization format. Expected 'Bearer [token]'"));
        return;
      }

      verifyFirebaseIdToken(token)
        .then((decodedToken) =>
          prisma.user
            .findUnique({
              where: { firebaseUid: decodedToken.uid },
              select: { role: true },
            })
            .then((dbUser) => ({ decodedToken, dbUser })),
        )
        .then(({ decodedToken, dbUser }) => {
          if (dbUser) {
            request.userRole = dbUser.role;
          }
          tagSentryScope(request, decodedToken.uid);
          const base = toAuthenticatedUser(decodedToken);

          switch (securityName) {
            case "BearerAuth":
              // Basic authentication, just need a valid token
              resolve({ ...base, role: dbUser ? dbUser.role : Role.PENDING });
              break;

            case "AdminOnly":
              if (dbUser && dbUser.role === Role.ADMIN) {
                resolve({ ...base, role: dbUser.role });
              } else {
                // 403 so the frontend can distinguish role failure from token failure (401)
                const adminErr: any = new Error("Admin role required");
                adminErr.status = 403;
                reject(adminErr);
              }
              break;

            case "ClientLevel":
              if (
                dbUser &&
                (dbUser.role === Role.ADMIN ||
                  dbUser.role === Role.CLIENT ||
                  dbUser.role === Role.PREMIUM)
              ) {
                resolve({ ...base, role: dbUser.role });
              } else {
                // 403 so the frontend can distinguish role failure from token failure (401)
                const roleErr: any = new Error("Insufficient permissions");
                roleErr.status = 403;
                reject(roleErr);
              }
              break;

            default:
              reject(new Error(`Unknown security scheme: ${securityName}`));
          }
        })
        .catch((error: any) => {
          if (typeof error?.code === "string" && error.code.startsWith("auth/")) {
            logger.warn(`[expressAuthentication] Firebase token rejected: ${error.code}`);
            const err: any = new Error("Unauthorized: Invalid or expired token");
            err.status = 401;
            reject(err);
            return;
          }

          logger.error("[expressAuthentication] Error authenticating user", error);
          reject(error);
        });
    } catch (error) {
      logger.error("[expressAuthentication] Error authenticating user", error);
      reject(error);
    }
  });
}
