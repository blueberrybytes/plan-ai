/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { RootState } from "../store/store";
import { selectUser } from "../store/slices/auth/authSelector";
import { TokenService } from "../services/tokenService";
import { logout } from "../store/slices/auth/authSlice";
import { setToastMessage } from "../store/slices/app/appSlice";
import { clientLogger } from "./clientLogger";
import i18n from "../i18n";

// Function to create a configured fetchBaseQuery with optional custom baseUrl
const createBaseQuery = (customBaseUrl?: string) =>
  fetchBaseQuery({
    baseUrl: customBaseUrl || process.env.REACT_APP_API_BACKEND_URL || "",
    prepareHeaders: (headers, { getState, endpoint }) => {
      const user = selectUser(getState() as RootState);
      // Add path info to help with debugging
      const currentPath = window.location.pathname;
      headers.set("X-Current-Path", currentPath);

      if (user?.token) {
        headers.set("Authorization", `Bearer ${user.token}`);
        console.log(
          `Setting Authorization header with token for endpoint: ${endpoint}, path: ${currentPath}`,
        );
      } else {
        console.warn(
          `No token available for request to ${endpoint}, path: ${currentPath}. Authentication may fail.`,
        );
        console.debug("Current authentication state:", {
          hasUser: !!user,
          endpoint,
          currentPath,
        });
      }

      const multipartEndpoints = new Set(["speechToText"]);
      if (!multipartEndpoints.has(endpoint ?? "")) {
        headers.set("Content-Type", "application/json");
      } else {
        headers.delete("Content-Type");
      }
      return headers;
    },
  });

/**
 * This function handles reactive token refresh when API calls fail due to auth errors.
 * It works alongside the proactive refresh in useTokenRefresh hook which refreshes
 * tokens before they expire to minimize authentication failures.
 */
// Options interface for baseQueryWithReauth
export interface BaseQueryWithReauthOptions {
  baseUrl?: string;
}

// TokenService is already imported at the top of the file

// Factory function that creates a baseQueryWithReauth with the given options
const createBaseQueryWithReauth =
  (
    options?: BaseQueryWithReauthOptions,
  ): BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> =>
  async (args, api, extraOptions) => {
    // Use the baseQuery with the provided baseUrl or default
    const customBaseQuery = createBaseQuery(options?.baseUrl);

    // Debug logging for request
    console.log("RTK Query request:", {
      endpoint: typeof args === "string" ? args : args.url,
      method: typeof args === "string" ? "GET" : args.method || "GET",
      params: typeof args !== "string" && args.params ? args.params : undefined,
    });

    // Check if token refresh is already in progress before making the request
    if (TokenService.isRefreshing && TokenService.refreshPromise) {
      console.log("Token refresh in progress, waiting before making request");
      try {
        await TokenService.refreshPromise;
        console.log("Token refresh completed, proceeding with request");
      } catch (error) {
        console.error("Error while waiting for token refresh:", error);
        clientLogger.error("Error while waiting for token refresh", error as Error, {
          endpoint: typeof args === "string" ? args : args.url,
        });
      }
    }

    // Make the request with current token (which should now be fresh)
    let result = await customBaseQuery(args, api, extraOptions);

    // Debug logging for response
    console.log("RTK Query response:", {
      endpoint: typeof args === "string" ? args : args.url,
      status: result.error ? `Error: ${result.error.status}` : "Success",
      data: result.data ? "Data received" : "No data",
      error: result.error || null,
    });

    // Get the request URL for platform detection
    const requestUrl = typeof args === "string" ? args : args.url;

    // Handle rate limit responses (429 Too Many Requests)
    if (result.error && result.error.status === 429) {
      console.warn(
        `Rate limit error (429) detected for request:`,
        requestUrl,
        "Error details:",
        result.error,
      );
      clientLogger.warn("API rate limit detected", {
        requestUrl,
        status: result.error.status,
        error: result.error,
      });

      // Determine which platform the rate limit is for
      let platform = "API";
      if (requestUrl.includes("/linkedin") || requestUrl.includes("/linkedin-community")) {
        platform = "LinkedIn";
      } else if (requestUrl.includes("/facebook")) {
        platform = "Facebook";
      } else if (requestUrl.includes("/instagram")) {
        platform = "Instagram";
      } else if (requestUrl.includes("/twitter") || requestUrl.includes("/x")) {
        platform = "Twitter/X";
      }

      // Get retry-after header if available
      // Access headers safely with type checking
      const errorData = result.error.data as any;
      const headers = errorData?.headers || {};
      const retryAfter = headers["retry-after"] || "3600"; // Default to 1 hour
      const retryMinutes = Math.ceil(parseInt(retryAfter, 10) / 60);
      const retryMessage =
        retryMinutes > 60 ? "later today" : `in approximately ${retryMinutes} minutes`;

      // Show toast message with platform-specific information
      api.dispatch(
        setToastMessage({
          message: `${platform} API rate limit reached. Please try again ${retryMessage}.`,
          severity: "warning",
          autoHideDuration: 8000,
        }),
      );
    }

    // Handle unauthorized or forbidden responses (token expired)
    if (result.error && (result.error.status === 401 || result.error.status === 403)) {
      console.warn(
        `Auth error ${result.error.status} detected for request:`,
        typeof args === "string" ? args : args.url,
        "Error details:",
        result.error,
      );
      clientLogger.warn("Authentication error during API request", {
        status: result.error.status,
        endpoint: typeof args === "string" ? args : args.url,
        error: result.error,
      });

      // Check if we have a user in the store before attempting to refresh the token
      const user = selectUser(api.getState() as RootState);
      if (user?.token) {
        try {
          console.log("Attempting token refresh for 401/403 error...");

          // Use TokenService to handle token refresh
          const newToken = await TokenService.handleTokenRefresh(api.dispatch);

          if (newToken) {
            console.log("Token refreshed reactively after 401/403 error");

            // Wait longer for the auth state to fully propagate and stabilize
            // This is critical for ensuring the new token is properly set
            console.log("Waiting for auth state to stabilize after token refresh...");
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Increased to 2 seconds

            // Verify we still have a user and token before retrying
            const updatedUser = selectUser(api.getState() as RootState);
            if (!updatedUser?.token) {
              console.warn("No user/token found after refresh, skipping retry");
              return result;
            }

            // Retry the initial query with new token
            console.log("Retrying original request with new token");
            const retryResult = await customBaseQuery(args, api, extraOptions);

            if (
              retryResult.error &&
              (retryResult.error.status === 401 || retryResult.error.status === 403)
            ) {
              console.warn("Request still failed after token refresh - auth issue may persist");
              console.warn("Retry error details:", retryResult.error);
              clientLogger.warn("Request failed after token refresh", {
                status: retryResult.error.status,
                endpoint: typeof args === "string" ? args : args.url,
                error: retryResult.error,
              });

              // If retry still fails, wait a bit more and try once more
              console.log("Attempting final retry after additional delay...");
              await new Promise((resolve) => setTimeout(resolve, 1000));

              const finalRetryResult = await customBaseQuery(args, api, extraOptions);
              if (
                finalRetryResult.error &&
                (finalRetryResult.error.status === 401 || finalRetryResult.error.status === 403)
              ) {
                console.error("Final retry also failed - returning original error");
                clientLogger.error(
                  "Final retry after token refresh failed",
                  finalRetryResult.error,
                  {
                    endpoint: typeof args === "string" ? args : args.url,
                  },
                );

                // Show session expired message and logout
                api.dispatch(
                  setToastMessage({
                    message: i18n.t("login.errors.sessionExpired"),
                    severity: "error",
                    autoHideDuration: 6000,
                  }),
                );
                api.dispatch(logout());

                return result; // Return original error
              } else {
                console.log("Final retry succeeded");
                return finalRetryResult;
              }
            } else {
              console.log("Request succeeded after token refresh");
              return retryResult;
            }
          } else {
            // If token refresh fails or returns null, the TokenService will have already handled the situation
            console.log("Token refresh failed or returned null - no retry will be attempted");
            clientLogger.warn("Token refresh did not return a token after auth error", {
              endpoint: typeof args === "string" ? args : args.url,
            });

            // Show session expired message and logout
            api.dispatch(
              setToastMessage({
                message: i18n.t("login.errors.sessionExpired"),
                severity: "error",
                autoHideDuration: 6000,
              }),
            );
            api.dispatch(logout());
          }
        } catch (error) {
          console.error("Error in token refresh process:", error);
          clientLogger.error("Token refresh process threw an error", error as Error, {
            endpoint: typeof args === "string" ? args : args.url,
          });
          // Error is already handled by TokenService, no need to dispatch logout here
        }
      } else {
        console.log("No user in store, skipping token refresh attempt");
        clientLogger.warn("Auth error encountered but no user present for token refresh", {
          endpoint: typeof args === "string" ? args : args.url,
        });
        // No user in store, so no need to attempt token refresh
      }
    }

    return result;
  };

// Export the default baseQueryWithReauth for backward compatibility
export const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> =
  createBaseQueryWithReauth();

// Export the factory function for creating custom baseQueryWithReauth instances with proper typing
export const createCustomBaseQuery = (
  options?: BaseQueryWithReauthOptions,
): BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> =>
  createBaseQueryWithReauth(options);
