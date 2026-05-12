import React, { useEffect, useState, createContext, useContext } from "react";
import { useDispatch } from "react-redux";
import { auth } from "../firebase/firebase";
import { onAuthStateChanged } from "firebase/auth";
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
          "/auth/desktop",
        ];

        const isPublicRoute =
          publicRoutes.includes(currentPath) ||
          currentPath.startsWith("/p/") ||
          currentPath.startsWith("/doc/public/") ||
          currentPath.startsWith("/diagram/public/");

        if (isPublicRoute) {
          console.log(`On public route ${currentPath} - Firebase user is null`);
        } else {
          console.log(
            "Firebase auth state is null, but we are on a protected route. " +
              "Relying on API 401 responses to trigger session expiration instead of forceful client-side logout.",
          );
        }
      }

      // Mark authentication as initialized after first check
      setIsAuthInitialized((prev) => {
        if (!prev) {
          return true;
        }
        return prev;
      });
    });

    // Clean up subscription
    return () => unsubscribe();
  }, [dispatch]); // Removed isAuthInitialized to break the infinite remount loop

  return (
    <AuthContext.Provider value={{ isAuthInitialized, currentPath }}>
      {children}
    </AuthContext.Provider>
  );
};

export default FirebaseAuthProvider;
