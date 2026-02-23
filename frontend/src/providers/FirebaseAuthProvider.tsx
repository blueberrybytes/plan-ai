import React, { useEffect, useState, createContext, useContext } from "react";
import { useDispatch } from "react-redux";
import { auth } from "../firebase/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { logout } from "../store/slices/auth/authSlice";
import { TokenService } from "../services/tokenService";

// Create a context to share auth initialization state
interface AuthContextType {
  isAuthInitialized: boolean;
  currentPath?: string;
}

export const AuthContext = createContext<AuthContextType>({
  isAuthInitialized: false,
});

// Custom hook to consume the auth context
export const useAuth = () => useContext(AuthContext);

/**
 * Provider component that syncs Firebase auth state with Redux
 * This initializes the Firebase auth listener and keeps the Redux state in sync
 */
const FirebaseAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const dispatch = useDispatch();
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>(window.location.pathname);

  // Log current path when it changes
  useEffect(() => {
    const handleLocationChange = () => {
      const newPath = window.location.pathname;
      setCurrentPath(newPath);
    };

    // Listen for path changes
    window.addEventListener("popstate", handleLocationChange);

    return () => {
      window.removeEventListener("popstate", handleLocationChange);
    };
  }, [currentPath]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Use TokenService to update Redux store with user info and token
          await TokenService.updateUserInStore(dispatch);
        } catch (error) {
          console.error("Error getting user token:", error);
          // Display an error but don't log out automatically - the token refresh mechanism might recover
          console.warn("Will attempt to recover or refresh token via other mechanisms");
        }
      } else {
        // When user becomes null, it could be due to token expiry
        // Check if we had a user before and attempt token refresh first
        const currentPath = window.location.pathname;
        const publicRoutes = [
          "/",
          "/privacy-policy",
          "/terms-of-service",
          "/login",
          "/signup",
          "/forgot-password",
          "/delete-my-data",
        ];

        if (publicRoutes.includes(currentPath)) {
          console.log(`On public route ${currentPath} - not dispatching logout`);
        } else {
          // Before logging out, check if this might be a token expiry issue
          // Give sufficient time for potential token refresh to occur
          console.log("User auth state lost - checking if token refresh is in progress");
          console.log(
            "Current path:",
            currentPath,
            "Token refresh in progress:",
            TokenService.isRefreshing,
          );

          // Wait longer to see if token refresh resolves the issue
          // This is critical for handling token expiry scenarios
          setTimeout(() => {
            // Re-check auth state after extended delay
            if (!auth.currentUser) {
              console.log("No user found after 5-second delay - dispatching logout");
              console.log("Final token refresh state:", TokenService.isRefreshing);
              dispatch(logout());
            } else {
              console.log("User auth state recovered after delay - not logging out");
            }
          }, 5000); // 5 second delay to allow for token refresh
        }
      }

      // Mark authentication as initialized after first check
      if (!isAuthInitialized) {
        console.log("Auth initialization completed");
        setIsAuthInitialized(true);
      }
    });

    // Clean up subscription
    return () => unsubscribe();
  }, [dispatch, isAuthInitialized]);

  return (
    <AuthContext.Provider value={{ isAuthInitialized, currentPath }}>
      {children}
    </AuthContext.Provider>
  );
};

export default FirebaseAuthProvider;
