/**
 * Reads the message the backend sent with a failed RTK Query call
 * ({ status, data: { message } }), or returns the fallback.
 */
export const apiErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (typeof data === "object" && data !== null && "message" in data) {
      const message = (data as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return fallback;
};
