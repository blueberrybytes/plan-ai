import { auth } from "../firebase/firebase";
import { Dispatch } from "@reduxjs/toolkit";
import { setUser, logout } from "../store/slices/auth/authSlice";
import { UserApp } from "../store/slices/auth/authTypes";
import { reportUnexpectedError } from "../utils/reportError";

// Define user information type for Redux store updates
type UserInfo = UserApp;

// These variables are now static class properties to allow access from other modules

/**
 * Centralized token management service
 * Handles both proactive and reactive token refreshing
 */
export class TokenService {
  // Static properties to track token refresh state
  static isRefreshing = false;
  static refreshPromise: Promise<string> | null = null;
  /**
   * Force refresh the Firebase token
   * @returns Promise with the new token
   */
  static async refreshToken(): Promise<string> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("No user is logged in");
    }
    // Force refresh the token
    return user.getIdToken(true);
  }

  /**
   * Returns the Firebase ID token of the signed-in user, or null when nobody is signed in.
   *
   * The token is read from Firebase at request time and is never copied into Redux,
   * so it is never written to localStorage by redux-persist. On page load it waits
   * until Firebase has restored the session, so early requests still carry a token.
   * Firebase caches the token and refreshes it when it is close to expiry.
   */
  static async getIdToken(forceRefresh = false): Promise<string | null> {
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken(forceRefresh);
  }

  /**
   * Authorization header for fetch calls made outside RTK Query.
   * Returns an empty object when nobody is signed in.
   */
  static async getAuthHeaders(): Promise<Record<string, string>> {
    // Without a token the request gets a 401, which the caller already handles.
    const token = await TokenService.getIdToken().catch((error: unknown) => {
      reportUnexpectedError("auth.readToken", error);
      return null;
    });
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Update Redux store with the signed-in user's profile info.
   * The ID token is deliberately not stored; use getIdToken() when a request needs it.
   * @param dispatch Redux dispatch function
   */
  static async updateUserInStore(dispatch: Dispatch): Promise<void> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("No user is logged in");
    }

    // Removed user.reload() because it triggers onAuthStateChanged implicitly in Firebase v9+,
    // causing an unstoppable infinite recursion loop when invoked during the initial auth listener.

    const hasNonPasswordProvider = user.providerData.some(
      (provider) => provider.providerId !== "password",
    );

    if (!user.emailVerified && !hasNonPasswordProvider) {
      return;
    }

    // Create user info object with the UserInfo type
    const userInfo: UserInfo = {
      uid: user.uid,
      email: user.email || "",
      creationTime: user.metadata.creationTime || "",
      lastSignInTime: user.metadata.lastSignInTime || "",
      emailVerified: user.emailVerified || hasNonPasswordProvider,
    };

    dispatch(setUser(userInfo));
  }

  /**
   * Handle reactive token refresh when API calls fail due to auth errors
   * @param dispatch Redux dispatch function
   * @param currentUser Current user from Redux store
   * @returns Promise with the new token
   */
  static async handleTokenRefresh(dispatch: Dispatch): Promise<string | null> {
    // If we're not already refreshing the token
    if (!TokenService.isRefreshing) {
      TokenService.isRefreshing = true;

      try {
        // Check if we're actually logged in first
        let firebaseUser = auth.currentUser;
        let waitAttempts = 0;
        const maxWaitAttempts = 3;

        // If no user initially, wait longer for auth state to potentially recover
        while (!firebaseUser && waitAttempts < maxWaitAttempts) {
          waitAttempts++;

          // Progressive wait times: 2s, 3s, 4s
          const waitTime = 1000 + waitAttempts * 1000;
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          firebaseUser = auth.currentUser;

          if (firebaseUser) {
            break;
          }
        }

        if (!firebaseUser) {
          console.error(
            `No Firebase user found after ${maxWaitAttempts} attempts and ${(maxWaitAttempts * (maxWaitAttempts + 1)) / 2 + maxWaitAttempts} seconds of waiting`,
          );
          return null; // Return null but don't throw an error or logout
        }

        // Create a single refresh promise that all concurrent requests can use
        TokenService.refreshPromise = this.refreshToken();
        const newToken = await TokenService.refreshPromise;

        // Refresh the profile info in Redux (the token itself stays in Firebase)
        await this.updateUserInStore(dispatch);

        return newToken;
      } catch (error) {
        console.error("Error refreshing token:", error);

        // Check if the error is due to token expiry vs other issues
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (
          errorMessage.includes("auth/id-token-expired") ||
          errorMessage.includes("Token has already expired")
        ) {
          // Don't logout immediately for expired tokens, let the auth flow handle it
          return null;
        }

        // Only log out for explicit fatal authentication errors
        if (
          auth.currentUser &&
          (errorMessage.includes("auth/user-disabled") ||
            errorMessage.includes("auth/user-not-found") ||
            errorMessage.includes("auth/invalid-user-token"))
        ) {
          dispatch(logout());
        }
        return null;
      } finally {
        TokenService.isRefreshing = false;
        TokenService.refreshPromise = null;
      }
    } else if (TokenService.refreshPromise) {
      // If another request is already refreshing, wait for that to complete

      try {
        const newToken = await TokenService.refreshPromise;

        return newToken;
      } catch (err) {
        console.error("Error waiting for existing token refresh:", err);
        return null;
      }
    }
    return null;
  }

  /**
   * Decode JWT token and extract expiration time
   * @param token JWT token
   * @returns Expiration time in milliseconds or null if parsing fails
   */
  static getTokenExpirationTime(token: string): number | null {
    try {
      // Get token parts - Firebase tokens are properly formatted JWTs
      const tokenParts = token.split(".");

      // Check if the token is properly formatted
      if (tokenParts.length !== 3) {
        console.error("Invalid token format - expected JWT with 3 parts");
        return null;
      }

      // Decode the payload part (second part)
      const payloadBase64 = tokenParts[1];

      // Add padding to base64 string if needed
      const base64 = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
      const pad = base64.length % 4;
      const paddedBase64 = pad ? base64 + "=".repeat(4 - pad) : base64;

      let payload;
      try {
        // For web environment - use atob
        const decodedString = atob(paddedBase64);
        payload = JSON.parse(decodedString);
      } catch (atobError) {
        console.warn("atob decoding failed, falling back to alternative method", atobError);
        // Fallback method for older browsers or edge cases
        payload = JSON.parse(decodeURIComponent(escape(window.atob(paddedBase64))));
      }

      // Validate the payload and extract expiration time
      if (!payload || typeof payload.exp !== "number") {
        console.error("Token payload missing expiration time:", payload);
        return null;
      }

      // Extract expiration time
      return payload.exp * 1000; // Convert to milliseconds
    } catch (error) {
      console.error("Error decoding token:", error);
      return null;
    }
  }

  /**
   * Calculate time until token refresh is needed
   * @param token JWT token
   * @returns Time in milliseconds until refresh or fallback value
   */
  static getTimeUntilRefresh(token: string): number {
    const FALLBACK_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

    const expirationTime = this.getTokenExpirationTime(token);
    if (!expirationTime) {
      return FALLBACK_REFRESH_INTERVAL;
    }

    const currentTime = Date.now();

    // Validate that expiration is in the future
    if (expirationTime <= currentTime) {
      console.warn("Token has already expired");
      return 0;
    }

    // Calculate refresh time: 10 minutes before token expiration (more aggressive)
    return Math.max(0, expirationTime - currentTime - 10 * 60 * 1000);
  }
}
