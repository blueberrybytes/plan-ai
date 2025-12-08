import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { Provider } from "react-redux";
import store, { persistor } from "./store/store";
import { PersistGate } from "redux-persist/integration/react";
import SnackbarProvider from "./providers/SnackbarProvider";
import ErrorFallback from "./components/error/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import Clarity from "@microsoft/clarity";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/es"; // Spanish locale
import "dayjs/locale/en"; // English locale
import { clientLogger } from "./utils/clientLogger";
import CustomThemeProvider from "./providers/CustomThemeProvider";
dayjs.extend(localizedFormat);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

if (process.env.REACT_APP_MICROSOFT_CLARITY_ID) {
  Clarity.init(process.env.REACT_APP_MICROSOFT_CLARITY_ID);
}

const attachGlobalErrorListeners = () => {
  const globalScope = window as Window &
    typeof globalThis & {
      __remoteLoggingHandlersAttached?: boolean;
    };

  if (globalScope.__remoteLoggingHandlersAttached) {
    return;
  }

  const runtimeErrorHandler = (event: ErrorEvent) => {
    clientLogger.error("Unhandled runtime error", event.error ?? event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  };

  const unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
    clientLogger.error("Unhandled promise rejection", event.reason ?? "Unknown reason", {
      handled: false,
    });
  };

  window.addEventListener("error", runtimeErrorHandler);
  window.addEventListener("unhandledrejection", unhandledRejectionHandler);

  globalScope.__remoteLoggingHandlersAttached = true;
};

attachGlobalErrorListeners();

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={<div>Loading...</div>} persistor={persistor}>
        <CustomThemeProvider>
          <SnackbarProvider>
            <ErrorBoundary
              FallbackComponent={ErrorFallback}
              onError={(error, info) => {
                clientLogger.error("React ErrorBoundary captured error", error, {
                  componentStack: info.componentStack,
                });
              }}
            >
              <App />
            </ErrorBoundary>
          </SnackbarProvider>
        </CustomThemeProvider>
      </PersistGate>
    </Provider>
  </React.StrictMode>,
);
