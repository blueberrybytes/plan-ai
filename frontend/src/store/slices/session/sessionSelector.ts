import { RootState } from "../../store";
import { UserApp } from "./sessionTypes";

export const selectUser = (state: RootState) => state.session.user;

// Typed selector for user with UserApp type
export const selectUserApp = (state: RootState): UserApp | null => state.session.user as UserApp;

export const selectIsLoading = (state: RootState) => state.session.isLoading;

export const selectErrorSession = (state: RootState) => state.session.errorSession;

export const selectAvatar = (state: RootState) =>
  state.session.avatar || state.session.userDb?.avatar || null;

export const selectUserDb = (state: RootState) => state.session.userDb;
