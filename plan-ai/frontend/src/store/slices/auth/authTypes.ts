import { User } from "../../../types/UserTypes";
import { AppExceptionType } from "../../../types/ErrorTypes";

export type SessionStateType = {
  user: UserApp | null;
  userDb: User | null;
  isLoading: boolean;
  isLoadingAvatar: boolean;
  avatar: string | null;
  errorSession: AppExceptionType;
};

export type LoginEmail = {
  email: string;
  password: string;
};

export type UserApp = {
  email: string | null;
  uid: string;
  creationTime?: string;
  lastSignInTime?: string;
  // No ID token here: this slice is persisted to localStorage. Use TokenService.getIdToken().
  emailVerified: boolean;
  displayName?: string | null;
};

export const SESSION = "session";
