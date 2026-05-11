import { useEffect, useState } from "react";
import { Alert, Snackbar, Button } from "@mui/material";

export function useAutoUpdater() {
  const [masUpdate, setMasUpdate] = useState<{ version: string; url: string } | null>(null);
  const [otaAvailable, setOtaAvailable] = useState<any | null>(null);
  const [otaDownloaded, setOtaDownloaded] = useState<any | null>(null);

  useEffect(() => {
    if (!window.electron) return;

    const cleanupMas = window.electron.onMasUpdateAvailable((info: { version: string; url: string }) => {
      setMasUpdate(info);
    });

    const cleanupOtaAvail = window.electron.onOtaUpdateAvailable((info: { version: string; [key: string]: any }) => {
      setOtaAvailable(info);
    });

    const cleanupOtaDnld = window.electron.onOtaUpdateDownloaded((info: { version: string; [key: string]: any }) => {
      setOtaDownloaded(info);
    });

    return () => {
      cleanupMas();
      cleanupOtaAvail();
      cleanupOtaDnld();
    };
  }, []);

  const handleMasUpdate = () => {
    if (masUpdate) window.electron.openExternalUrl(masUpdate.url);
  };

  const handleOtaRestart = () => {
    // Requires an IPC call to restart and install, which we can implement later if needed.
    // For now, restarting manually works too.
  };

  return { masUpdate, otaAvailable, otaDownloaded, handleMasUpdate, handleOtaRestart };
}
