import { PrismaClient, Prisma, TranscriptSource, TelegramLinkStatus } from "@prisma/client";
import { logger } from "../utils/logger";
import { docGenerationService } from "./docGenerationService";
import { DocumentGenerator } from "../utils/documentGenerator";
import {
  extractMermaidBlocks,
  renderMermaidToPng,
  stripMermaidBlocks,
} from "../utils/mermaidRender";
import * as telegram from "./telegramService";
import type { TelegramMessage } from "./telegramService";
import { transcribeVoiceNote } from "./telegramTranscriptionService";
import { buildSalesDeck, DEFAULT_DECK_THEME, type DeckTheme } from "../utils/salesDeck";
import { extractBullets, extractSummary } from "../utils/docOutline";
import { sendTelegramLeadEmail } from "./emailService";
import { transcriptGenerationQueue } from "../queue/transcriptGenerationQueue";
import { buildMockupSpec } from "./mockupGenerationService";
import { MOCKUP_PALETTES, isRenderableSpec, renderMockup } from "../utils/mockupRender";
import {
  appendTurn,
  parseConversation,
  triageMessage,
  type ConversationTurn,
} from "./telegramAgentService";
import { generatePrototypes } from "./prototypeGenerationService";
import { berryStrings, resolveLang, type BerryStrings } from "./telegramI18n";

const prisma = new PrismaClient();

/**
 * "Berry" — the Telegram intake used for commercial capture.
 *
 * A prospect sends a description of what they want; they get back a real
 * document and an architecture diagram in under a minute. This is a CHANNEL on
 * top of the existing generation pipeline, not a new product: everything below
 * `startGeneration` is code that already runs in production.
 *
 * Prospects have no Firebase account, so every chat is bound to an internal
 * service workspace (see `TelegramLink`) whose BYOK keys pay for the work. That
 * makes each conversation marketing spend, which is why the rate limit here is
 * a hard requirement rather than a nicety.
 */

/** Requests allowed per chat inside `RATE_WINDOW_MS`. */
const RATE_LIMIT = Number(process.env.TELEGRAM_RATE_LIMIT ?? 5);
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How long we wait for doc generation before apologising to the prospect. */
const GENERATION_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;

/** Messages allowed per chat per window, generated or not. Triage costs money too. */
const MESSAGE_LIMIT = Number(process.env.TELEGRAM_MESSAGE_LIMIT ?? 30);

/**
 * Length heuristic used ONLY when triage is unavailable. It is the old
 * two-branch rule kept as a safety net: crude, but better than silence.
 */
const FALLBACK_BRIEF_LENGTH = 25;

const SALES_WORKSPACE_ID = process.env.TELEGRAM_WORKSPACE_ID;
const SALES_USER_ID = process.env.TELEGRAM_SERVICE_USER_ID;

/** Opt-in: push extracted tasks from each lead into Linear. Off by default. */
const SYNC_TO_LINEAR = process.env.TELEGRAM_SYNC_TO_LINEAR === "true";

/** Public base URL, for the shareable proposal link. */
const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");


/**
 * Resolves the chat to a workspace, creating the link on first contact.
 * Returns null when the sales workspace isn't configured, so the bot degrades
 * to silence rather than throwing on every message.
 */
const resolveLink = async (message: TelegramMessage) => {
  if (!SALES_WORKSPACE_ID || !SALES_USER_ID) {
    logger.error(
      "[telegram] TELEGRAM_WORKSPACE_ID / TELEGRAM_SERVICE_USER_ID not set — cannot resolve a workspace",
    );
    return null;
  }

  const chatId = String(message.chat.id);
  const handle = message.from?.username ?? message.from?.first_name ?? null;

  return prisma.telegramLink.upsert({
    where: { telegramChatId: chatId },
    create: {
      telegramChatId: chatId,
      telegramHandle: handle,
      workspaceId: SALES_WORKSPACE_ID,
      userId: SALES_USER_ID,
    },
    update: { lastSeenAt: new Date(), ...(handle ? { telegramHandle: handle } : {}) },
  });
};

/**
 * Message budget — separate from the generation budget.
 *
 * Triage costs a cheap model call on EVERY message, so a prospect who chats
 * without ever describing anything still costs money. This caps the chatter;
 * `consumeRateLimit` caps the expensive generations.
 */
const consumeMessageBudget = async (linkId: string): Promise<boolean> => {
  const link = await prisma.telegramLink.findUnique({ where: { id: linkId } });
  if (!link || link.status === TelegramLinkStatus.BLOCKED) return false;

  if (Date.now() - link.windowStartedAt.getTime() > RATE_WINDOW_MS) {
    await prisma.telegramLink.update({
      where: { id: linkId },
      data: { messageCount: 1, requestCount: 0, windowStartedAt: new Date() },
    });
    return true;
  }

  if (link.messageCount >= MESSAGE_LIMIT) return false;

  await prisma.telegramLink.update({
    where: { id: linkId },
    data: { messageCount: { increment: 1 } },
  });
  return true;
};

/** Persists the trimmed history back onto the link. */
const saveConversation = async (linkId: string, history: ConversationTurn[]): Promise<void> => {
  await prisma.telegramLink
    .update({
      where: { id: linkId },
      data: { conversation: history as unknown as Prisma.JsonArray },
    })
    .catch((err) => logger.warn(`[telegram] could not persist conversation for ${linkId}`, err));
};

/**
 * Sliding-ish window: the counter resets once the window elapses. Returns true
 * when the request is allowed and consumes one unit.
 */
const consumeRateLimit = async (linkId: string): Promise<boolean> => {
  const link = await prisma.telegramLink.findUnique({ where: { id: linkId } });
  if (!link || link.status === TelegramLinkStatus.BLOCKED) return false;

  const windowExpired = Date.now() - link.windowStartedAt.getTime() > RATE_WINDOW_MS;

  if (windowExpired) {
    await prisma.telegramLink.update({
      where: { id: linkId },
      data: { requestCount: 1, windowStartedAt: new Date() },
    });
    return true;
  }

  if (link.requestCount >= RATE_LIMIT) return false;

  await prisma.telegramLink.update({
    where: { id: linkId },
    data: { requestCount: { increment: 1 } },
  });
  return true;
};

/** Polls the doc row until generation settles. Returns null on timeout/failure. */
const awaitGeneratedDoc = async (
  docId: string,
): Promise<{ title: string; content: string } | null> => {
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const doc = await prisma.docDocument.findUnique({
      where: { id: docId },
      select: { status: true, title: true, content: true },
    });

    if (!doc) return null;
    if (doc.status === "FAILED") return null;
    if (doc.status !== "GENERATING" && doc.content.trim()) {
      return { title: doc.title, content: doc.content };
    }
  }

  logger.warn(`[telegram] doc ${docId} still generating after ${GENERATION_TIMEOUT_MS}ms`);
  return null;
};

/**
 * Sends the visual designs: the flat SVG mockups first, then links to navigable
 * HTML prototypes.
 *
 * Both, deliberately. The image lands the instant the prospect opens Telegram
 * with nothing to tap; the link is the one that convinces, because they can
 * scroll and explore a real interface. Sending only the link would waste the
 * moment the notification arrives.
 *
 * Prototypes are best-effort: they involve two more model calls, and their
 * absence must not delay the images that are already rendered.
 */
const deliverDesigns = async (
  chatId: string,
  brief: string,
  workspaceId: string,
  userId: string,
  transcriptId: string,
  t: BerryStrings,
  lang: string,
): Promise<boolean> => {
  const sentImages = await deliverMockups(chatId, brief, workspaceId, t);

  try {
    const prototypes = await generatePrototypes(
      brief,
      workspaceId,
      userId,
      "Prototipo",
      transcriptId,
      lang,
    );

    if (prototypes.length) {
      await telegram.sendMessageWithLink(
        chatId,
        t.prototypesReady,
        prototypes.map((p) => ({
          label: t.openPrototypeLabel(t.variantLabel(p.variant)),
          url: `${APP_URL}/prototype/public/${p.id}`,
        })),
      );
      return true;
    }
  } catch (err) {
    logger.warn(`[telegram] prototype generation failed for chat ${chatId}`, err);
  }

  return sentImages;
};

interface WorkspaceBranding {
  /** For the doc: passed to startGeneration so the web view is themed. */
  themeId: string | null;
  /** For the deck (pptx). */
  deck: DeckTheme;
  /** For the mermaid diagram init directive. */
  mermaid: { primary: string; secondary: string; text: string; background: string } | null;
}

/**
 * One lookup for everything a proposal renders: the doc's theme id, the deck's
 * colours, and the mermaid palette. Before this, the Telegram doc was generated
 * with no theme at all (`themeId: null`) and the diagram used mermaid's default
 * yellow/lavender — both off-brand. A missing theme must never block delivery.
 */
const resolveWorkspaceBranding = async (workspaceId: string): Promise<WorkspaceBranding> => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      defaultThemeId: true,
      defaultTheme: {
        select: {
          primaryColor: true,
          secondaryColor: true,
          backgroundColor: true,
          textColor: true,
          headingFont: true,
          bodyFont: true,
        },
      },
    },
  });

  const theme = workspace?.defaultTheme;
  return {
    themeId: workspace?.defaultThemeId ?? null,
    deck: theme ?? DEFAULT_DECK_THEME,
    mermaid: theme
      ? {
          primary: theme.primaryColor,
          secondary: theme.secondaryColor,
          text: theme.textColor,
          background: theme.backgroundColor,
        }
      : null,
  };
};

/**
 * Generates and sends the two selectable mockups. Returns true if at least one
 * reached the prospect.
 *
 * One spec, two palettes — the client is choosing a direction, and two screens
 * built from the same content differ in exactly the way that makes the choice
 * meaningful. Generating two independent specs would produce two different
 * apps, which reads as indecision rather than options.
 */
const deliverMockups = async (
  chatId: string,
  brief: string,
  workspaceId: string,
  t: BerryStrings,
): Promise<boolean> => {
  try {
    const spec = await buildMockupSpec(brief, workspaceId);
    if (!spec || !isRenderableSpec(spec)) return false;

    await telegram.sendChatAction(chatId, "upload_photo");

    let delivered = 0;
    for (const palette of MOCKUP_PALETTES) {
      const png = await renderMockup(spec, palette);
      if (!png) continue;
      await telegram.sendPhoto(
        chatId,
        png,
        `mockup-${palette.name.toLowerCase()}.png`,
        t.designOption(t.variantLabel(palette.name)),
      );
      delivered += 1;
    }

    if (delivered === 2) {
      await telegram.sendMessage(chatId, t.chooseDesign);
    }

    return delivered > 0;
  } catch (err) {
    logger.warn(`[telegram] mockup delivery failed for chat ${chatId}`, err);
    return false;
  }
};

/** Filename-safe title (Telegram shows the attachment name to the prospect). */
const safeFilename = (title: string): string =>
  title.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80) || "Propuesta";

/**
 * Full intake for one message. Runs AFTER the webhook has already answered 200,
 * so it may take as long as it needs — but it must never throw into the void
 * without telling the prospect something.
 */
export const handleIncomingMessage = async (message: TelegramMessage): Promise<void> => {
  const chatId = String(message.chat.id);
  const directText = (message.text ?? message.caption ?? "").trim();
  const voice = message.voice ?? message.audio;

  // Language of the FIXED chrome comes straight from the prospect's Telegram
  // client — available on the very first message, no detection call.
  const lang = resolveLang(message.from?.language_code);
  const t = berryStrings(lang);

  if (directText.startsWith("/start") || directText.startsWith("/help")) {
    await telegram.sendMessage(chatId, t.greeting);
    return;
  }

  // Stickers, photos, locations — nothing we can build a proposal from.
  if (!directText && !voice) return;

  const link = await resolveLink(message);
  if (!link) return;

  // Chat is cheap, generation is not — so the message budget is checked first
  // and the generation budget only when we are actually about to generate.
  if (!(await consumeMessageBudget(link.id))) {
    await telegram.sendMessage(chatId, t.rateLimited);
    return;
  }

  let incoming = directText;

  if (!incoming && voice) {
    await telegram.sendMessage(chatId, t.listening);
    await telegram.sendChatAction(chatId, "typing");

    const transcribed = await transcribeVoiceNote(voice.file_id, link.workspaceId);

    if (transcribed === null) {
      await telegram.sendMessage(chatId, t.transcriptionFailed);
      return;
    }
    // Deepgram succeeded but heard nothing. The usual causes are silence or a
    // language the configured model doesn't cover — say so instead of leaving
    // the prospect waiting for a proposal that will never arrive.
    if (!transcribed.trim()) {
      await telegram.sendMessage(chatId, t.emptyAudio);
      return;
    }

    incoming = transcribed.trim();
  }

  // ─── Conversational triage ──────────────────────────────────────────────────
  const history = parseConversation(link.conversation);
  await telegram.sendChatAction(chatId, "typing");

  const triage = await triageMessage(
    incoming,
    history,
    link.workspaceId,
    message.from?.language_code,
  );

  // Triage failing must not leave the prospect on read. Falling back to the old
  // length heuristic keeps the bot useful when the model is unavailable.
  const shouldGenerate = triage ? triage.readyToGenerate : incoming.length >= FALLBACK_BRIEF_LENGTH;
  const brief = triage?.brief?.trim() || incoming;

  if (triage && !shouldGenerate) {
    await telegram.sendMessage(chatId, triage.reply);
    await saveConversation(
      link.id,
      appendTurn(appendTurn(history, "user", incoming), "bot", triage.reply),
    );
    return;
  }

  if (!triage && !shouldGenerate) {
    await telegram.sendMessage(chatId, t.tooShort);
    return;
  }

  // Generation is the expensive path, so it has its own budget.
  if (!(await consumeRateLimit(link.id))) {
    await telegram.sendMessage(chatId, t.rateLimited);
    return;
  }

  await saveConversation(
    link.id,
    appendTurn(appendTurn(history, "user", incoming), "bot", triage?.reply ?? ""),
  );

  // What the prospect actually asked for. Without triage we produce everything,
  // which is the old behaviour and the safe default.
  const wanted = new Set(triage?.deliverables ?? ["DOC", "MOCKUPS", "SLIDES"]);

  await telegram.sendMessage(chatId, triage?.reply || t.preparing);
  await telegram.sendChatAction(chatId, "typing");

  try {
    // Persist the brief as a transcript so the lead is traceable from the app
    // and can be picked up later by the normal task/ticket pipeline.
    const transcript = await prisma.transcript.create({
      data: {
        userId: link.userId,
        workspaceId: link.workspaceId,
        title: `Telegram — ${link.telegramHandle ?? chatId}`,
        source: TranscriptSource.TELEGRAM,
        transcript: brief,
        contextIds: [],
        metadata: {
          processingStatus: "DONE",
          telegramChatId: chatId,
          telegramHandle: link.telegramHandle,
        } as Prisma.JsonObject,
      },
    });

    // One theme lookup for the whole proposal — doc, diagram and deck.
    const branding = await resolveWorkspaceBranding(link.workspaceId);

    const doc = await docGenerationService.startGeneration(link.userId, link.workspaceId, {
      title: "Propuesta de producto",
      prompt:
        "Eres un consultor técnico preparando una propuesta comercial breve para un cliente " +
        "potencial a partir de su descripción. Escribe en el mismo idioma que el cliente. " +
        "Incluye: resumen del problema, alcance propuesto por módulos, un diagrama de " +
        "arquitectura en un bloque ```mermaid, fases con estimación aproximada, y qué haría " +
        "falta decidir antes de empezar. Sé concreto y honesto con las estimaciones; no " +
        "prometas plazos imposibles.",
      transcriptIds: [transcript.id],
      // Themes the doc's public web view. Was null before, so the online
      // proposal rendered unbranded.
      themeId: branding.themeId ?? undefined,
    });

    // Mockups run CONCURRENTLY with doc generation and are delivered FIRST.
    // Two reasons, both learned the hard way in review: the visual is the piece
    // that actually lands with a client, so making it arrive fourth at t+90s
    // wastes it; and if `awaitGeneratedDoc` below returns null we would have
    // thrown away mockups that were ready at t+8s.
    const mockups = wanted.has("MOCKUPS")
      ? await deliverDesigns(chatId, brief, link.workspaceId, link.userId, transcript.id, t, lang)
      : false;

    // Publish the doc so it can be opened from the phone as a web page.
    //
    // Set here rather than via `CreateDocInput.isPublic`: that field is declared
    // on the input type but `startGeneration` never writes it, so passing it
    // would be silently ignored. Doing it explicitly also keeps publishing a
    // Telegram-only behaviour — docs created in the app stay private.
    await prisma.docDocument
      .update({ where: { id: doc.id }, data: { isPublic: true } })
      .catch((err) => logger.warn(`[telegram] could not publish doc ${doc.id}`, err));

    const generated = await awaitGeneratedDoc(doc.id);
    if (!generated) {
      // The prospect still has something in hand if the mockups landed.
      await telegram.sendMessage(chatId, mockups ? t.partial : t.failed);
      return;
    }

    // Diagram first: it's the piece that lands visually, and it should arrive
    // even if the .docx conversion below fails.
    const [diagram] = extractMermaidBlocks(generated.content);
    let diagramPng: Buffer | null = null;
    // Rendered whenever a diagram exists: even when the prospect only wants
    // slides, the deck's architecture slide needs the image.
    if (diagram && (wanted.has("DOC") || wanted.has("SLIDES"))) {
      diagramPng = await renderMermaidToPng(diagram, branding.mermaid);
      // Shown in the chat only alongside the document — with slides alone the
      // diagram belongs inside the deck, not loose in the conversation.
      if (diagramPng && wanted.has("DOC")) {
        await telegram.sendChatAction(chatId, "upload_photo");
        await telegram.sendPhoto(chatId, diagramPng, "arquitectura.png", "Arquitectura propuesta");
      }
    }

    if (wanted.has("DOC")) {
      await telegram.sendChatAction(chatId, "upload_document");
      const docx = await DocumentGenerator.generateDocx(stripMermaidBlocks(generated.content));
      await telegram.sendDocument(
        chatId,
        docx,
        `${safeFilename(generated.title)}.docx`,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        t.docCaption,
      );
    }

    // The link is the version that actually works on a phone: it renders the
    // Mermaid diagram inline and needs no Word or PowerPoint. The attachments
    // above are what the prospect forwards to a colleague.
    await telegram.sendMessageWithLink(chatId, t.viewOnline, [
      { label: t.viewProposalLabel, url: `${APP_URL}/doc/public/${doc.id}` },
    ]);

    // Deck last: it's the least essential of the three, so a failure here must
    // not cost the prospect the document and diagram they already received.
    // Skipping it must NOT skip the lead alert and Linear sync below, so this is
    // a conditional block rather than an early return.
    if (wanted.has("SLIDES")) {
      try {
        const body = stripMermaidBlocks(generated.content);
        await telegram.sendChatAction(chatId, "upload_document");
        const deck = await buildSalesDeck({
          title: generated.title,
          summary: extractSummary(body),
          scope: extractBullets(body),
          diagramPng,
          labels: {
            subtitle: t.deckSubtitle,
            challenge: t.deckChallenge,
            scope: t.deckScope,
            architecture: t.deckArchitecture,
          },
          theme: branding.deck,
        });
        await telegram.sendDocument(
          chatId,
          deck,
          `${safeFilename(generated.title)}.pptx`,
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        );
      } catch (deckErr) {
        logger.warn(`[telegram] deck build failed for chat ${chatId}`, deckErr);
      }
    }

    // Tell a human. Fire-and-forget by design: the prospect already has their
    // proposal, so a mail outage must not turn a successful delivery into a
    // failure message.
    void sendTelegramLeadEmail({
      handle: link.telegramHandle ?? chatId,
      chatId,
      brief,
      transcriptId: transcript.id,
      viaVoice: !directText,
    });

    // Ticket extraction is OPT-IN. Every curious stranger who pokes the bot
    // would otherwise land as tickets on the team's board, and a board full of
    // tyre-kickers stops being read. Enable once the bot is qualifying leads
    // rather than just answering them.
    if (SYNC_TO_LINEAR) {
      await transcriptGenerationQueue.add("generate-transcript", {
        transcriptId: transcript.id,
        workspaceId: link.workspaceId,
        userId: link.userId,
        content: brief,
        source: TranscriptSource.TELEGRAM,
        persona: "PRODUCT_MANAGER",
        syncToLinear: true,
        // The doc already exists — regenerating it here would bill a second
        // time and produce a second, slightly different proposal.
        createDoc: false,
        createSlides: false,
      });
    }

    // Record what was actually delivered so the NEXT message has context. The
    // history was saved before generation with only the "preparing…" reply, so
    // without this a prospect replying "el oscuro" to the design choice reaches
    // triage with no idea a choice was ever offered.
    // Neutral, language-agnostic markers — this is context for the triage model,
    // not shown to the prospect. Kept terse so it doesn't bias the reply language.
    const deliveredSummary = [
      mockups ? "[sent two designs: Light and Dark; asked which they prefer]" : "",
      wanted.has("DOC") ? "[sent the proposal document with its diagram]" : "",
      wanted.has("SLIDES") ? "[sent the slides]" : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (deliveredSummary) {
      // Re-read: the in-memory `link` predates the save made before generation.
      const fresh = await prisma.telegramLink.findUnique({
        where: { id: link.id },
        select: { conversation: true },
      });
      const history = parseConversation(fresh?.conversation);
      await saveConversation(link.id, appendTurn(history, "bot", deliveredSummary));
    }

    logger.info(`[telegram] delivered proposal for chat ${chatId} (doc ${doc.id})`);
  } catch (err) {
    logger.error(`[telegram] intake failed for chat ${chatId}`, err);
    await telegram
      .sendMessage(chatId, t.failed)
      .catch((sendErr) => logger.error("[telegram] could not report failure", sendErr));
  }
};
