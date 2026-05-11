export {};

declare global {
  interface Window {
    gapi: {
      load: (apiName: string, config: { callback: () => void } | (() => void)) => void;
    };
    google: {
      picker?: {
        Action: {
          PICKED: string;
          CANCEL: string;
        };
        Response: {
          DOCUMENTS: string;
        };
        Feature: {
          MULTISELECT_ENABLED: string;
        };
        ViewId: {
          DOCS: string;
        };
        DocsView: new (viewId?: string) => DocsView;
        PickerBuilder: new () => PickerBuilder;
      };
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  hd: string;
  prompt: string;
  token_type: string;
  scope: string;
  state: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

export interface TokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}

export interface PickerDocument {
  id: string;
  name: string;
  mimeType: string;
  description: string;
  isShared: boolean;
  type: string;
  url: string;
}

export interface DocsView {
  setIncludeFolders: (include: boolean) => DocsView;
  setMimeTypes: (mimeTypes: string) => DocsView;
}

export interface PickerBuilder {
  addView: (view: DocsView) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setAppId: (appId: string) => PickerBuilder;
  setCallback: (callback: (data: PickerCallbackData) => void) => PickerBuilder;
  enableFeature: (feature: string) => PickerBuilder;
  build: () => Picker;
}

export interface Picker {
  setVisible: (visible: boolean) => void;
}

export interface PickerCallbackData {
  action: string;
  docs: PickerDocument[];
}
