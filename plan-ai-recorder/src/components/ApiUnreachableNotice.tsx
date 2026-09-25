import { useEffect, useState } from "react";
import { Alert, Snackbar } from "@mui/material";
import { API_UNREACHABLE_EVENT } from "../services/planAiApi";

/** Show the notice at most this often, however many requests fail meanwhile. */
const QUIET_MS = 30_000;

/**
 * One non-blocking notice when the backend can't be reached, instead of a
 * blocking alert() per failed request. A recording in progress is unaffected:
 * audio keeps recording and the live stream reconnects on its own.
 */
export const ApiUnreachableNotice = () => {
  const [open, setOpen] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let lastShownAt = 0;
    const onUnreachable = (e: Event) => {
      const now = Date.now();
      if (now - lastShownAt < QUIET_MS) return;
      lastShownAt = now;
      setTimedOut(
        Boolean((e as CustomEvent<{ timedOut?: boolean }>).detail?.timedOut),
      );
      setOpen(true);
    };
    window.addEventListener(API_UNREACHABLE_EVENT, onUnreachable);
    return () =>
      window.removeEventListener(API_UNREACHABLE_EVENT, onUnreachable);
  }, []);

  return (
    <Snackbar
      open={open}
      autoHideDuration={6000}
      onClose={() => setOpen(false)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert severity="warning" variant="filled" onClose={() => setOpen(false)}>
        {timedOut
          ? "The Plan AI server is taking too long to answer. Retrying in the background."
          : "Can't reach the Plan AI server. Retrying in the background; recordings keep going."}
      </Alert>
    </Snackbar>
  );
};
