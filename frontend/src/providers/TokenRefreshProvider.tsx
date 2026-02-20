import React from "react";
import { useSelector } from "react-redux";
import { selectUser } from "../store/slices/auth/authSelector";
import { useTokenRefresh } from "../hooks/useTokenRefresh";

// Separate component that only renders when a user is logged in
// This ensures the token refresh hook is only called when a user exists
const TokenRefresher: React.FC = () => {
  useTokenRefresh();
  return null; // This component doesn't render anything
};

/**
 * Provider component that handles Firebase token auto-refresh
 * This component doesn't render anything, it just conditionally initializes the token refresh
 */
const TokenRefreshProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Get user from Redux store
  const user = useSelector(selectUser);

  return (
    <>
      {/* Only render the TokenRefresher when a user is logged in */}
      {user?.uid ? <TokenRefresher /> : null}
      {children}
    </>
  );
};

export default TokenRefreshProvider;
