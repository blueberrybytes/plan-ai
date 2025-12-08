import { auth } from "../firebase/firebase";
import { Dispatch } from "@reduxjs/toolkit";
import { setUser, logout } from "../store/slices/session/sessionSlice";
import { UserApp } from "../store/slices/session/sessionTypes";

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
   * Update Redux store with user info and token
   * @param dispatch Redux dispatch function
   * @param user Firebase user object
   * @param token Firebase ID token
   */
  static async updateUserInStore(dispatch: Dispatch, token?: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("No user is logged in");
    }

    if (!user.emailVerified) {
      try {
        await user.reload();
        console.log(
          "TokenService.updateUserInStore: user reloaded. emailVerified=",
          user.emailVerified,
          "providerIds=",
          user.providerData.map((provider) => provider.providerId),
        );
      } catch (reloadError) {
        console.warn(
          "TokenService.updateUserInStore: failed to reload user before provider check",
          reloadError,
        );
      }
    }

    const hasNonPasswordProvider = user.providerData.some(
      (provider) => provider.providerId !== "password",
    );

    console.log(
      "TokenService.updateUserInStore: evaluated provider data",
      user.providerData.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })),
      "hasNonPasswordProvider=",
      hasNonPasswordProvider,
    );

    if (!user.emailVerified && !hasNonPasswordProvider) {
      console.log("TokenService.updateUserInStore: email not verified, skipping Redux user set");
      return;
    }

    const idToken = token || (await user.getIdToken());

    // Create user info object with the UserInfo type
    const userInfo: UserInfo = {
      uid: user.uid,
      email: user.email || "",
      token: idToken,
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
      console.log("Starting token refresh process...");

      try {
        // Check if we're actually logged in first
        let firebaseUser = auth.currentUser;
        let waitAttempts = 0;
        const maxWaitAttempts = 3;

        // If no user initially, wait longer for auth state to potentially recover
        while (!firebaseUser && waitAttempts < maxWaitAttempts) {
          waitAttempts++;
          console.log(
            `No Firebase user found initially, waiting for auth state recovery... (attempt ${waitAttempts}/${maxWaitAttempts})`,
          );

          // Progressive wait times: 2s, 3s, 4s
          const waitTime = 1000 + waitAttempts * 1000;
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          firebaseUser = auth.currentUser;

          if (firebaseUser) {
            console.log(`Firebase user recovered after ${waitAttempts} attempts`);
            break;
          }
        }

        if (!firebaseUser) {
          console.error(
            `No Firebase user found after ${maxWaitAttempts} attempts and ${(maxWaitAttempts * (maxWaitAttempts + 1)) / 2 + maxWaitAttempts} seconds of waiting`,
          );
          return null; // Return null but don't throw an error or logout
        }

        console.log("Firebase user found, attempting token refresh");

        // Create a single refresh promise that all concurrent requests can use
        TokenService.refreshPromise = this.refreshToken();
        const newToken = await TokenService.refreshPromise;

        // Update the token in Redux store
        await this.updateUserInStore(dispatch, newToken);

        console.log("Token refresh successful - new token obtained and stored");
        return newToken;
      } catch (error) {
        console.error("Error refreshing token:", error);

        // Check if the error is due to token expiry vs other issues
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (
          errorMessage.includes("auth/id-token-expired") ||
          errorMessage.includes("Token has already expired")
        ) {
          console.log("Token expired - this is expected, will attempt recovery");
          // Don't logout immediately for expired tokens, let the auth flow handle it
          return null;
        }

        // Only log out if there was a Firebase user and token refresh genuinely failed for other reasons
        if (auth.currentUser) {
          console.log("Token refresh failed for logged in user with non-expiry error, logging out");
          dispatch(logout());
        } else {
          console.log("Token refresh failed but no user found, not logging out");
        }
        return null;
      } finally {
        TokenService.isRefreshing = false;
        TokenService.refreshPromise = null;
        console.log("Token refresh process completed");
      }
    } else if (TokenService.refreshPromise) {
      // If another request is already refreshing, wait for that to complete
      console.log("Token refresh already in progress, waiting for completion...");
      try {
        const newToken = await TokenService.refreshPromise;
        console.log(
          "Waited for existing token refresh, got result:",
          newToken ? "success" : "failed",
        );
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
