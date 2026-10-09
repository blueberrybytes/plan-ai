import type { components } from "../types/api";
import { TokenService } from "../services/tokenService";

/**
 * Counts the use of features only the browser can see: opening a section,
 * printing a document, downloading a file made on this side.
 *
 * It sends a name from the list below and the word "web". Nothing else: no
 * page address, no titles, no text. The backend drops any name that is not in
 * its own list (services/featureUsageService.ts) and stores a counter.
 */

/** The names this app may send. Must match the backend list. */
export type WebFeature =
  | "nav.projects"
  | "nav.meetings"
  | "nav.tasks"
  | "nav.docs"
  | "nav.slides"
  | "nav.diagrams"
  | "nav.notes"
  | "nav.chat"
  | "nav.daily_report"
  | "nav.team_report"
  | "nav.trackers"
  | "nav.integrations"
  | "nav.brand_themes"
  | "doc.printed_pdf"
  | "doc.exported_word"
  | "slides.exported_pptx"
  | "theme.template_downloaded"
  | "workspace.audit_log_csv";

type TrackFeatureBody = components["schemas"]["TrackFeatureBody"];

/** The same feature on the same page is sent at most once in this time. */
export const FEATURE_REPEAT_MS = 60_000;
const MAX_REMEMBERED = 200;

export interface FeatureTrackerDeps {
  send: (feature: WebFeature) => void;
  now?: () => number;
  /** The current page, used only to tell two page views apart. Never sent. */
  page?: () => string;
}

/**
 * Builds a `trackFeature` that never throws and skips repeats: the same
 * feature on the same page within a minute is sent once.
 */
export const createFeatureTracker = (deps: FeatureTrackerDeps) => {
  const lastSent = new Map<string, number>();
  const now = deps.now ?? Date.now;
  const page = deps.page ?? (() => window.location.pathname);

  return (feature: WebFeature): boolean => {
    try {
      const key = `${feature}|${page()}`;
      const at = now();
      const last = lastSent.get(key);
      if (last !== undefined && at - last < FEATURE_REPEAT_MS) return false;
      // Re-adding moves the key to the end, so the first key is the oldest.
      lastSent.delete(key);
      lastSent.set(key, at);
      if (lastSent.size > MAX_REMEMBERED) {
        const oldest = lastSent.keys().next().value;
        if (oldest !== undefined) lastSent.delete(oldest);
      }
      deps.send(feature);
      return true;
    } catch {
      return false;
    }
  };
};

let workspaceId: string | null = null;

/** The workspace the counts belong to. Set by FeatureUsageRouteTracker. */
export const setFeatureWorkspace = (id: string | null | undefined): void => {
  workspaceId = id || null;
};

/** Sends one count. Does not wait and swallows every failure. */
const sendToBackend = (feature: WebFeature): void => {
  const workspace = workspaceId;
  if (!workspace) return;
  void (async () => {
    try {
      const token = await TokenService.getIdToken();
      if (!token) return;
      const body: TrackFeatureBody = { feature, client: "web" };
      await fetch(`${process.env.REACT_APP_API_BACKEND_URL || ""}/api/usage/feature`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Workspace-Id": workspace,
        },
        body: JSON.stringify(body),
        // Lets the count go out when the action also leaves the page.
        keepalive: true,
      });
    } catch {
      // A lost count is not worth an error on screen or in the logs.
    }
  })();
};

/** Counts one use of a feature. Fire and forget: it never throws. */
export const trackFeature = createFeatureTracker({ send: sendToBackend });

/**
 * The section a page belongs to, or null for pages that are not a section.
 * `search` is the query string: the task board is a tab of the project page.
 */
export const navFeatureFor = (pathname: string, search = ""): WebFeature | null => {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  switch (first) {
    case "projects":
      return new URLSearchParams(search).get("tab") === "board" ? "nav.tasks" : "nav.projects";
    case "recordings":
      return "nav.meetings";
    case "docs":
      return "nav.docs";
    case "slides":
      return "nav.slides";
    case "diagrams":
      return "nav.diagrams";
    case "notes":
      return "nav.notes";
    case "chat":
      return "nav.chat";
    case "daily-report":
      return "nav.daily_report";
    case "team-report":
      return "nav.team_report";
    case "trackers":
      return "nav.trackers";
    case "integrations":
      return "nav.integrations";
    case "brand-themes":
      return "nav.brand_themes";
    default:
      return null;
  }
};
