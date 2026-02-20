/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response, NextFunction } from "express";
import prisma from "../prisma/prismaClient";
import { firebaseAdmin } from "../firebase/firebaseAdmin";
import { Role } from "@prisma/client";

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

    // Fetch user from DB
    const dbUser = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { role: true }, // Only fetch the role
    });

    if (!dbUser) {
      console.error("[AuthMiddleware] User not found in database:", userEmail);
      res.status(403).json({ message: "Unauthorized: User not found" });
      return;
    } else {
      (req as any).userRole = dbUser.role;
    }

    next();
  } catch (error) {
    console.error("[AuthMiddleware] Unexpected error:", error);
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

          // Fetch user from DB
          return prisma.user
            .findUnique({
              where: { email: userEmail },
              select: { role: true },
            })
            .then((dbUser) => {
              if (!dbUser) {
                throw new Error("User not found");
              }

              return { decodedToken, dbUser, userEmail };
            });
        })
        .then(({ decodedToken, dbUser, userEmail }) => {
          // Set user role on request object for later use
          request.userRole = dbUser.role;

          // Handle different security schemes
          switch (securityName) {
            case "BearerAuth":
              // Basic authentication, just need a valid token
              resolve({
                uid: decodedToken.uid,
                email: userEmail,
                role: dbUser.role,
              });
              break;

            case "AdminOnly":
              // Check if user is an admin
              if (dbUser.role === Role.ADMIN) {
                resolve({
                  uid: decodedToken.uid,
                  email: userEmail,
                  role: dbUser.role,
                });
              } else {
                reject(new Error("Admin role required"));
              }
              break;

            case "ClientLevel":
              // Check if user has any valid role (Client, Account, or Admin)
              if (dbUser.role === Role.ADMIN || dbUser.role === Role.CLIENT) {
                resolve({
                  uid: decodedToken.uid,
                  email: userEmail,
                  role: dbUser.role,
                });
              } else {
                reject(new Error("Insufficient permissions"));
              }
              break;

            default:
              reject(new Error(`Unknown security scheme: ${securityName}`));
          }
        })
        .catch((error) => {
          console.error("Error authenticating user:", error);
          reject(error);
        });
    } catch (error) {
      console.error("Error authenticating user:", error);
      reject(error);
    }
  });
}
