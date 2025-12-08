import { SnackbarOrigin } from "@mui/material";
import { VersionInfo } from "../../../types/version";

export type AppStateType = {
  toastMessage: ToastMessage | null;
  language: LanguageEnum;
  sidebarCollapsed: boolean;
  tokenExpirationWarning: TokenExpirationWarning | null;
  // Frontend versioning (session-scoped)
  appVersionBaseline: VersionInfo | null;
  appVersionLatest: VersionInfo | null;
  appUpdateAvailable: boolean;
};

export enum LanguageEnum {
  EN = "en",
  ES = "es",
}

export type ToastMessage = {
  message: string;
  severity?: "success" | "error" | "warning" | "info";
  autoHideDuration?: number;
  anchorOrigin?: SnackbarOrigin;
};

export type TokenExpirationWarning = {
  message: string;
  expiringIntegrations: number;
  expiredIntegrations: number;
  visible: boolean;
  dismissedUntil?: Date;
};

export const APP = "app";
