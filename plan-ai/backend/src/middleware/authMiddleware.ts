/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response, NextFunction } from "express";
import prisma from "../prisma/prismaClient";
import { firebaseAdmin } from "../firebase/firebaseAdmin";
import { Role } from "@prisma/client";
import * as Sentry from "@sentry/node";

export interface AuthenticatedRequest extends Request {
  user?: { uid: string; email: string; authRole: Role };
  userRole?: Role;
}

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
      console.error("[AuthMiddleware] No token provided in headers");
      res.status(401).json({ message: "Unauthorized: No token provided" });
      return;
    }

    // Verify Firebase token
    let decodedToken;
    try {
      decodedToken = await firebaseAdmin.auth().verifyIdToken(token || "");
    } catch (e: any) {
      console.error("[AuthMiddleware] Firebase token verify failed:", e.message);
      res.status(403).json({ message: "Unauthorized: Invalid token" });
      return;
    }

    const userEmail = decodedToken.email ?? "";
    console.log("[AuthMiddleware] Token verified for email:", userEmail);

    req.user = {
      uid: decodedToken.uid,
      email: userEmail,
      authRole: decodedToken.role || Role.CLIENT,
    };

    // Fetch user from DB using the secure Firebase UID
    const dbUser = await prisma.user.findUnique({
      where: { firebaseUid: decodedToken.uid },
      select: { role: true }, // Only fetch the role
    });

    if (!dbUser) {
      console.error(
        `[AuthMiddleware] User not found in database for firebaseUid: ${decodedToken.uid}, email: ${userEmail}. Sync might be failing.`,
      );
      Sentry.captureMessage(
        `AuthMiddleware: User not found in database for uid ${decodedToken.uid}`,
        {
          extra: { email: userEmail, uid: decodedToken.uid },
        },
      );
      res.status(403).json({ message: "Unauthorized: User not found in db" });
      return;
    } else {
      (req as any).userRole = dbUser.role;
    }

    next();
  } catch (error) {
    console.error("[AuthMiddleware] Unexpected error:", error);
    Sentry.captureException(error);
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
      if (securityName === "AdminOnly") {
        const headerKey = request.headers["x-admin-key"];
        const adminKeyHeader = Array.isArray(headerKey) ? headerKey[0] : headerKey;
        const envKey = process.env.API_ADMIN_KEY;
        if (adminKeyHeader && envKey && adminKeyHeader === envKey) {
          // Resolve as ADMIN without requiring Firebase token
          return resolve({
            uid: "admin-key",
            email: "admin@local",
            role: Role.ADMIN,
          });
        }
      }

      // Explicit AdminKey security scheme (via Swagger @Security("AdminKey"))
      if (securityName === "AdminKey") {
        const headerKey = request.headers["x-admin-key"];
        const adminKeyHeader = Array.isArray(headerKey) ? headerKey[0] : headerKey;
        const envKey = process.env.API_ADMIN_KEY;
        if (adminKeyHeader && envKey && adminKeyHeader === envKey) {
          return resolve({
            uid: "admin-key",
            email: "admin@local",
            role: Role.ADMIN,
          });
        }
        reject(new Error("Invalid or missing x-admin-key"));
        return;
      }

      // First, authenticate the user
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

      // Verify Firebase token
      firebaseAdmin
        .auth()
        .verifyIdToken(token)
        .then((decodedToken) => {
          const userEmail = decodedToken.email ?? "";

          // Fetch user from DB via Firebase UID which is the true source of identity
          return prisma.user
            .findUnique({
              where: { firebaseUid: decodedToken.uid },
              select: { role: true },
            })
            .then((dbUser) => {
              if (!dbUser) {
                console.warn(
                  `[expressAuthentication] User not found in database for firebaseUid: ${decodedToken.uid}, email: ${userEmail}. Passing through as PENDING.`,
                );
              }
              // Return dbUser as null if not found, let controllers handle 404
              return { decodedToken, dbUser, userEmail };
            });
        })
        .then(({ decodedToken, dbUser, userEmail }) => {
          // Set user role on request object for later use if it exists
          if (dbUser) {
            request.userRole = dbUser.role;
          }

          // Handle different security schemes
          switch (securityName) {
            case "BearerAuth":
              // Basic authentication, just need a valid token
              resolve({
                uid: decodedToken.uid,
                email: userEmail,
                role: dbUser ? dbUser.role : Role.PENDING,
              });
              break;

            case "AdminOnly":
              // Check if user is an admin
              if (dbUser && dbUser.role === Role.ADMIN) {
                resolve({
                  uid: decodedToken.uid,
                  email: userEmail,
                  role: dbUser.role,
                });
              } else {
                // 403 so the frontend can distinguish role failure from token failure (401)
                const adminErr: any = new Error("Admin role required");
                adminErr.status = 403;
                reject(adminErr);
              }
              break;

            case "ClientLevel":
              // Check if user has any valid role (Client, Premium, or Admin)
              if (
                dbUser &&
                (dbUser.role === Role.ADMIN ||
                  dbUser.role === Role.CLIENT ||
                  dbUser.role === Role.PREMIUM)
              ) {
                resolve({
                  uid: decodedToken.uid,
                  email: userEmail,
                  role: dbUser.role,
                });
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
          if (
            error?.code === "auth/id-token-expired" ||
            error?.code === "auth/argument-error" ||
            error?.code?.startsWith("auth/")
          ) {
            console.warn(
              `[expressAuthentication] Firebase token invalid/expired: ${error.message}`,
            );
            const err: any = new Error("Unauthorized: Invalid or expired token");
            err.status = 401;
            reject(err);
            return;
          }

          console.error("Error authenticating user in expressAuthentication chain:", error);
          Sentry.captureException(error);
          reject(error);
        });
    } catch (error) {
      console.error("Error authenticating user in expressAuthentication block:", error);
      Sentry.captureException(error);
      reject(error);
    }
  });
}
