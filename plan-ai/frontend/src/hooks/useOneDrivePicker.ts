import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { setToastMessage } from "../store/slices/app/appSlice";

/**
 * OneDrive File Picker hook.
 *
 * Dynamically loads the official Microsoft OneDrive v7.2 SDK to ensure 
 * correct popup initialization, origin verification, and callbacks.
 *
 * @see https://learn.microsoft.com/en-us/onedrive/developer/controls/file-pickers
 */

interface OneDrivePickerParams {
  onPick: (
    fileIds: string[],
    items?: Array<{ id: string; name: string; size: number; parentReference?: { driveId: string } }>,
  ) => void;
  onCancel?: () => void;
  multiple?: boolean;
  pickerType?: "file" | "folder";
}

export const useOneDrivePicker = () => {
  const dispatch = useDispatch();

  const loadOneDriveScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if ((window as any).OneDrive) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://js.live.net/v7.2/OneDrive.js";
      script.id = "onedrive-sdk";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load OneDrive SDK"));
      document.body.appendChild(script);
    });
  };

  const openPicker = useCallback(
    async ({ onPick, onCancel, multiple = false, pickerType = "file" }: OneDrivePickerParams) => {
      const clientId =
        process.env.REACT_APP_MICROSOFT_CLIENT_ID ||
        process.env.REACT_APP_VITE_MICROSOFT_CLIENT_ID;

      if (!clientId) {
        dispatch(
          setToastMessage({
            severity: "error",
            message: "Missing REACT_APP_MICROSOFT_CLIENT_ID environment variable.",
          }),
        );
        return;
      }

      try {
        await loadOneDriveScript();
      } catch (err) {
        dispatch(
          setToastMessage({
            severity: "error",
            message: "Failed to load Microsoft OneDrive picker script.",
          }),
        );
        return;
      }

      const odOptions = {
        clientId: clientId,
        action: pickerType === "folder" ? "query" : "download",
        multiSelect: multiple,
        success: (files: any) => {
          const items = files.value || [];
          const fileIds = items.map((item: any) => item.id);
          if (fileIds.length > 0) {
            onPick(fileIds, items);
          }
        },
        cancel: () => {
          onCancel?.();
        },
        error: (error: any) => {
          console.error("OneDrive Picker Error:", error);
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

