jest.mock("../services/tokenService", () => ({
  TokenService: { getIdToken: jest.fn().mockResolvedValue(null) },
}));

import {
  FEATURE_REPEAT_MS,
  createFeatureTracker,
  navFeatureFor,
  type WebFeature,
} from "./trackFeature";

describe("createFeatureTracker", () => {
  const setup = () => {
    const sent: WebFeature[] = [];
    const clock = { now: 1_000_000, page: "/docs/view/1" };
    const track = createFeatureTracker({
      send: (feature) => sent.push(feature),
      now: () => clock.now,
      page: () => clock.page,
    });
    return { sent, clock, track };
  };

  it("sends a feature once when it repeats on the same page within a minute", () => {
    const { sent, clock, track } = setup();
    expect(track("doc.printed_pdf")).toBe(true);
    clock.now += 5_000;
    expect(track("doc.printed_pdf")).toBe(false);
    clock.now += FEATURE_REPEAT_MS - 5_001;
    expect(track("doc.printed_pdf")).toBe(false);
    expect(sent).toEqual(["doc.printed_pdf"]);
  });

  it("sends it again after a minute", () => {
    const { sent, clock, track } = setup();
    track("doc.printed_pdf");
    clock.now += FEATURE_REPEAT_MS;
    expect(track("doc.printed_pdf")).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it("sends it again on another page view", () => {
    const { sent, clock, track } = setup();
    track("doc.printed_pdf");
    clock.page = "/docs/view/2";
    expect(track("doc.printed_pdf")).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it("does not mix up different features on the same page", () => {
    const { sent, track } = setup();
    track("doc.printed_pdf");
    expect(track("doc.exported_word")).toBe(true);
    expect(sent).toEqual(["doc.printed_pdf", "doc.exported_word"]);
  });

  it("never throws when sending fails", () => {
    const track = createFeatureTracker({
      send: () => {
        throw new Error("offline");
      },
      now: () => 1,
      page: () => "/docs",
    });
    expect(() => track("nav.docs")).not.toThrow();
    expect(track("nav.docs")).toBe(false);
  });

  it("only sends the name: the page is used to tell views apart and stays here", () => {
    const send = jest.fn();
    const track = createFeatureTracker({ send, now: () => 1, page: () => "/docs/view/secret-id" });
    track("doc.printed_pdf");
    expect(send).toHaveBeenCalledWith("doc.printed_pdf");
    expect(JSON.stringify(send.mock.calls)).not.toContain("secret-id");
  });
});

describe("navFeatureFor", () => {
  it("maps each main section", () => {
    expect(navFeatureFor("/projects")).toBe("nav.projects");
    expect(navFeatureFor("/projects/abc123/info")).toBe("nav.projects");
    expect(navFeatureFor("/recordings/abc")).toBe("nav.meetings");
    expect(navFeatureFor("/docs/view/1")).toBe("nav.docs");
    expect(navFeatureFor("/slides")).toBe("nav.slides");
    expect(navFeatureFor("/diagrams/create")).toBe("nav.diagrams");
    expect(navFeatureFor("/notes")).toBe("nav.notes");
    expect(navFeatureFor("/chat/t1")).toBe("nav.chat");
    expect(navFeatureFor("/daily-report")).toBe("nav.daily_report");
    expect(navFeatureFor("/team-report")).toBe("nav.team_report");
    expect(navFeatureFor("/trackers")).toBe("nav.trackers");
    expect(navFeatureFor("/integrations/jira")).toBe("nav.integrations");
    expect(navFeatureFor("/brand-themes/1/edit")).toBe("nav.brand_themes");
  });

  it("counts the board tab of a project as the tasks section", () => {
    expect(navFeatureFor("/projects/abc", "?tab=board")).toBe("nav.tasks");
    expect(navFeatureFor("/projects/abc", "?tab=meetings")).toBe("nav.projects");
  });

  it("returns null for pages that are not a section", () => {
    for (const path of ["/", "/home", "/login", "/admin/feature-usage", "/profile", "/team"]) {
      expect(navFeatureFor(path)).toBeNull();
    }
  });
});
