// Pages grouped under one sidebar entry. The sidebar shows the entry and the
// page shows the group as tabs (see SectionTabs). Routes do not change.

export type SectionTab = {
  labelKey: string;
  path: string;
};

export const studioTabs: SectionTab[] = [
  { labelKey: "sidebarLayout.nav.documents", path: "/docs" },
  { labelKey: "sidebarLayout.nav.slides", path: "/slides" },
  { labelKey: "sidebarLayout.nav.diagrams", path: "/diagrams" },
  // Themes style documents and slides, so they live with them.
  { labelKey: "sidebarLayout.nav.brandThemes", path: "/brand-themes" },
];

/** The team report tab is only for owners and admins of a team workspace. */
export const buildReportTabs = (canSeeTeamReport: boolean): SectionTab[] => [
  { labelKey: "sidebarLayout.nav.dailyReport", path: "/daily-report" },
  ...(canSeeTeamReport ? [{ labelKey: "sidebarLayout.nav.teamReport", path: "/team-report" }] : []),
];

/** The admin tab is only for platform admins. */
export const buildSettingsTabs = (isPlatformAdmin: boolean): SectionTab[] => [
  { labelKey: "sidebarLayout.nav.profile", path: "/profile" },
  { labelKey: "sidebarLayout.nav.team", path: "/team" },
  { labelKey: "sidebarLayout.nav.integrations", path: "/integrations" },
  { labelKey: "sidebarLayout.nav.billing", path: "/billing" },
  { labelKey: "sidebarLayout.nav.apps", path: "/downloads" },
  ...(isPlatformAdmin ? [{ labelKey: "sidebarLayout.nav.admin", path: "/admin" }] : []),
];

export const isPathActive = (pathname: string, path: string): boolean =>
  pathname === path || pathname.startsWith(`${path}/`);

export const isSectionActive = (pathname: string, tabs: SectionTab[]): boolean =>
  tabs.some((tab) => isPathActive(pathname, tab.path));
