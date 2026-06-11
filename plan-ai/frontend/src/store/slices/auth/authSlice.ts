/* eslint-disable @typescript-eslint/no-unused-vars */
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { LoginEmail, SESSION, SessionStateType, UserApp } from "./authTypes";
import { AppExceptionType } from "../../../types/ErrorTypes";
import { User } from "../../../types/UserTypes";

const initialState: SessionStateType = {
  user: null,
  userDb: null,
  avatar: null,
  isLoading: false,
  isLoadingAvatar: false,
  errorSession: null,
};

export const authSlice = createSlice({
  name: SESSION,
  initialState,
  reducers: {
    setIsLoadingAvatar: (state: SessionStateType, action: PayloadAction<boolean>) => {
      state.isLoadingAvatar = action.payload;
    },
    resetSessionAll: () => {
      // Return the initial state directly to properly reset
      return initialState;
    },
    setIsLoading: (state: SessionStateType, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    loginEmail: (state: SessionStateType, action: PayloadAction<LoginEmail>) => {
      state.isLoading = true;
      state.errorSession = null;
    },
    loginGoogle: (state: SessionStateType) => {
      state.isLoading = true;
      state.errorSession = null;
    },
    loginApple: (state: SessionStateType) => {
      state.isLoading = true;
      state.errorSession = null;
    },
    loginMicrosoft: (state: SessionStateType) => {
      state.isLoading = true;
      state.errorSession = null;
    },
    clearSessionError: (state: SessionStateType) => {
      state.errorSession = null;
    },
    loginSuccess: (state: SessionStateType, action: PayloadAction<UserApp>) => {
      state.isLoading = false;
      state.user = action.payload;
      state.errorSession = null;
    },
    sessionError: (state: SessionStateType, action: PayloadAction<AppExceptionType>) => {
      state.isLoading = false;
      state.errorSession = action.payload;
    },
    signupEmail: (state: SessionStateType, action: PayloadAction<LoginEmail>) => {
      state.isLoading = true;
    },
    forgotPassword: (state: SessionStateType, action: PayloadAction<string>) => {
      state.isLoading = true;
    },
    setAvatar: (state: SessionStateType, action: PayloadAction<string>) => {
      state.avatar = action.payload;
    },
    setUser: (state: SessionStateType, action: PayloadAction<UserApp>) => {
      state.user = action.payload;
    },
    setUserDb: (state: SessionStateType, action: PayloadAction<User>) => {
      state.userDb = action.payload;
    },
    logout: (state: SessionStateType) => {
      // Clear all user state immediately in the reducer
      // This ensures auth headers are removed as soon as logout is triggered
      state.user = null;
      state.userDb = null;
      state.avatar = null;
      state.isLoading = false;
      state.isLoadingAvatar = false;
      state.errorSession = null;
    },
  },
});

export const {
  resetSessionAll,
  setIsLoading,
  setIsLoadingAvatar,
  loginEmail,
  loginGoogle,
  loginMicrosoft,
  loginApple,
  loginSuccess,
  sessionError,
  clearSessionError,
  signupEmail,
  forgotPassword,
  setAvatar,
  setUser,
  setUserDb,
  logout,
} = authSlice.actions;

export default authSlice.reducer;
