import type { TeamReport, TeamReportMember, TeamReportTask } from "../teamReportService";

const APP_URL = process.env.APP_URL || "https://plan-ai.blueberrybytes.com";

/** Escape user-controlled strings: task titles land straight in the HTML. */
const esc = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtDay = (d: Date | string | null): string =>
  d
    ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    : "";

export interface TeamReportEmailInput {
  userName: string | null;
  report: TeamReport;
}

const list = (tasks: TeamReportTask[], total: number, note: (t: TeamReportTask) => string) => {
  if (tasks.length === 0) return "";
  const shown = tasks.slice(0, 5);
  const more =
    total > shown.length
      ? `<li style="color: #64748b; font-size: 13px;">and ${total - shown.length} more</li>`
      : "";
  return `<ul style="margin: 4px 0 0; padding-left: 18px;">${shown
    .map(
      (t) =>
        `<li style="margin-bottom: 4px; color: #e2e8f0; font-size: 13px;">${esc(t.title)}<span style="color: #64748b;">${note(t)}</span></li>`,
    )
    .join("")}${more}</ul>`;
};

const label = (text: string, color: string) =>
  `<div style="font-size: 12px; font-weight: 600; color: ${color}; margin-top: 10px;">${text}</div>`;

function memberBlock(m: TeamReportMember): string {
  const facts = [
    `${m.completedCount} closed`,
    `${m.inProgressCount} in progress`,
    m.blocked.length ? `${m.blocked.length} stuck` : "",
    m.overdueCount ? `${m.overdueCount} past due` : "",
    m.reportDays !== null ? `daily report ${m.reportDays} of 5 days` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const summary = m.summary
    ? `<p style="margin: 8px 0 0; color: #cbd5e1; font-size: 14px; line-height: 1.6;">${esc(m.summary)}</p>`
    : "";
  const closed = m.completed.length
    ? label("Closed", "#4ade80") +
      list(m.completed, m.completedCount, (t) => ` · ${esc(t.projectTitle)}`)
    : "";
  const stuck = m.blocked.length
    ? label("Stuck", "#fbbf24") +
      list(m.blocked, m.blocked.length, (t) => (t.reason ? ` · ${esc(t.reason)}` : ""))
    : "";
  const late = m.overdue.length
    ? label("Past due", "#f87171") +
      list(m.overdue, m.overdueCount, (t) => (t.date ? ` · due ${fmtDay(t.date)}` : ""))
    : "";
  return `
    <div style="padding: 16px 0; border-bottom: 1px solid rgba(148,163,184,0.12);">
      <div style="color: #f8fafc; font-weight: 700; font-size: 15px;">${esc(m.name)}</div>
      <div style="color: #64748b; font-size: 12px; margin-top: 2px;">${facts}</div>
      ${summary}${closed}${stuck}${late}
    </div>`;
}

export function renderTeamReportEmail(input: TeamReportEmailInput): string {
  const { userName, report } = input;
  const greeting = userName ? `Hi ${esc(userName.split(" ")[0])},` : "Hi,";
  const range = `${fmtDay(report.weekStart)} to ${fmtDay(report.weekEnd)}`;
  const active = report.members.filter(
    (m) => m.completedCount || m.inProgressCount || m.blocked.length || m.overdueCount,
  );
  const quiet = report.members.length - active.length;
  const quietLine = quiet
    ? `<p style="color: #64748b; font-size: 13px; margin: 16px 0 0;">${quiet} member${quiet === 1 ? " has" : "s have"} no assigned tasks this week.</p>`
    : "";

  return `
    <div style="font-family: Inter, sans-serif; max-width: 560px; margin: 0 auto; background: #0b0d11; color: #f8fafc; border-radius: 16px; overflow: hidden; border: 1px solid rgba(167,139,250,0.2);">
      <div style="background: linear-gradient(135deg, #4361EE 0%, #a78bfa 100%); padding: 28px 32px;">
        <img src="${APP_URL}/logos/bbb.png" alt="Plan AI" style="display: block; margin: 0 0 12px; height: 28px; width: auto;" />
        <h1 style="margin: 0; font-size: 20px; font-weight: 800;">Your team's week</h1>
        <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">${esc(report.workspaceName)} · ${range}</p>
      </div>

      <div style="padding: 28px 32px;">
        <p style="color: #94a3b8; line-height: 1.7; margin: 0 0 8px;">
          ${greeting} this is what each person closed last week, what is stuck and what is past due.
          It comes from their tasks. The text of their daily reports stays private to them.
        </p>

        ${active.map(memberBlock).join("")}
        ${quietLine}

        <a href="${APP_URL}/team-report?week=${report.weekStart}" style="display: inline-block; margin-top: 28px; background: linear-gradient(135deg, #4361EE 0%, #a78bfa 100%); color: #fff; text-decoration: none; font-weight: 600; padding: 12px 28px; border-radius: 8px; font-size: 14px;">
          Open the team report
        </a>

        <p style="color: #475569; font-size: 12px; margin: 24px 0 0; line-height: 1.6;">
          You get this as an owner or admin of a workspace with the daily report on.
          <a href="${APP_URL}/profile" style="color: #64748b;">Turn off weekly emails</a>.
        </p>
      </div>
    </div>
  `;
}
