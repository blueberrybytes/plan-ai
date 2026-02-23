import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { APP, AppStateType, LanguageEnum, ToastMessage, TokenExpirationWarning } from "./appTypes";
import { VersionInfo } from "../../../types/version";

const initialState: AppStateType = {
  toastMessage: null,
  language: LanguageEnum.EN,
  sidebarCollapsed: false,
  tokenExpirationWarning: null,
  appVersionBaseline: null,
  appVersionLatest: null,
  appUpdateAvailable: false,
};

export const appSlice = createSlice({
  name: APP,
  initialState,
  reducers: {
    resetAppAll: (state: AppStateType) => {
      state = initialState;
      return state;
    },
    setToastMessage: (state, action: PayloadAction<ToastMessage>) => {
      state.toastMessage = action.payload;
    },
    clearToastMessage: (state) => {
      state.toastMessage = null;
    },
    setLanguage: (state, action: PayloadAction<LanguageEnum>) => {
      state.language = action.payload;
    },
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
    },
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setTokenExpirationWarning: (state, action: PayloadAction<TokenExpirationWarning>) => {
      state.tokenExpirationWarning = action.payload;
    },
    clearTokenExpirationWarning: (state) => {
      state.tokenExpirationWarning = null;
    },
    dismissTokenExpirationWarning: (state) => {
      if (state.tokenExpirationWarning) {
        state.tokenExpirationWarning.visible = false;
        // Dismiss for 24 hours
        const dismissUntil = new Date();
        dismissUntil.setHours(dismissUntil.getHours() + 24);
        state.tokenExpirationWarning.dismissedUntil = dismissUntil;
      }
    },
    // Versioning
    setAppVersionBaseline: (state, action: PayloadAction<VersionInfo>) => {
      state.appVersionBaseline = action.payload;
    },
    setAppVersionLatest: (state, action: PayloadAction<VersionInfo>) => {
      state.appVersionLatest = action.payload;
    },
    setAppUpdateAvailable: (state, action: PayloadAction<boolean>) => {
      state.appUpdateAvailable = action.payload;
    },
    resetAppVersioning: (state) => {
      state.appVersionBaseline = null;
      state.appVersionLatest = null;
      state.appUpdateAvailable = false;
    },
  },
});

export const {
  resetAppAll,
  setToastMessage,
  clearToastMessage,
  setLanguage,
  setSidebarCollapsed,
  toggleSidebar,
  setTokenExpirationWarning,
  clearTokenExpirationWarning,
  dismissTokenExpirationWarning,
  setAppVersionBaseline,
  setAppVersionLatest,
  setAppUpdateAvailable,
  resetAppVersioning,
} = appSlice.actions;

export default appSlice.reducer;
