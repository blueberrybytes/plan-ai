import { useCallback, useRef } from "react";
import { useDispatch } from "react-redux";
import { setToastMessage } from "../store/slices/app/appSlice";

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

const ONEDRIVE_PICKER_URL = "https://onedrive.live.com/picker";

export const useOneDrivePicker = () => {
  const dispatch = useDispatch();
  const popupRef = useRef<Window | null>(null);

  const openPicker = useCallback(
    ({ onPick, onCancel, multiple = false, pickerType = "file" }: OneDrivePickerParams) => {
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

      const currentUrl = window.location.href.split('?')[0].split('#')[0];
      const currentOrigin = window.location.origin;

      const params = new URLSearchParams({
        client_id: clientId,
        action: pickerType === "folder" ? "query" : "download",
        multiselect: multiple ? "true" : "false",
        origin: currentOrigin,
        advanced: JSON.stringify({
          redirectUri: currentUrl,
          origin: currentOrigin,
          endpointHint: "api.onedrive.com",
        }),
      });

      const pickerUrl = `${ONEDRIVE_PICKER_URL}?${params.toString()}`;

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

      const handleMessage = (event: MessageEvent) => {
        // Allow messages from our own origin or Microsoft
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

      // Fallback: clean up if popup is closed manually, wrapping in try/catch to handle strict COOP blocking window.closed
      const pollTimer = setInterval(() => {
        try {
          if (popupRef.current?.closed) {
            clearInterval(pollTimer);
            window.removeEventListener("message", handleMessage);
          }
        } catch (e) {
          // Ignore COOP errors
        }
      }, 500);
    },
    [dispatch],
  );

  return { openPicker };
};
