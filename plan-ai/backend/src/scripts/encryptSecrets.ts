/**
 * Encrypts the customer secrets that were stored as plain text before
 * secretCrypto.ts existed:
 *
 *   Workspace.openRouterKey, Workspace.deepgramKey, Workspace.openaiKey
 *   WorkspaceIntegration.accessToken, WorkspaceIntegration.refreshToken
 *   UserIntegration.accessToken, UserIntegration.refreshToken
 *
 *   yarn secrets:encrypt --dry-run   # counts the plain text values, changes nothing
 *   yarn secrets:encrypt             # encrypts them
 *   yarn secrets:encrypt --decrypt   # rollback: writes them back as plain text
 *
 * Run it after the backend that reads encrypted values is deployed, with the
 * same SECRETS_ENCRYPTION_KEY as that backend. It can run again at any time:
 * values that are already encrypted are left alone.
 *
 * Each row is updated only if the value is still the one this script read,
 * so a token refreshed by the running backend in the meantime is never
 * overwritten. Such rows are counted as "changed meanwhile"; run the script
 * again to pick them up.
 *
 * Rotating the key: set the new key in SECRETS_ENCRYPTION_KEY and the old one
 * in SECRETS_ENCRYPTION_KEY_PREVIOUS (on the backend and here), deploy, and
 * run the script. Values sealed with the old key are rewritten with the new
 * one. When it reports 0 to rotate, remove SECRETS_ENCRYPTION_KEY_PREVIOUS.
 *
 * --decrypt is only for rolling back to a backend version that cannot read
 * encrypted values. It needs the key too.
 *
 * `yarn secrets:encrypt` loads plan-ai/backend/.env, and env-cmd lets that
 * file win over variables that are already set. Against the production
 * database (Railway), run the script directly from plan-ai/backend with the
 * Postgres public URL (DATABASE_PUBLIC_URL of the Postgres service) and the
 * same key as the backend in the environment:
 *   npx ts-node --transpile-only src/scripts/encryptSecrets.ts --dry-run
 */
import { PrismaClient } from "@prisma/client";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  sealedWithPreviousKey,
  secretEncryptionEnabled,
} from "../utils/secretCrypto";

const prisma = new PrismaClient();
const PAGE_SIZE = 200;

type Row = { id: string } & Record<string, string | null>;

/** One table with its secret columns, read and written through Prisma. */
type Target = {
  table: string;
  fields: string[];
  findPage: (cursor: string | undefined) => Promise<Row[]>;
  /** Updates the row only if every field still holds `expected`. Returns rows changed. */
  update: (
    id: string,
    expected: Record<string, string>,
    data: Record<string, string>,
  ) => Promise<number>;
};

const pageArgs = (cursor: string | undefined) => ({
  take: PAGE_SIZE,
  orderBy: { id: "asc" as const },
  ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
});

const TARGETS: Target[] = [
  {
    table: "Workspace",
    fields: ["openRouterKey", "deepgramKey", "openaiKey"],
    findPage: (cursor) =>
      prisma.workspace.findMany({
        ...pageArgs(cursor),
        select: { id: true, openRouterKey: true, deepgramKey: true, openaiKey: true },
      }),
    update: async (id, expected, data) =>
      (await prisma.workspace.updateMany({ where: { id, ...expected }, data })).count,
  },
  {
    table: "WorkspaceIntegration",
    fields: ["accessToken", "refreshToken"],
    findPage: (cursor) =>
      prisma.workspaceIntegration.findMany({
        ...pageArgs(cursor),
        select: { id: true, accessToken: true, refreshToken: true },
      }),
    update: async (id, expected, data) =>
      (await prisma.workspaceIntegration.updateMany({ where: { id, ...expected }, data })).count,
  },
  {
    table: "UserIntegration",
    fields: ["accessToken", "refreshToken"],
    findPage: (cursor) =>
      prisma.userIntegration.findMany({
        ...pageArgs(cursor),
        select: { id: true, accessToken: true, refreshToken: true },
      }),
    update: async (id, expected, data) =>
      (await prisma.userIntegration.updateMany({ where: { id, ...expected }, data })).count,
  },
];

type Counts = {
  rows: number;
  plain: number;
  encrypted: number;
  unreadable: number;
  rotated: number;
  written: number;
  changedMeanwhile: number;
};

/** Fails early if the key cannot decrypt what it encrypts. */
const checkKey = () => {
  const probe = "secrets:encrypt probe";
  const sealed = encryptSecret(probe);
  if (!isEncryptedSecret(sealed) || decryptSecret(sealed) !== probe) {
    throw new Error("SECRETS_ENCRYPTION_KEY did not round trip a test value");
  }
};

const canDecrypt = (value: string): boolean => {
  try {
    decryptSecret(value);
    return true;
  } catch {
    return false;
  }
};

const processTarget = async (target: Target, mode: "encrypt" | "decrypt", dryRun: boolean) => {
  const counts: Counts = {
    rows: 0,
    plain: 0,
    encrypted: 0,
    unreadable: 0,
    rotated: 0,
    written: 0,
    changedMeanwhile: 0,
  };
  let cursor: string | undefined;

  for (;;) {
    const page = await target.findPage(cursor);
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    for (const row of page) {
      counts.rows++;
      const expected: Record<string, string> = {};
      const data: Record<string, string> = {};

      for (const field of target.fields) {
        const value = row[field];
        if (typeof value !== "string" || value === "") continue;

        if (isEncryptedSecret(value)) {
          counts.encrypted++;
          if (!canDecrypt(value)) {
            // Encrypted with another key, or damaged. Never touched here.
            counts.unreadable++;
            console.warn(`  ${target.table} ${row.id}.${field}: encrypted but does not decrypt`);
            continue;
          }
          if (mode === "decrypt") {
            expected[field] = value;
            data[field] = decryptSecret(value);
          } else if (sealedWithPreviousKey(value)) {
            // Key rotation: open with the old key, seal with the new one.
            counts.rotated++;
            const plain = decryptSecret(value);
            const sealed = encryptSecret(plain);
            if (decryptSecret(sealed) !== plain || sealedWithPreviousKey(sealed)) {
              throw new Error(`${target.table} ${row.id}.${field}: rotation did not round trip`);
            }
            expected[field] = value;
            data[field] = sealed;
          }
          continue;
        }

        counts.plain++;
        if (mode === "encrypt") {
          const sealed = encryptSecret(value);
          if (decryptSecret(sealed) !== value) {
            throw new Error(`${target.table} ${row.id}.${field}: encryption did not round trip`);
          }
          expected[field] = value;
          data[field] = sealed;
        }
      }

      if (Object.keys(data).length === 0 || dryRun) continue;
      const changed = await target.update(row.id, expected, data);
      if (changed === 1) counts.written += Object.keys(data).length;
      else counts.changedMeanwhile++;
    }

    if (page.length < PAGE_SIZE) break;
  }

  return counts;
};

const main = async () => {
  const dryRun = process.argv.includes("--dry-run");
  const mode = process.argv.includes("--decrypt") ? "decrypt" : "encrypt";

  if (!secretEncryptionEnabled()) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32`, " +
        "set it on the backend, deploy, then run this script with the same value.",
    );
  }
  checkKey();

  console.log(
    `${mode === "encrypt" ? "Encrypting" : "Decrypting"} stored secrets${dryRun ? " (dry run, nothing is written)" : ""}`,
  );

  let unreadable = 0;
  let changedMeanwhile = 0;
  for (const target of TARGETS) {
    const c = await processTarget(target, mode, dryRun);
    unreadable += c.unreadable;
    changedMeanwhile += c.changedMeanwhile;
    const action = dryRun ? "would write" : "written";
    const todo = mode === "encrypt" ? c.plain + c.rotated : c.encrypted - c.unreadable;
    console.log(
      `${target.table}: ${c.rows} rows, ${c.plain} plain text values, ${c.encrypted} encrypted` +
        ` (${c.unreadable} unreadable with this key, ${c.rotated} with the previous key),` +
        ` ${dryRun ? todo : c.written} ${action}` +
        (c.changedMeanwhile ? `, ${c.changedMeanwhile} rows changed meanwhile` : ""),
    );
  }

  if (changedMeanwhile > 0) {
    console.log("Some rows changed while the script ran. Run it again to finish them.");
  }
  if (unreadable > 0) {
    console.error(
      `${unreadable} values are encrypted with a different key or damaged. ` +
        "Check SECRETS_ENCRYPTION_KEY. Those customers must enter the key or reconnect.",
    );
    process.exitCode = 1;
  }
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
