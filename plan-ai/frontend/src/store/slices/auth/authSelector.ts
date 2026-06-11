import { RootState } from "../../store";
import { UserApp } from "./authTypes";

export const selectUser = (state: RootState) => state.auth.user;

// Typed selector for user with UserApp type
export const selectUserApp = (state: RootState): UserApp | null => state.auth.user as UserApp;

export const selectIsLoading = (state: RootState) => state.auth.isLoading;

export const selectErrorSession = (state: RootState) => state.auth.errorSession;

export const selectAvatar = (state: RootState) =>
  state.auth.avatar || state.auth.userDb?.avatar || null;

export const selectUserDb = (state: RootState) => state.auth.userDb;
