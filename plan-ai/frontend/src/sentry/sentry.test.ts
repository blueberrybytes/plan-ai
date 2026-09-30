import type { ErrorEvent } from "@sentry/react";
import { scrubBreadcrumb, scrubEvent, stripQuery } from "./sentry";

describe("Sentry scrubbing", () => {
  it("drops the query string and hash of a URL", () => {
    expect(stripQuery("https://app.test/api/notes?q=my+secret#top")).toBe(
      "https://app.test/api/notes",
    );
    expect(stripQuery("/notes")).toBe("/notes");
  });

  it("drops console breadcrumbs, which can print emails", () => {
    expect(scrubBreadcrumb({ category: "console", message: "user a@b.com" })).toBeNull();
  });

  it("removes the query from request and navigation breadcrumbs", () => {
    const fetchCrumb = scrubBreadcrumb({
      category: "fetch",
      data: { url: "/api/notes?q=lunch", method: "GET", status_code: 200 },
    });
    expect(fetchCrumb?.data).toEqual({ url: "/api/notes", method: "GET", status_code: 200 });

    const navCrumb = scrubBreadcrumb({
      category: "navigation",
      data: { from: "/login?desktop_auth=true", to: "/auth/desktop?state=abc" },
    });
    expect(navCrumb?.data).toEqual({ from: "/login", to: "/auth/desktop" });
  });

  it("keeps only the user id and strips the request of body, cookies and query", () => {
    const event = scrubEvent({
      type: undefined,
      user: { id: "u1", email: "a@b.com", ip_address: "1.2.3.4" },
      request: {
        url: "https://app.test/auth/desktop?state=abc",
        query_string: "state=abc",
        data: "body",
        cookies: { session: "x" },
        headers: { Authorization: "Bearer t", "User-Agent": "jest" },
      },
    } as ErrorEvent);
    expect(event.user).toEqual({ id: "u1" });
    expect(event.request).toEqual({
      url: "https://app.test/auth/desktop",
      headers: { "User-Agent": "jest" },
    });
  });
});
