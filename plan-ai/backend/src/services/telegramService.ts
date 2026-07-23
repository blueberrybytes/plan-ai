import { logger } from "../utils/logger";

/**
 * Thin client over the Telegram Bot API.
 *
 * Deliberately dependency-free (native fetch + FormData, same style as
 * `emailService`) — the Bot API is a plain HTTPS/multipart interface and a
 * wrapper library would add a dependency for four endpoints.
 *
 * Only transport lives here. Anything that decides WHAT to send belongs in
 * `telegramIntakeService`.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = "https://api.telegram.org";

/** Telegram rejects captions over 1024 chars and messages over 4096. */
const MAX_CAPTION = 1024;
const MAX_MESSAGE = 4096;

export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: {
    id: number;
    username?: string;
    first_name?: string;
    is_bot: boolean;
    /** IETF tag of the sender's Telegram client, e.g. "en", "es-ES". */
    language_code?: string;
  };
  text?: string;
  caption?: string;
  voice?: { file_id: string; duration: number; mime_type?: string };
  audio?: { file_id: string; duration: number; mime_type?: string };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

export const isTelegramConfigured = (): boolean => Boolean(BOT_TOKEN);

const call = async (method: string, body: BodyInit, headers?: HeadersInit): Promise<unknown> => {
  if (!BOT_TOKEN) {
    logger.warn(`[telegram] TELEGRAM_BOT_TOKEN not set — skipping ${method}`);
    return null;
  }

  const response = await fetch(`${API_BASE}/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    body,
    headers,
  });

  if (!response.ok) {
    // Telegram returns a JSON body with `description` on failure; surface it so
    // "chat not found" / "bot was blocked" show up in logs as themselves rather
    // than a bare 403.
    const detail = await response.text().catch(() => "");
    throw new Error(`Telegram ${method} failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  return response.json();
};

const json = (method: string, payload: Record<string, unknown>): Promise<unknown> =>
  call(method, JSON.stringify(payload), { "Content-Type": "application/json" });

export const sendMessage = async (chatId: string, text: string): Promise<void> => {
  await json("sendMessage", { chat_id: chatId, text: text.slice(0, MAX_MESSAGE) });
};

/** Escapes the five characters Telegram's HTML parse mode treats as markup. */
const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Sends a message with a clickable link.
 *
 * Plain-text URLs are only auto-linked by Telegram when they carry a real TLD —
 * `http://localhost:3000/…` is NOT linkified, which is why local test links look
 * dead. HTML parse mode makes the anchor explicit regardless of host, and lets
 * us show a label ("Ver online") instead of a raw URL.
 */
export const sendMessageWithLink = async (
  chatId: string,
  text: string,
  links: { label: string; url: string }[],
): Promise<void> => {
  const body = escapeHtml(text);
  const anchors = links
    .map((l) => `<a href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a>`)
    .join("\n");
  await json("sendMessage", {
    chat_id: chatId,
    text: `${body}\n\n${anchors}`.slice(0, MAX_MESSAGE),
    parse_mode: "HTML",
    // No link preview card: with several prototype links the previews would
    // stack into a wall of thumbnails.
    link_preview_options: { is_disabled: true },
  });
};

/**
 * Shows "typing…" / "uploading document…" in the client. Expires after ~5s, so
 * call it again before each long step rather than once up front.
 */
export const sendChatAction = async (
  chatId: string,
  action: "typing" | "upload_document" | "upload_photo",
): Promise<void> => {
  try {
    await json("sendChatAction", { chat_id: chatId, action });
  } catch (err) {
    // Purely cosmetic — never let a failed typing indicator kill a delivery.
    logger.warn(`[telegram] sendChatAction failed for ${chatId}`, err);
  }
};

const sendFile = async (
  method: "sendDocument" | "sendPhoto",
  field: "document" | "photo",
  chatId: string,
  file: Buffer,
  filename: string,
  mimeType: string,
  caption?: string,
): Promise<void> => {
  const form = new FormData();
  form.append("chat_id", chatId);
  if (caption) form.append("caption", caption.slice(0, MAX_CAPTION));
  // Buffer → Uint8Array copy: Blob rejects a Node Buffer's SharedArrayBuffer-backed view.
  form.append(field, new Blob([new Uint8Array(file)], { type: mimeType }), filename);
  await call(method, form);
};

export const sendDocument = (
  chatId: string,
  file: Buffer,
  filename: string,
  mimeType: string,
  caption?: string,
): Promise<void> => sendFile("sendDocument", "document", chatId, file, filename, mimeType, caption);

export const sendPhoto = (
  chatId: string,
  image: Buffer,
  filename: string,
  caption?: string,
): Promise<void> => sendFile("sendPhoto", "photo", chatId, image, filename, "image/png", caption);

/**
 * Resolves a `file_id` to a temporary download URL. Used for voice notes.
 * The URL embeds the bot token, so never log it.
 */
export const getFileUrl = async (fileId: string): Promise<string | null> => {
  const result = (await json("getFile", { file_id: fileId })) as {
    ok: boolean;
    result?: { file_path?: string };
  } | null;

  const filePath = result?.result?.file_path;
  if (!filePath) return null;
  return `${API_BASE}/file/bot${BOT_TOKEN}/${filePath}`;
};

/**
 * Constant-time-ish comparison of the header Telegram echoes back from
 * `setWebhook`. This is the ONLY thing standing between the public endpoint and
 * an attacker spending our OpenRouter credits, so it is mandatory, not optional.
 */
export const verifyWebhookSecret = (headerValue: unknown): boolean => {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) {
    logger.error("[telegram] TELEGRAM_WEBHOOK_SECRET not set — rejecting all webhook traffic");
    return false;
  }
  return typeof headerValue === "string" && headerValue === expected;
};
