import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { auth } from "../firebase/firebase";
import { selectUser } from "../store/slices/session/sessionSelector";
import { TokenService } from "../services/tokenService";
import { logout } from "../store/slices/session/sessionSlice";

interface RefreshTokenContextType {
  isRefreshing: boolean;
  lastRefreshed: Date | null;
  manualRefresh: () => Promise<string | null>;
}

const RefreshTokenContext = createContext<RefreshTokenContextType>({
  isRefreshing: false,
  lastRefreshed: null,
  manualRefresh: async () => null,
});

export const useRefreshToken = () => useContext(RefreshTokenContext);

interface RefreshTokenProviderProps {
  children: React.ReactNode;
}

export const RefreshTokenProvider: React.FC<RefreshTokenProviderProps> = ({ children }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshTimer, setRefreshTimer] = useState<NodeJS.Timeout | null>(null);

  const dispatch = useDispatch();
  const user = useSelector(selectUser);

  // Function to refresh token
  const refreshToken = useCallback(async (): Promise<string | null> => {
    if (isRefreshing) return null;

    setIsRefreshing(true);
    try {
      // Check if we're actually logged in
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        console.error("No Firebase user found when trying to refresh token");
        return null;
      }

      // Refresh token
      const newToken = await TokenService.refreshToken();

      // Update token in Redux store
      await TokenService.updateUserInStore(dispatch, newToken);

      // Update last refreshed timestamp
      setLastRefreshed(new Date());

      return newToken;
    } catch (error) {
      console.error("Error refreshing token:", error);

      // Only log out if there was a Firebase user and token refresh genuinely failed
      if (auth.currentUser) {
        console.log("Token refresh failed for logged in user, logging out");
        dispatch(logout());
      }

      return null;
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, dispatch]);

  // Schedule next token refresh based on expiration time
  const scheduleNextRefresh = useCallback(
    (token: string) => {
      // Clear any existing timer
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      // Get time until refresh is needed
      const timeUntilRefresh = TokenService.getTimeUntilRefresh(token);

      console.log(
        `Scheduling next token refresh in ${Math.round(timeUntilRefresh / 1000 / 60)} minutes`,
      );

      // Set new timer
      const timer = setTimeout(() => {
        console.log("Executing scheduled token refresh");
        refreshToken();
      }, timeUntilRefresh);

      setRefreshTimer(timer);
    },
    [refreshTimer, refreshToken],
  );

  // Effect to set up initial refresh schedule when user token changes
  useEffect(() => {
    if (user?.token) {
      scheduleNextRefresh(user.token);
    }

    return () => {
      // Clean up timer on unmount
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
    };
  }, [refreshTimer, scheduleNextRefresh, user?.token]);

  // Effect to schedule next refresh after a refresh occurs
  useEffect(() => {
    if (lastRefreshed && user?.token) {
      scheduleNextRefresh(user.token);
    }
  }, [lastRefreshed, scheduleNextRefresh, user?.token]);

  const contextValue: RefreshTokenContextType = {
    isRefreshing,
    lastRefreshed,
    manualRefresh: refreshToken,
  };

  return (
    <RefreshTokenContext.Provider value={contextValue}>{children}</RefreshTokenContext.Provider>
  );
};
