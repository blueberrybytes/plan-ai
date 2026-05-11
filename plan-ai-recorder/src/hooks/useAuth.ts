import { createContext, useContext } from "react";
import type { User } from "firebase/auth";
import type { Workspace } from "../services/planAiApi";

export interface AuthContextValue {
  user: User | null;
  dbUser: { role: string; name: string | null; hasCompletedOnboarding?: boolean } | null;
  token: string | null;
  loading: boolean;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string) => void;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithDesktopBrowser: (provider?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refetchDbUser: () => Promise<void>;
  refetchWorkspaces: () => Promise<void>;
  api: ReturnType<typeof import("../services/planAiApi").createPlanAiApi>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
