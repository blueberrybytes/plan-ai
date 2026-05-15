import { useCallback, useRef } from "react";
import { useDispatch } from "react-redux";
import { setToastMessage } from "../store/slices/app/appSlice";

/**
 * OneDrive File Picker hook.
 *
 * Uses Microsoft's OneDrive picker v8 via a popup window + postMessage.
 * This avoids loading any external SDK script and works with the existing
 * MICROSOFT_CLIENT_ID from the backend.
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

interface OneDrivePickerMessage {
  type: string;
  data?: {
    items?: Array<{
      id: string;
      name: string;
      size: number;
      parentReference?: {
        driveId: string;
      };
    }>;
  };
}

// Microsoft's lightweight picker endpoint
const ONEDRIVE_PICKER_URL = "https://onedrive.live.com/picker";

export const useOneDrivePicker = () => {
  const dispatch = useDispatch();
  const popupRef = useRef<Window | null>(null);

  const openPicker = useCallback(
    ({ onPick, onCancel, multiple = true, pickerType = "file" }: OneDrivePickerParams) => {
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

      // Build the picker URL with query params
      const params = new URLSearchParams({
        client_id: clientId,
        action: pickerType === "folder" ? "query" : "download", // "query" returns metadata without download links, suitable for folders
        multiselect: multiple ? "true" : "false",
        advanced: JSON.stringify({
          redirectUri: window.location.origin + "/onedrive-picker-callback.html",
        }),
      });

      const pickerUrl = `${ONEDRIVE_PICKER_URL}?${params.toString()}`;

      // Open popup
      const width = 800;
      const height = 600;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      popupRef.current = window.open(
        pickerUrl,
        "onedrive-picker",
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`,
      );

      if (!popupRef.current) {
        dispatch(
          setToastMessage({
            severity: "error",
            message: "Popup blocked. Please allow popups for this site.",
          }),
        );
        return;
      }

      // Listen for messages from the picker popup
      const handleMessage = (event: MessageEvent) => {
        // Only accept messages from Microsoft domains
        if (
          !event.origin.includes("onedrive.live.com") &&
          !event.origin.includes("sharepoint.com") &&
          !event.origin.includes("microsoft.com") &&
          event.origin !== window.location.origin
        ) {
          return;
        }

        const message = event.data as OneDrivePickerMessage;

        if (message.type === "success" && message.data?.items) {
          const fileIds = message.data.items.map((item) => item.id);
          if (fileIds.length > 0) {
            onPick(fileIds, message.data.items);
          }
          window.removeEventListener("message", handleMessage);
          popupRef.current?.close();
        } else if (message.type === "cancel") {
          onCancel?.();
          window.removeEventListener("message", handleMessage);
          popupRef.current?.close();
        }
      };

      window.addEventListener("message", handleMessage);

      // Fallback: clean up if popup is closed manually
      const pollTimer = setInterval(() => {
        if (popupRef.current?.closed) {
          clearInterval(pollTimer);
          window.removeEventListener("message", handleMessage);
        }
      }, 500);
    },
    [dispatch],
  );

  return { openPicker };
};
