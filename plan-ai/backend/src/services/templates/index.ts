import { renderWorkspaceInvitationEmail } from "./workspaceInvitation";
import { renderTelegramLeadEmail } from "./telegramLead";
import { renderWeeklyDigestEmail } from "./weeklyDigest";
import { renderMeetingNotesEmail } from "./meetingNotes";
import { renderTeamReportEmail } from "./teamReport";
import { renderCommentMentionEmail } from "./commentMention";

export {
  renderWorkspaceInvitationEmail,
  renderTelegramLeadEmail,
  renderWeeklyDigestEmail,
  renderMeetingNotesEmail,
  renderTeamReportEmail,
  renderCommentMentionEmail,
};

export function getAllEmailTemplates() {
  const now = new Date();
  const day = (offset: number) => new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);

  const task = (id: string, title: string, projectTitle: string, date: Date | null = null) => ({
    id,
    title,
    projectTitle,
    date,
    reason: null as string | null,
  });

  return [
    {
      id: "team_report",
      name: "Team Report",
      html: renderTeamReportEmail({
        userName: "Anna Serra",
        report: {
          workspaceId: "ws1",
          workspaceName: "Instal·lacions Delta",
          dailyReportEnabled: true,
          weekStart: "2026-09-21",
          weekEnd: "2026-09-27",
          members: [
            {
              userId: "u1",
              name: "Marta Puig",
              email: "marta@example.com",
              role: "MEMBER",
              usesDailyReport: true,
              completedCount: 6,
              completed: [
                task("t1", "Conciliar el banc de setembre", "Comptabilitat", day(4)),
                task("t2", "Enviar factures pendents a Obres Ebre", "Comptabilitat", day(3)),
              ],
              inProgressCount: 2,
              blocked: [
                {
                  ...task("t3", "Tancar el trimestre de l'IVA", "Comptabilitat"),
                  reason: "Falten tres factures del proveïdor",
                },
              ],
              overdueCount: 1,
              overdue: [task("t4", "Revisar contracte de lloguer", "Administració", day(9))],
              reportDays: 4,
              summary:
                "Va tancar sis tasques, sobretot de facturació. L'IVA del trimestre està aturat per tres factures del proveïdor.",
            },
            {
              userId: "u2",
              name: "Jordi Vidal",
              email: "jordi@example.com",
              role: "MEMBER",
              usesDailyReport: false,
              completedCount: 0,
              completed: [],
              inProgressCount: 0,
              blocked: [],
              overdueCount: 0,
              overdue: [],
              reportDays: null,
              summary: null,
            },
          ],
        },
      }),
    },
    {
      id: "comment_mention",
      name: "Comment Mention",
      html: renderCommentMentionEmail({
        authorName: "Anna Serra",
        targetKind: "meeting",
        targetTitle: "Kickoff Uriach, Impact Platform",
        text: "@Xavier Mas can you confirm the CRM date they gave at this point?",
        url: "https://plan-ai.blueberrybytes.com/recordings/clx1",
      }),
    },
    {
      id: "workspace_invitation",
      name: "Workspace Invitation",
      html: renderWorkspaceInvitationEmail("admin@plan.ai", "Jane Doe", "Acme Corp Workspace"),
    },
    {
      id: "telegram_lead",
      name: "Telegram Lead",
      html: renderTelegramLeadEmail({
        handle: "@cliente",
        chatId: "123456789",
        brief: "Quiero una app para que mis camareros tomen comandas y vayan directas a cocina.",
        transcriptId: "clx0000000000",
        viaVoice: true,
      }),
    },
    {
      id: "meeting_notes",
      name: "Meeting Notes",
      html: renderMeetingNotesEmail({
        senderName: "Xavier Mas",
        senderEmail: "xavier@example.com",
        title: "Kickoff Uriach, Impact Platform",
        recordedAt: day(1),
        summary:
          "We agreed the scope of phase 1. The CRM integration moves before October because the sales team needs it for the campaign.",
        keyPoints: ["Phase 1 scope approved", "CRM integration moves before October"],
        tasks: [
          { title: "Send the SMT integration proposal", dueDate: "2026-10-02" },
          { title: "Prepare the test environment" },
        ],
        message: "Hi all, here are the notes from today. Tell me if I missed anything.",
        meetingUrl: null,
      }),
    },
    {
      id: "weekly_digest",
      name: "Weekly Digest",
      html: renderWeeklyDigestEmail({
        userName: "Xavier Mas",
        workspaceName: "BlueberryBytes",
        digest: {
          meetings: [
            {
              id: "clx1",
              title: "Kickoff Uriach — Impact Platform",
              projectTitle: "Uriach",
              recordedAt: day(5),
              durationSeconds: 3120,
              keyPoints: [
                "Se aprueba el alcance de la fase 1",
                "David pide integrar el CRM antes de octubre",
              ],
            },
            {
              id: "clx2",
              title: "Weekly interno",
              projectTitle: null,
              recordedAt: day(2),
              durationSeconds: 1800,
              keyPoints: ["Revisión de pipeline"],
            },
          ],
          totalMeetingMinutes: 82,
          openTasks: [
            {
              id: "t1",
              title: "Enviar propuesta de integración SMT",
              projectTitle: "Uriach",
              dueDate: day(1),
              isOverdue: true,
            },
            {
              id: "t2",
              title: "Preparar entorno de pruebas",
              projectTitle: "Uriach",
              dueDate: null,
              isOverdue: false,
            },
          ],
          overdueCount: 1,
          weekStart: day(10),
          weekEnd: day(3),
        },
      }),
    },
  ];
}
