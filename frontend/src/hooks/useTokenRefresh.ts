import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { selectUser } from "../store/slices/session/sessionSelector";
import { TokenService } from "../services/tokenService";

/**
 * Custom hook to handle proactive Firebase token refresh
 *
 * Firebase ID tokens expire after 1 hour by default.
 * This hook sets up an interval to refresh the token before expiration.
 *
 * The hook handles:
 * 1. Proactive token refresh before expiration
 * 2. Proper cleanup on logout or component unmount
 * 3. Prevention of excessive refresh attempts
 */

// Single refresh flag to prevent multiple simultaneous refresh attempts across components
let isRefreshInProgress = false;

export const useTokenRefresh = () => {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastRefreshTimeRef = useRef<number>(0);

  // Use refs to track previous state for comparison
  const prevUserRef = useRef(user);

  useEffect(() => {
    // Immediately return if no user - prevents any token refresh attempts after logout
    if (!user) return () => {};

    // Function to refresh the token
    const refreshToken = async () => {
      // Skip if no user or token
      if (!user?.token) return;

      // Prevent multiple simultaneous refresh attempts
      if (isRefreshInProgress) return;

      // Prevent refreshing too frequently (minimum 1 minute between refreshes)
      const now = Date.now();
      if (now - lastRefreshTimeRef.current < 60000) return;

      try {
        isRefreshInProgress = true;
        await TokenService.updateUserInStore(dispatch);
        lastRefreshTimeRef.current = Date.now();
      } catch (error) {
        console.error("Failed to refresh token:", error);
      } finally {
        isRefreshInProgress = false;
      }
    };

    // Function to schedule the next token refresh
    const scheduleNextRefresh = () => {
      // Clear any existing timer first
      clearRefreshTimer();

      // Only schedule if we have a valid user and token
      if (!user?.token) return;

      try {
        // Ensure we have a valid token before calculating refresh time
        if (!user?.token) {
          console.log("No valid token available for refresh scheduling");
          return;
        }

        // Calculate time until refresh (TokenService uses 5 minutes before expiration)
        const timeUntilRefresh = TokenService.getTimeUntilRefresh(user.token);

        console.log(`Scheduling token refresh in ${Math.round(timeUntilRefresh / 1000)} seconds`);

        // If token is already expired or about to expire, refresh immediately
        if (timeUntilRefresh <= 60000) {
          // 1 minute or less - refresh immediately
          console.log("Token expires soon or has expired, refreshing immediately");
          refreshToken();
          // Schedule next check after 2 minutes to allow for recovery
          refreshTimerRef.current = setTimeout(scheduleNextRefresh, 120000);
          return;
        }

        // Schedule the next refresh
        refreshTimerRef.current = setTimeout(() => {
          // Check if user and token still exist before attempting refresh
          if (user?.token) {
            refreshToken().then(scheduleNextRefresh);
          }
        }, timeUntilRefresh);
      } catch (error) {
        console.error("Error scheduling token refresh:", error);

        // Use a conservative fallback interval (45 minutes)
        refreshTimerRef.current = setTimeout(refreshToken, 45 * 60 * 1000);
      }
    };

    // Helper to clear the refresh timer
    const clearRefreshTimer = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };

    // Detect user logout
    const wasLoggedOut = prevUserRef.current?.uid && !user?.uid;
    if (wasLoggedOut) {
      clearRefreshTimer();
    }

    // Update previous user reference
    prevUserRef.current = user;

    // Set up refresh timer if user is logged in
    if (user?.token) {
      scheduleNextRefresh();
    }

    // Cleanup on unmount or when dependencies change
    return clearRefreshTimer;
  }, [dispatch, user]);

  // This hook doesn't return anything
};
