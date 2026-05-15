/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { setToastMessage } from "../store/slices/app/appSlice";

interface OneDrivePickerParams {
  onPick: (
    fileIds: string[],
    items?: Array<{
      id: string;
      name: string;
      size: number;
      parentReference?: { driveId: string };
    }>,
  ) => void;
  onCancel?: () => void;
  multiple?: boolean;
  pickerType?: "file" | "folder";
}

/**
 * OneDrive Picker v7.2 integration.
 *
 * Key decisions (from official MS docs):
 * - `redirectUri` MUST point to a lightweight page that only loads OneDrive.js.
 *   Using the current page URL fails because React reloads inside the popup and
 *   dynamic URLs (e.g. /contexts/:id) cannot all be registered in Azure.
 *   We use `/onedrive-picker-callback.html` which is a static file in /public.
 * - For folder-only selection: action "query" + advanced.filter "folder".
 * - The `redirectUri` must be registered as a SPA redirect URI in Azure Portal
 *   for the app's client ID.
 */
export const useOneDrivePicker = () => {
  const dispatch = useDispatch();

  const openPicker = useCallback(
    ({ onPick, onCancel, multiple = false, pickerType = "file" }: OneDrivePickerParams) => {
      const clientId =
        process.env.REACT_APP_MICROSOFT_CLIENT_ID || process.env.REACT_APP_VITE_MICROSOFT_CLIENT_ID;

      if (!clientId) {
        dispatch(
          setToastMessage({
            severity: "error",
            message: "Missing REACT_APP_MICROSOFT_CLIENT_ID environment variable.",
          }),
        );
        return;
      }

      if (!(window as any).OneDrive) {
        dispatch(
          setToastMessage({
            severity: "error",
            message: "Microsoft OneDrive SDK failed to load. Please refresh the page.",
          }),
        );
        return;
      }

      // Per MS docs: redirectUri must be a lightweight page that only loads OneDrive.js.
      // This page must be registered as a SPA redirect URI in Azure Portal.
      const redirectUri = `${window.location.origin}/onedrive-picker-callback.html`;

      const odOptions: Record<string, any> = {
        clientId,
        action: "query",
        multiSelect: multiple,
        // Per MS docs: viewType controls what can be selected.
        // "folders" = only folders, "files" = only files (default), "all" = both.
        viewType: pickerType === "folder" ? "folders" : "files",
        advanced: {
          redirectUri,
          endpointHint: "api.onedrive.com",
          queryParameters: "select=id,name,size,folder",
        },
        success: (response: any) => {
          console.log("[OneDrive Picker] Raw response:", JSON.stringify(response, null, 2));
          const items = response?.value ?? [];
          console.log("[OneDrive Picker] Parsed items:", JSON.stringify(items, null, 2));
          const fileIds = items.map((item: any) => item.id);
          if (fileIds.length > 0) {
            onPick(fileIds, items);
          }
        },
        cancel: () => {
          onCancel?.();
        },
        error: (error: any) => {
          console.error("[OneDrive Picker] Error:", error);
          dispatch(
            setToastMessage({
              severity: "error",
              message: "An error occurred with the OneDrive picker.",
            }),
          );
        },
      };

      (window as any).OneDrive.open(odOptions);
    },
    [dispatch],
  );

  return { openPicker };
};
