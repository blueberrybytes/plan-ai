import React, { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import {
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth } from "../firebase";
import { AuthContext, type AuthContextValue } from "./useAuth";
import { createPlanAiApi, type Workspace } from "../services/planAiApi";

const WORKSPACE_STORAGE_KEY = "plan-ai-recorder-active-workspace";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthContextValue["user"]>(null);
  const [dbUser, setDbUser] = useState<AuthContextValue["dbUser"]>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    () => localStorage.getItem(WORKSPACE_STORAGE_KEY),
  );

  // Keep a ref so the API factory's closure always reads the latest value
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId;
    if (activeWorkspaceId) {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, activeWorkspaceId);
    }
  }, [activeWorkspaceId]);

  // Define API here so it can be used inside useAuth directly
  const api = React.useMemo(() => {
    return createPlanAiApi(
      async (forceRefresh?: boolean) => {
        const currentUser = auth.currentUser;
        if (!currentUser) return null;
        try {
          return await currentUser.getIdToken(forceRefresh);
        } catch (err) {
          console.error("Failed to get fresh Firebase token", err);
          return null;
        }
      },
      () => activeWorkspaceIdRef.current,
    );
  }, []);

  const fetchDbUser = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const res = await api.getCurrentUser();
      setDbUser({ role: res.role, name: res.name, hasCompletedOnboarding: res.hasCompletedOnboarding });
    } catch (err) {
      console.error("Failed to fetch DB user:", err);
      setDbUser(null);
    }
  }, [api]);

  const fetchWorkspaces = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const ws = await api.getMyWorkspaces();
      setWorkspaces(ws);

      // Auto-select: prefer stored workspace if it still exists, otherwise pick first
      const stored = localStorage.getItem(WORKSPACE_STORAGE_KEY);
      const stillValid = ws.find((w) => w.id === stored);
      if (stillValid) {
        setActiveWorkspaceId(stillValid.id);
      } else if (ws.length > 0) {
        setActiveWorkspaceId(ws[0].id);
      } else {
        setActiveWorkspaceId(null);
      }
    } catch (err) {
      console.error("Failed to fetch workspaces:", err);
      setWorkspaces([]);
    }
  }, [api]);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        setToken(idToken);
        await fetchDbUser();
        await fetchWorkspaces();
      } else {
        setToken(null);
        setDbUser(null);
        setWorkspaces([]);
        setActiveWorkspaceId(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [fetchDbUser, fetchWorkspaces]);

  // Receive the OTP auth code from the system browser auth flow
  useEffect(() => {
    const unsubscribe = window.electron.onDesktopAuthCode(
      async (authCode: string) => {
        try {
          console.log("[AuthProvider] Exchanging desktop auth code for JWT...");
          // Ensure we hit the correct backend instance
          const baseUrl =
            import.meta.env.VITE_PLAN_AI_API_URL || "http://localhost:8080";
          const res = await axios.post(
            `${baseUrl}/api/session/desktop-exchange`,
            {
              code: authCode,
            },
          );

          if (!res.data?.data?.customToken) {
            throw new Error("Invalid exchange response");
          }

          console.log(
            "[AuthProvider] Code exchange successful. Signing in with Custom Token...",
          );
          const userCredential = await signInWithCustomToken(
            auth,
            res.data.data.customToken,
          );

          // CRITICAL Fix: The Web App intrinsically calls /api/session/login during normal OAuth flows,
          // but the Desktop CustomToken bypass completely skipped it. We must ping it here to ensure
          // the backend Prisma Database discovers that we linked an Apple Provider and sets `isAppleAccount`.
          try {
            const freshToken = await userCredential.user.getIdToken(true);
            console.log(
              "[AuthProvider] Pinging /api/session/login to synchronize Apple/Google provider flags in Postgres...",
            );
            await axios.post(
              `${baseUrl}/api/session/login`,
              {
                uuid: userCredential.user.uid,
                token: freshToken,
              },
              { headers: { Authorization: `Bearer ${freshToken}` } },
            );
            console.log(
              "[AuthProvider] Backend Database Synchronization complete!",
            );
            // Re-fetch dbUser and workspaces immediately after sync
            await fetchDbUser();
            await fetchWorkspaces();
          } catch (syncErr) {
            console.error(
              "[AuthProvider] Failed to sync Postgres provider flags:",
              syncErr,
            );
          }
        } catch (err) {
          console.error("Desktop auth token sign-in failed:", err);
        }
      },
    );
    return unsubscribe;
  }, [fetchDbUser, fetchWorkspaces]);

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signInWithDesktopBrowser = async (provider?: string) => {
    // Tells Electron to open the desktop login pop-up or external browser
    await window.electron.openDesktopAuth(provider);
  };

  const signOut = async () => {
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        dbUser,
        token,
        loading,
        workspaces,
        activeWorkspaceId,
        setActiveWorkspaceId,
        signInWithEmail,
        signInWithDesktopBrowser,
        signOut,
        refetchDbUser: fetchDbUser,
        refetchWorkspaces: fetchWorkspaces,
        api,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
