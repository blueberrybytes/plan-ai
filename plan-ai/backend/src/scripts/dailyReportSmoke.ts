/* Local smoke test of the daily report against the dev database and the real AI.
 * Makes a throwaway courtesy workspace, runs the whole flow and deletes it.
 * Run: npx ts-node --transpile-only -r dotenv/config src/scripts/dailyReportSmoke.ts [out.html]
 * Never point it at production: it refuses any DATABASE_URL that is not local. */
import { writeFileSync } from "fs";
import prisma from "../prisma/prismaClient";
import {
  extractFromDayNote,
  getStatus,
  listProposals,
  reviewProposals,
  setConsent,
  updateSettings,
} from "../services/dailyReportService";
import { buildTeamReport, summarizeTeamReport } from "../services/teamReportService";
import { renderTeamReportEmail } from "../services/templates/teamReport";
import { dayKey, mondayOf } from "../services/trackerService";

const REPORT = `Avui he conciliat el banc de setembre, ja quadra tot.
L'IVA del trimestre no el puc tancar perquè falten tres factures d'Obres Ebre.
He començat a revisar el contracte de lloguer del magatzem, em queda la meitat.
També he pagat les nòmines. Demà he de trucar a Obres Ebre per reclamar les factures.`;

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1):/.test(url))
    throw new Error("Refusing: DATABASE_URL is not local");

  const user = await prisma.user.findFirstOrThrow();
  const ws = await prisma.workspace.create({
    data: { name: "Smoke daily report", kind: "TEAM", isCourtesy: true },
  });
  try {
    await prisma.workspaceMember.create({
      data: { workspaceId: ws.id, userId: user.id, role: "OWNER" },
    });
    const project = await prisma.project.create({
      data: { userId: user.id, workspaceId: ws.id, title: "Comptabilitat" },
    });
    // Like tasks from the board or a meeting, the third one has no assignee.
    const mk = (title: string, status: "BACKLOG" | "IN_PROGRESS", dueDate?: Date) =>
      prisma.task.create({
        data: {
          projectId: project.id,
          title,
          status,
          assigneeId: title.startsWith("Revisar") ? null : user.id,
          dueDate,
        },
      });
    await mk("Conciliar el banc de setembre", "IN_PROGRESS");
    await mk("Tancar l'IVA del trimestre", "IN_PROGRESS", new Date(Date.now() - 3 * 86400000));
    await mk("Revisar el contracte de lloguer", "BACKLOG");
    await mk("Preparar l'inventari de novembre", "BACKLOG");

    const owner = { userId: user.id, workspaceId: ws.id, role: "OWNER" as const };
    console.log("status before:", await getStatus(owner));
    await updateSettings(owner, { enabled: true, reminderTime: "18:00" });
    try {
      await extractFromDayNote(owner, "nope");
      console.log("FAIL: extraction ran without consent");
    } catch (e) {
      console.log("without consent:", (e as { code?: string }).code);
    }
    await setConsent(owner, true);

    const today = new Date(`${dayKey(new Date())}T00:00:00Z`);
    const note = await prisma.note.create({
      data: {
        workspaceId: ws.id,
        userId: user.id,
        body: REPORT,
        periodType: "DAY",
        periodStart: today,
        source: "MOBILE",
      },
    });

    const t0 = Date.now();
    const first = await extractFromDayNote(owner, note.id);
    console.log(`extract took ${Date.now() - t0} ms, skipped=${first.skipped}`);
    const proposals = await listProposals(owner, { noteId: note.id, status: "PROPOSED" });
    for (const p of proposals) {
      console.log(
        `  ${p.kind.padEnd(9)} ${p.title}${p.detail ? `  [${p.detail}]` : ""}  -> ${p.task?.project.title ?? p.project?.title ?? "(server picks)"}`,
      );
    }
    const again = await extractFromDayNote(owner, note.id);
    console.log("second call skipped:", again.skipped, "proposals:", again.proposals.length);

    const review = await reviewProposals(
      owner,
      proposals.map((p) => ({ id: p.id, status: "ACCEPTED" as const })),
    );
    console.log("review:", review);
    const tasks = await prisma.task.findMany({
      where: { project: { workspaceId: ws.id } },
      select: {
        title: true,
        status: true,
        completedAt: true,
        project: { select: { title: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    for (const t of tasks)
      console.log(
        `  ${t.status.padEnd(11)} ${t.title}  (${t.project.title})${t.completedAt ? " done" : ""}`,
      );

    let report = await buildTeamReport(ws.id, mondayOf(today));
    report = await summarizeTeamReport(report, user.id);
    const m = report.members[0];
    console.log("team:", {
      closed: m.completedCount,
      inProgress: m.inProgressCount,
      stuck: m.blocked.map((b) => `${b.title} / ${b.reason}`),
      overdue: m.overdueCount,
      reportDays: m.reportDays,
      summary: m.summary,
    });
    const out = process.argv[2];
    if (out) {
      writeFileSync(out, renderTeamReportEmail({ userName: user.name, report }));
      console.log("email written to", out);
    }
    await setConsent(owner, false);
    console.log("after withdraw:", (await getStatus(owner)).needsConsent);
  } finally {
    await prisma.workspace.delete({ where: { id: ws.id } });
    await prisma.$disconnect();
  }
}

// Some imports open Redis connections, so the process is ended by hand.
main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
