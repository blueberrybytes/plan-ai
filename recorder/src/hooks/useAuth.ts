import { createContext, useContext } from "react";
import type { User } from "firebase/auth";

export interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithDesktopBrowser: () => Promise<void>;
  signOut: () => Promise<void>;
  api: ReturnType<typeof import("../services/planAiApi").createPlanAiApi>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
