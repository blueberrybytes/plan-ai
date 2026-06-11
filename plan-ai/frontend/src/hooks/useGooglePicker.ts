import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { setToastMessage } from "../store/slices/app/appSlice";
import { TokenResponse, PickerCallbackData, PickerDocument } from "../types/google";

interface GooglePickerParams {
  onPick: (fileIds: string[], accessToken: string, docs?: PickerDocument[]) => void;
  onCancel?: () => void;
  allowedMimeTypes?: string;
  multiple?: boolean;
  pickerType?: "file" | "folder";
}

export const useGooglePicker = () => {
  const dispatch = useDispatch();

  // Load the Picker API dynamically
  const loadPicker = useCallback(() => {
    if (!window.gapi) {
      dispatch(setToastMessage({ severity: "error", message: "Google API not loaded" }));
      return;
    }
    window.gapi.load("picker", { callback: () => undefined });
  }, [dispatch]);

  const openPicker = useCallback(
    ({
      onPick,
      onCancel,
      allowedMimeTypes = "application/vnd.google-apps.document,application/vnd.google-apps.presentation,application/vnd.google-apps.spreadsheet,application/pdf,text/plain,text/markdown",
      multiple = true,
      pickerType = "file",
    }: GooglePickerParams) => {
      const clientId =
        process.env.REACT_APP_GOOGLE_CLIENT_ID || process.env.REACT_APP_VITE_GOOGLE_CLIENT_ID;
      const apiKey =
        process.env.REACT_APP_GOOGLE_API_KEY || process.env.REACT_APP_VITE_GOOGLE_API_KEY;
      const appId = process.env.REACT_APP_GOOGLE_APP_ID || process.env.REACT_APP_VITE_GOOGLE_APP_ID;

      if (!clientId || !apiKey || !appId) {
        dispatch(
          setToastMessage({
            severity: "error",
            message: "Missing Google configuration variables.",
          }),
        );
        return;
      }

      if (!window.google?.accounts?.oauth2) {
        dispatch(
          setToastMessage({
            severity: "error",
            message: "Google Identity Client not loaded completely.",
          }),
        );
        return;
      }

      const showPicker = (tokenResponse: TokenResponse) => {
        console.log(
          "showPicker started. Token:",
          tokenResponse.access_token ? "exists" : "missing",
        );
        const pickerModule = window.google?.picker;
        if (!pickerModule) {
          console.error("Picker library failed to initialize", window.google);
          dispatch(
            setToastMessage({ severity: "error", message: "Picker library failed to initialize." }),
          );
          return;
        }

        console.log("Building picker with appId:", appId);
        try {
          let view;
          if (pickerType === "folder") {
            view = new pickerModule.DocsView(pickerModule.ViewId.FOLDERS);
            view.setIncludeFolders(true);
            view.setSelectFolderEnabled(true);
            view.setMimeTypes("application/vnd.google-apps.folder");
          } else {
            view = new pickerModule.DocsView(pickerModule.ViewId.DOCS);
            view.setIncludeFolders(true);
            if (allowedMimeTypes) {
              view.setMimeTypes(allowedMimeTypes);
            }
          }

          console.log("Picker builder created successfully");
          const pickerBuilder = new pickerModule.PickerBuilder()
            .addView(view)
            .setOAuthToken(tokenResponse.access_token as string)
            .setDeveloperKey(apiKey)
            .setAppId(appId)
            .setCallback((data: PickerCallbackData) => {
              if (data.action === pickerModule.Action.PICKED) {
                const docs = data[
                  pickerModule.Response.DOCUMENTS as keyof PickerCallbackData
                ] as unknown as PickerDocument[];
                const fileIds = docs.map((doc: PickerDocument) => doc.id);
                onPick(fileIds, tokenResponse.access_token, docs);
              } else if (data.action === pickerModule.Action.CANCEL) {
                if (onCancel) onCancel();
              }
            });

          if (multiple) {
            pickerBuilder.enableFeature(pickerModule.Feature.MULTISELECT_ENABLED);
          }

          const picker = pickerBuilder.build();
          console.log("Picker built successfully, setting visible to true", picker);
          picker.setVisible(true);
        } catch (e) {
          console.error("FATAL ERROR building picker:", e);
          dispatch(
            setToastMessage({ severity: "error", message: "Failed to construct the Picker UI." }),
          );
        }
      };

      // 1. Request an access token specific to the frontend
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/drive.file",
        callback: (tokenResponse: TokenResponse) => {
          if (tokenResponse.error !== undefined) {
            console.error("Token error: ", tokenResponse.error);
            dispatch(
              setToastMessage({
                severity: "error",
                message: "Failed to authenticate with Google.",
              }),
            );
            return;
          }

          // 2. Token received! Now lazily load the Picker module if needed!
          console.log("Token callback fired. Token:", tokenResponse);
          if (!window.google?.picker) {
            if (!window.gapi) {
              console.error("window.gapi is completely missing!");
              dispatch(
                setToastMessage({
                  severity: "error",
                  message: "Google API script not loaded in index.html",
                }),
              );
              return;
            }
            console.log("Loading gapi picker module dynamically...");
            window.gapi.load("picker", () => {
              console.log("gapi.load callback fired");
              showPicker(tokenResponse);
            });
          } else {
            console.log("gapi picker module already loaded.");
            showPicker(tokenResponse);
          }
        },
      });

      tokenClient.requestAccessToken({ prompt: "" }); // prompt: '' uses cookie to immediately sign in if possible
    },
    [dispatch],
  );

  return {
    loadPicker,
    openPicker,
    isPickerReady: true, // We load it dynamically inside openPicker via google.accounts.oauth2
  };
};
