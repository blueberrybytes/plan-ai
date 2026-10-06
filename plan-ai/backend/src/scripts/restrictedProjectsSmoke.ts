/**
 * Restricted projects against a real database.
 *
 * Creates a throwaway workspace with an open project and a restricted one,
 * then reads every model that hangs from a project as each kind of member,
 * through the same filtered client the API uses. Deletes everything at the
 * end, also when a check fails.
 *
 *   yarn smoke:restricted-projects
 *
 * Local or staging only: it writes rows.
 */
import prisma, { rawPrisma } from "../prisma/prismaClient";
import { runWithHidden } from "../services/accessScope";
import {
  getProjectAccess,
  hiddenFromMember,
  hiddenFromOutsiders,
  setProjectAccess,
} from "../services/projectAccess";

const tag = `smoke-restricted-${Date.now()}`;
let failures = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`,
  );
};

async function main() {
  const user = (name: string) =>
    rawPrisma.user.create({
      data: { firebaseUid: `${tag}-${name}`, email: `${tag}-${name}@example.com`, name },
    });
  const [owner, admin, creator, invited, outsider] = await Promise.all(
    ["owner", "admin", "creator", "invited", "outsider"].map(user),
  );
  const ws = await rawPrisma.workspace.create({ data: { name: tag } });
  const roles = [
    [owner, "OWNER"],
    [admin, "ADMIN"],
    [creator, "MEMBER"],
    [invited, "MEMBER"],
    [outsider, "MEMBER"],
  ] as const;
  for (const [u, role] of roles) {
    await rawPrisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: u.id, role } });
  }

  // One open project and one restricted, each with one of everything.
  const seed = async (name: string, restricted: boolean) => {
    const project = await rawPrisma.project.create({
      data: {
        title: name,
        userId: creator.id,
        workspaceId: ws.id,
        visibility: restricted ? "RESTRICTED" : "WORKSPACE",
        ...(restricted
          ? { members: { create: { userId: invited.id, addedById: creator.id } } }
          : {}),
      },
    });
    const base = { userId: creator.id, workspaceId: ws.id };
    const context = await rawPrisma.context.create({
      data: { ...base, name, projectId: project.id },
    });
    await rawPrisma.contextFile.create({
      data: {
        contextId: context.id,
        bucketPath: "x",
        fileName: `${name}.pdf`,
        mimeType: "application/pdf",
      },
    });
    const transcript = await rawPrisma.transcript.create({
      data: { ...base, title: name, projectId: project.id, contextIds: [context.id] },
    });
    // A meeting saved without a project but pointing at the project's files.
    await rawPrisma.transcript.create({
      data: { ...base, title: `${name} loose`, contextIds: [context.id] },
    });
    const task = await rawPrisma.task.create({ data: { title: name, projectId: project.id } });
    await rawPrisma.taskTranscriptLink.create({
      data: { taskId: task.id, transcriptId: transcript.id },
    });
    await rawPrisma.painPoint.create({
      data: { transcriptId: transcript.id, workspaceId: ws.id, problem: name },
    });
    await rawPrisma.transcriptTranslation.create({
      data: { transcriptId: transcript.id, language: "en", sourceHash: "h", lines: [] },
    });
    await rawPrisma.note.create({ data: { ...base, title: name, projectId: project.id } });
    await rawPrisma.note.create({ data: { ...base, title: name, transcriptId: transcript.id } });
    await rawPrisma.chatThread.create({
      data: { ...base, title: name, transcriptId: transcript.id },
    });
    await rawPrisma.chatThread.create({ data: { ...base, title: name, contextIds: [context.id] } });
    await rawPrisma.docDocument.create({
      data: { ...base, title: name, content: "x", projectId: project.id },
    });
    await rawPrisma.docDocument.create({
      data: { ...base, title: name, content: "x", contextIds: [context.id] },
    });
    await rawPrisma.presentation.create({
      data: { ...base, title: name, slidesJson: [], contextIds: [context.id] },
    });
    await rawPrisma.diagram.create({
      data: { ...base, title: name, prompt: "x", type: "FLOWCHART", contextIds: [context.id] },
    });
    return { project, context, transcript, task };
  };
  const open = await seed("open", false);
  const secret = await seed("secret", true);

  const w = { workspaceId: ws.id };
  /** How many rows of each model this caller gets. Open project alone: 1 or 2 each. */
  const counts = async () => ({
    project: await prisma.project.count({ where: w }),
    transcript: await prisma.transcript.count({ where: w }),
    task: await prisma.task.count({ where: { project: w } }),
    link: await prisma.taskTranscriptLink.count({ where: { task: { project: w } } }),
    painPoint: await prisma.painPoint.count({ where: w }),
    translation: await prisma.transcriptTranslation.count({ where: { source: w } }),
    context: await prisma.context.count({ where: w }),
    file: await prisma.contextFile.count({ where: { context: w } }),
    note: await prisma.note.count({ where: w }),
    chat: await prisma.chatThread.count({ where: w }),
    doc: await prisma.docDocument.count({ where: w }),
    slides: await prisma.presentation.count({ where: w }),
    diagram: await prisma.diagram.count({ where: w }),
  });
  const onlyOpen = {
    project: 1,
    transcript: 2,
    task: 1,
    link: 1,
    painPoint: 1,
    translation: 1,
    context: 1,
    file: 1,
    note: 2,
    chat: 2,
    doc: 2,
    slides: 1,
    diagram: 1,
  };
  const everything = Object.fromEntries(Object.entries(onlyOpen).map(([k, v]) => [k, v * 2]));

  check("no scope (workers): everything", await counts(), everything);

  for (const [u, role] of roles) {
    const hidden = await hiddenFromMember(ws.id, u.id, role);
    const sees = u === owner || u === creator || u === invited;
    await runWithHidden(hidden, async () => {
      check(`${u.name} (${role}) counts`, await counts(), sees ? everything : onlyOpen);

      // Every way of reaching the restricted meeting by its id.
      const id = secret.transcript.id;
      const found = {
        findUnique: !!(await prisma.transcript.findUnique({ where: { id } })),
        findFirst: !!(await prisma.transcript.findFirst({ where: { id, workspaceId: ws.id } })),
        findMany: (await prisma.transcript.findMany({ where: { id: { in: [id] } } })).length,
        project: !!(await prisma.project.findUnique({ where: { id: secret.project.id } })),
        task: !!(await prisma.task.findUnique({ where: { id: secret.task.id } })),
        grouped: (await prisma.task.groupBy({ by: ["projectId"], where: { project: w } })).length,
      };
      check(
        `${u.name} reaches the restricted project by id`,
        found,
        sees
          ? {
              findUnique: true,
              findFirst: true,
              findMany: 1,
              project: true,
              task: true,
              grouped: 2,
            }
          : {
              findUnique: false,
              findFirst: false,
              findMany: 0,
              project: false,
              task: false,
              grouped: 1,
            },
      );

      // Writes aimed at the restricted rows by id.
      const renamed = await prisma.transcript
        .update({ where: { id }, data: { title: "secret" } })
        .then(
          () => true,
          () => false,
        );
      const many = await prisma.task.updateMany({
        where: { id: secret.task.id },
        data: { title: "secret" },
      });
      check(
        `${u.name} writes to the restricted project`,
        [renamed, many.count],
        sees ? [true, 1] : [false, 0],
      );

      // The open project is never affected.
      check(
        `${u.name} still reads the open project`,
        !!(await prisma.transcript.findUnique({ where: { id: open.transcript.id } })),
        true,
      );
    });
  }

  await runWithHidden(await hiddenFromOutsiders(ws.id), async () => {
    check("support access and group emails: only the open project", await counts(), onlyOpen);
  });

  // Managing access: who may change it, and what a change does.
  const as = (u: { id: string }, role: "OWNER" | "ADMIN" | "MEMBER") => ({
    workspaceId: ws.id,
    userId: u.id,
    role,
  });
  const status = (p: Promise<unknown>) =>
    p.then(
      () => 200,
      (e: { status?: number }) => e?.status ?? 500,
    );
  const pid = secret.project.id;
  check(
    "outsider asking for the access list gets 404",
    await status(getProjectAccess(as(outsider, "MEMBER"), pid)),
    404,
  );
  check(
    "admin outside the project gets 404 too",
    await status(getProjectAccess(as(admin, "ADMIN"), pid)),
    404,
  );
  check(
    "an invited member can read the list but not change it",
    [
      (await getProjectAccess(as(invited, "MEMBER"), pid)).canManage,
      await status(setProjectAccess(as(invited, "MEMBER"), pid, { visibility: "WORKSPACE" })),
    ],
    [false, 403],
  );
  check(
    "someone from outside the workspace cannot be added",
    await status(
      setProjectAccess(as(creator, "MEMBER"), pid, {
        visibility: "RESTRICTED",
        memberUserIds: ["nobody"],
      }),
    ),
    400,
  );
  const changed = await setProjectAccess(as(creator, "MEMBER"), pid, {
    visibility: "RESTRICTED",
    memberUserIds: [admin.id, creator.id],
  });
  check(
    "the creator replaces the list: admin in, invited out, creator not listed twice",
    changed.access.members.map((m) => m.userId),
    [admin.id],
  );
  check(
    "after the change: admin sees it, the removed member does not",
    [
      (await hiddenFromMember(ws.id, admin.id, "ADMIN")).projectIds.length,
      (await hiddenFromMember(ws.id, invited.id, "MEMBER")).projectIds,
    ],
    [0, [pid]],
  );
  check(
    "the owner can manage a project they did not create",
    (await getProjectAccess(as(owner, "OWNER"), pid)).canManage,
    true,
  );

  // Opening the project again gives it back to everybody.
  await rawPrisma.project.update({
    where: { id: secret.project.id },
    data: { visibility: "WORKSPACE" },
  });
  await runWithHidden(await hiddenFromMember(ws.id, outsider.id, "MEMBER"), async () => {
    check("after reopening, outsider sees everything", await counts(), everything);
  });

  return [ws.id, [owner, admin, creator, invited, outsider].map((u) => u.id)] as const;
}

let created: readonly [string, string[]] | undefined;
main()
  .then((ids) => {
    created = ids;
  })
  .catch((e) => {
    failures++;
    console.error("FAIL", e);
  })
  .finally(async () => {
    // Cascades take the projects, meetings and the rest with the workspace.
    await rawPrisma.workspace.deleteMany({ where: { name: tag } });
    await rawPrisma.user.deleteMany({ where: { firebaseUid: { startsWith: tag } } });
    const left = await rawPrisma.user.count({ where: { firebaseUid: { startsWith: tag } } });
    console.log(`cleanup: ${left === 0 && created ? "done" : `users left ${left}`}`);
    console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
    await rawPrisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
