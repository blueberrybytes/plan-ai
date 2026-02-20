import React, { useEffect, useState } from "react";
import {
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth } from "../firebase";
import { AuthContext, type AuthContextValue } from "./useAuth";
import { createPlanAiApi } from "../services/planAiApi";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthContextValue["user"]>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        setToken(idToken);
      } else {
        setToken(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Receive the custom token from the system browser auth flow
  useEffect(() => {
    const unsubscribe = window.electron.onDesktopAuthToken(async (customToken) => {
      try {
        await signInWithCustomToken(auth, customToken);
      } catch (err) {
        console.error("Desktop auth token sign-in failed:", err);
      }
    });
    return unsubscribe;
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signInWithDesktopBrowser = async () => {
    await window.electron.openDesktopAuth();
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const api = React.useMemo(() => {
    return createPlanAiApi(async (forceRefresh?: boolean) => {
      const currentUser = auth.currentUser;
      if (!currentUser) return null;
      try {
        return await currentUser.getIdToken(forceRefresh);
      } catch (err) {
        console.error("Failed to get fresh Firebase token", err);
        return null;
      }
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, loading, signInWithEmail, signInWithDesktopBrowser, signOut, api }}
    >
      {children}
    </AuthContext.Provider>
  );
};
