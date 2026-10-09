/**
 * The events an endpoint can ask for, in the order the backend lists them
 * (WEBHOOK_EVENTS in backend/src/services/webhookService.ts).
 */
export const WEBHOOK_EVENTS = [
  "meeting.processed",
  "meeting.deleted",
  "task.created",
  "task.updated",
  "task.deleted",
  "document.created",
] as const;

/** i18n key of the one-line explanation of an event. */
export const webhookEventLabelKey = (event: string): string =>
  `webhooks.events.${event.replace(".", "_")}`;

/** The backend turns an endpoint off at this many failed deliveries in a row. */
export const WEBHOOK_DISABLE_AFTER_FAILURES = 20;

/** The message the API sent with an error, if it sent one. */
export const apiErrorMessage = (error: unknown): string | null => {
  const message = (error as { data?: { message?: unknown } } | null)?.data?.message;
  return typeof message === "string" && message ? message : null;
};
