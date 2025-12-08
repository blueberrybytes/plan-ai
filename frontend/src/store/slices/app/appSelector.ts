import { RootState } from "../../store";
import { LanguageEnum, TokenExpirationWarning } from "./appTypes";

export const selectToastMessage = (state: RootState) => state.app.toastMessage;

export const selectLanguage = (state: RootState) => state.app.language || LanguageEnum.EN;

export const selectSidebarCollapsed = (state: RootState) => state.app.sidebarCollapsed ?? false;

export const selectTokenExpirationWarning = (state: RootState): TokenExpirationWarning | null =>
  state.app.tokenExpirationWarning;
