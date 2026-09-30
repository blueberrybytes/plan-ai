import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { selectUser } from "../store/slices/auth/authSelector";
import { TokenService } from "../services/tokenService";
import { reportUnexpectedError } from "../utils/reportError";

/**
 * Proactive Firebase token refresh.
 *
 * Firebase ID tokens expire after 1 hour. Requests read the token from Firebase at
 * request time (TokenService.getIdToken), and Firebase refreshes it on demand. This
 * hook refreshes it about 10 minutes before expiry, so the first request after that
 * does not wait for the refresh. The token is never copied into Redux.
 */

// Never schedule refreshes closer than this, to avoid a tight loop on odd tokens.
const MIN_REFRESH_DELAY_MS = 60 * 1000;

export const useTokenRefresh = (): void => {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const uid = user?.uid;
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // No user: nothing to refresh (also stops refreshing after logout)
    if (!uid) return;

    let cancelled = false;

    const clearRefreshTimer = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };

    const scheduleNextRefresh = async () => {
      clearRefreshTimer();

      let token: string | null = null;
      try {
        token = await TokenService.getIdToken();
      } catch (error) {
        console.error("Could not read the current token:", error);
        reportUnexpectedError("auth.readToken", error);
        // Try again later (for example after the network is back), so the
        // proactive refresh does not stop for the rest of the session.
        if (!cancelled) {
          refreshTimerRef.current = setTimeout(
            () => void scheduleNextRefresh(),
            MIN_REFRESH_DELAY_MS,
          );
        }
        return;
      }
      if (cancelled || !token) return;

      const delay = Math.max(TokenService.getTimeUntilRefresh(token), MIN_REFRESH_DELAY_MS);
      refreshTimerRef.current = setTimeout(async () => {
        try {
          // Ask Firebase for a new token before the current one expires
          await TokenService.getIdToken(true);
          await TokenService.updateUserInStore(dispatch);
        } catch (error) {
          console.error("Failed to refresh token:", error);
          reportUnexpectedError("auth.refreshToken", error);
        }
        if (!cancelled) void scheduleNextRefresh();
      }, delay);
    };

    void scheduleNextRefresh();

    // Cleanup on unmount, logout or user change
    return () => {
      cancelled = true;
      clearRefreshTimer();
    };
  }, [dispatch, uid]);
};
