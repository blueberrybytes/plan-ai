/**
 * Registers (or removes) the Telegram webhook for Berry.
 *
 * Reads the token and secret from `.env` so neither ever has to be typed into a
 * shell — a `curl` with the token inline lands in shell history, in scrollback,
 * and in any screen share.
 *
 *   yarn webhook:berry https://xxxx.ngrok-free.app
 *   yarn webhook:berry --delete
 *   yarn webhook:berry            (no args: just shows the current state)
 */
const WEBHOOK_PATH = "/api/integrations/telegram/webhook";

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

const api = async (
  method: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15_000),
  });
  return (await res.json()) as Record<string, unknown>;
};

const showState = async (): Promise<void> => {
  const info = (await api("getWebhookInfo")).result as
    | {
        url?: string;
        pending_update_count?: number;
        last_error_message?: string;
        last_error_date?: number;
      }
    | undefined;

  console.log("\nEstado actual del webhook:");
  console.log(`  URL:                ${info?.url || "(ninguna)"}`);
  console.log(`  Updates pendientes: ${info?.pending_update_count ?? 0}`);

  if (info?.last_error_message) {
    console.log(`  Último error:       ${info.last_error_message}`);
    if (/401|unauthorized/i.test(info.last_error_message)) {
      console.log(
        "    → El secreto del .env no coincide con el registrado. Vuelve a ejecutar este script.",
      );
    } else if (/timeout|failed to resolve|connection/i.test(info.last_error_message)) {
      console.log("    → Telegram no llega a tu URL. ¿Están vivos el backend y el túnel?");
    }
  }
  console.log("");
};

void (async () => {
  if (!token || !secret) {
    console.error(
      "\n✗ Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_WEBHOOK_SECRET en el .env.\n" +
        "  Revísalo con: yarn preflight:berry\n",
    );
    process.exit(1);
  }

  const arg = process.argv[2];

  if (!arg) {
    await showState();
    console.log("Para registrarlo:  yarn webhook:berry https://xxxx.ngrok-free.app\n");
    return;
  }

  if (arg === "--delete") {
    const res = await api("deleteWebhook");
    console.log(res.ok ? "\n✓ Webhook eliminado.\n" : `\n✗ ${JSON.stringify(res)}\n`);
    return;
  }

  let base: URL;
  try {
    base = new URL(arg);
  } catch {
    console.error(`\n✗ "${arg}" no es una URL válida.\n`);
    process.exit(1);
  }

  // Telegram refuses plain HTTP outright, and the error it returns is vague
  // enough to waste an afternoon. Catch it here instead.
  if (base.protocol !== "https:") {
    console.error("\n✗ Telegram solo acepta HTTPS. Usa la URL https del túnel.\n");
    process.exit(1);
  }

  const url = `${base.origin}${WEBHOOK_PATH}`;
  console.log(`\nRegistrando: ${url}`);

  const res = await api("setWebhook", {
    url,
    secret_token: secret,
    // Everything else (edits, channel posts, reactions) would be noise the
    // intake ignores anyway — and each one costs a needless request.
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });

  if (!res.ok) {
    console.error(`\n✗ Telegram rechazó el registro: ${res.description || JSON.stringify(res)}\n`);
    process.exit(1);
  }

  console.log("✓ Registrado.");
  await showState();
  console.log("Ahora escríbele al bot. Los logs del backend llevan el prefijo [telegram].\n");
})();
