import { Linking } from "react-native";
import { reportMessage } from "./reportError";

/**
 * True for an http or https link. Links from the server, and from a task
 * passed in a deep link, go through this check so a crafted value (tel:,
 * intent:, another app's scheme) cannot start another app.
 */
export function isWebUrl(url: unknown): url is string {
  // http stays allowed: a self-hosted Jira or Twenty may not have TLS.
  return typeof url === "string" && /^https?:\/\/[^\s/?#]+/i.test(url);
}

/** Opens a web link in the browser. Anything else is ignored. */
export async function openWebUrl(url: unknown): Promise<void> {
  if (!isWebUrl(url)) {
    console.warn("Blocked a link that is not a web address");
    return;
  }
  await Linking.openURL(url);
}

/**
 * onLinkPress for react-native-markdown-display. Markdown comes from AI output
 * and meeting text, so only web and mailto links open. Returns false so the
 * library never opens the link itself.
 */
export function onMarkdownLinkPress(url: string): boolean {
  if (isWebUrl(url) || /^mailto:[^\s]+$/i.test(url)) {
    Linking.openURL(url).catch((e) => {
      // No app for a web or mail link. The error text holds the URL, which
      // may come from meeting text, so only its type is reported.
      console.warn("Could not open link", e);
      reportMessage("Could not open a link", "links", {
        op: "markdown_link",
        error: e instanceof Error ? e.name : typeof e,
      });
    });
  } else {
    console.warn("Blocked a link that is not a web or mail address");
  }
  return false;
}

/**
 * Joins the web app URL and a path like "/docs/view/123". Returns null when
 * the path does not start with a single "/", so a value like "@evil.com"
 * cannot change the host.
 */
export function webAppLink(baseUrl: string, path: unknown): string | null {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    return null;
  }
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}
