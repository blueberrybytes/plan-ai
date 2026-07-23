/**
 * Pre-flight check for the Berry Telegram bot.
 *
 * Verifies every piece of configuration BEFORE the first real message, so a
 * failure shows up here as one clear line instead of as silence in a chat with
 * a prospect watching.
 *
 * Checks: env vars present, bot token actually works, webhook registered and
 * error-free, workspace/user rows exist, BYOK keys configured, lead alerts
 * deliverable.
 *
 *   yarn preflight:berry
 *
 * Secrets are never printed — only whether they are set, and their length.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Status = "ok" | "warn" | "fail";
const results: { status: Status; label: string; detail: string }[] = [];

const record = (status: Status, label: string, detail: string): void => {
  results.push({ status, label, detail });
};

/** Shows a secret is present without revealing it. */
const mask = (value: string): string => `${value.length} caracteres`;

const checkEnvVars = (): void => {
  const required = [
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_WEBHOOK_SECRET",
    "TELEGRAM_WORKSPACE_ID",
    "TELEGRAM_SERVICE_USER_ID",
  ];

  for (const name of required) {
    const value = process.env[name];
    if (!value) record("fail", name, "SIN DEFINIR — el bot no responderá");
    else record("ok", name, mask(value));
  }

  const notify = process.env.TELEGRAM_LEAD_NOTIFY_EMAIL;
  if (!notify) {
    record("warn", "TELEGRAM_LEAD_NOTIFY_EMAIL", "sin definir — nadie se enterará de los leads");
  } else if (!process.env.RESEND_API_KEY) {
    record("warn", "TELEGRAM_LEAD_NOTIFY_EMAIL", "definido, pero falta RESEND_API_KEY");
  } else {
    record("ok", "TELEGRAM_LEAD_NOTIFY_EMAIL", notify);
  }

  record(
    "ok",
    "TELEGRAM_TRANSCRIPTION_LANGUAGE",
    `${process.env.TELEGRAM_TRANSCRIPTION_LANGUAGE || "multi"}${
      (process.env.TELEGRAM_TRANSCRIPTION_LANGUAGE || "multi") === "multi"
        ? " (ojo: NO cubre catalán — devuelve transcripción vacía)"
        : ""
    }`,
  );
  record("ok", "TELEGRAM_SYNC_TO_LINEAR", process.env.TELEGRAM_SYNC_TO_LINEAR || "false");
  record(
    "ok",
    "TELEGRAM_RATE_LIMIT",
    `${process.env.TELEGRAM_RATE_LIMIT || 5} propuestas/chat/día`,
  );
};

const checkBot = async (): Promise<void> => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json()) as {
      ok: boolean;
      result?: { username?: string; first_name?: string };
      description?: string;
    };

    if (!body.ok) {
      record("fail", "Token del bot", body.description || "rechazado por Telegram");
      return;
    }
    record("ok", "Token del bot", `@${body.result?.username} (${body.result?.first_name})`);
  } catch (err) {
    record("fail", "Token del bot", `no se pudo contactar con Telegram: ${String(err)}`);
  }
};

const checkWebhook = async (): Promise<void> => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json()) as {
      ok: boolean;
      result?: {
        url?: string;
        pending_update_count?: number;
        last_error_message?: string;
        has_custom_certificate?: boolean;
      };
    };

    const info = body.result;
    if (!info?.url) {
      record("fail", "Webhook", "no registrado — ejecuta setWebhook (paso 7 de TELEGRAM.md)");
      return;
    }

    record("ok", "Webhook", info.url);

    if (info.last_error_message) {
      const hint = /401|unauthorized/i.test(info.last_error_message)
        ? " → el secreto del .env no coincide con el del setWebhook"
        : "";
      record("fail", "Último error del webhook", `${info.last_error_message}${hint}`);
    }
    if (info.pending_update_count) {
      record(
        "warn",
        "Updates pendientes",
        `${info.pending_update_count} — el backend no los está procesando`,
      );
    }
  } catch (err) {
    record("fail", "Webhook", `no se pudo consultar: ${String(err)}`);
  }
};

const checkDatabase = async (): Promise<void> => {
  const workspaceId = process.env.TELEGRAM_WORKSPACE_ID;
  const userId = process.env.TELEGRAM_SERVICE_USER_ID;
  if (!workspaceId || !userId) return;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true, openRouterKey: true, deepgramKey: true, isCourtesy: true },
  });

  if (!workspace) {
    record("fail", "Workspace", `no existe ningún workspace con id ${workspaceId}`);
  } else {
    record("ok", "Workspace", `${workspace.name}${workspace.isCourtesy ? " (cortesía)" : ""}`);

    // A courtesy workspace deliberately falls back to the platform key
    // (`resolveWorkspaceApiKey`), so a missing workspace key is only fatal when
    // there is no platform key either. Reporting it as a hard failure would be
    // wrong — but so would staying silent about who pays for it.
    if (workspace.openRouterKey) {
      record("ok", "Clave OpenRouter", "configurada en el workspace");
    } else if (workspace.isCourtesy && process.env.OPENROUTER_API_KEY) {
      record(
        "warn",
        "Clave OpenRouter",
        "usando la clave global de la plataforma (cortesía) — el gasto NO va al workspace",
      );
    } else {
      record("fail", "Clave OpenRouter", "FALTA — no se generará ninguna propuesta");
    }

    if (workspace.deepgramKey) {
      record("ok", "Clave Deepgram", "configurada en el workspace");
    } else if (process.env.DEEPGRAM_API_KEY) {
      record("warn", "Clave Deepgram", "usando la clave global del entorno");
    } else {
      record("warn", "Clave Deepgram", "falta — las notas de voz no funcionarán");
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });

  if (!user) {
    record("fail", "Usuario de servicio", `no existe ningún usuario con id ${userId}`);
    return;
  }
  record("ok", "Usuario de servicio", user.email);

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId },
    select: { role: true },
  });

  if (!membership) {
    record(
      "fail",
      "Pertenencia",
      "el usuario de servicio NO es miembro de ese workspace — las generaciones fallarán",
    );
  } else {
    record("ok", "Pertenencia", `rol ${membership.role}`);
  }
};

void (async () => {
  console.log("\n🫐  Preflight de Berry\n");

  checkEnvVars();
  await checkBot();
  await checkWebhook();
  await checkDatabase().catch((err) =>
    record("fail", "Base de datos", `no se pudo consultar: ${String(err)}`),
  );

  const icon: Record<Status, string> = { ok: "✓", warn: "!", fail: "✗" };
  for (const { status, label, detail } of results) {
    console.log(`  ${icon[status]} ${label.padEnd(34)} ${detail}`);
  }

  const failures = results.filter((r) => r.status === "fail").length;
  const warnings = results.filter((r) => r.status === "warn").length;

  console.log(
    failures
      ? `\n✗ ${failures} problema(s) que impiden funcionar${warnings ? `, ${warnings} aviso(s)` : ""}.\n`
      : `\n✓ Todo listo${warnings ? ` (${warnings} aviso(s))` : ""}. Escríbele al bot.\n`,
  );

  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
})();
