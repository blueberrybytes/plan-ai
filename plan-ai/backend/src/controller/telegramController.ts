import { Controller, Post, Route, Request, Tags, SuccessResponse } from "tsoa";
import * as express from "express";
import { logger } from "../utils/logger";
import { handleIncomingMessage } from "../services/telegramIntakeService";
import { verifyWebhookSecret, isTelegramConfigured } from "../services/telegramService";
import type { TelegramUpdate } from "../services/telegramService";

@Tags("Integrations")
@Route("api/integrations")
export class TelegramController extends Controller {
  /**
   * Receives updates from the Telegram Bot API for the "Berry" sales bot.
   *
   * Unauthenticated by necessity (Telegram has no OAuth for webhooks) — the gate
   * is the `X-Telegram-Bot-Api-Secret-Token` header registered via `setWebhook`,
   * following the same shape as the Stripe and GitHub receivers in this codebase.
   *
   * Answers 200 immediately and processes in the background: Telegram retries
   * any update it doesn't get a prompt response for, and generation takes far
   * longer than its tolerance — without this a slow generation becomes a
   * duplicate-proposal loop.
   */
  @SuccessResponse("200", "Update received")
  @Post("telegram/webhook")
  public async handleWebhook(@Request() req: express.Request): Promise<{ status: string }> {
    if (!verifyWebhookSecret(req.headers["x-telegram-bot-api-secret-token"])) {
      // RETURN, never throw. A thrown Error here is turned into a 500 whose body
      // is the full stack trace — absolute filesystem paths and all — handed to
      // anyone who probes this public endpoint. Returning keeps the 401 and the
      // body deliberately vague.
      this.setStatus(401);
      logger.warn("[telegram] webhook called with a missing or wrong secret token");
      return { status: "unauthorized" };
    }

    if (!isTelegramConfigured()) {
      logger.error("[telegram] webhook hit but TELEGRAM_BOT_TOKEN is not configured");
      return { status: "not_configured" };
    }

    const update = req.body as TelegramUpdate;
    // Ignore edits: re-generating a proposal because someone fixed a typo would
    // burn a rate-limit unit and send a second, near-identical document.
    const message = update?.message;

    if (!message || message.from?.is_bot) {
      return { status: "ignored" };
    }

    void handleIncomingMessage(message).catch((err) =>
      logger.error(`[telegram] unhandled intake error for update ${update.update_id}`, err),
    );

    return { status: "accepted" };
  }
}
