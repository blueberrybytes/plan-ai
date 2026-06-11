/* eslint-disable @typescript-eslint/no-unused-vars */
import { WebSocketServer, WebSocket as WSWebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import { firebaseAdmin } from "../firebase/firebaseAdmin";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";
import EnvUtils from "../utils/EnvUtils";
import { EchoDeduper, wordsFromDeepgram, wordsFromText } from "../utils/echoDedup";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import type { ListenLiveClient } from "@deepgram/sdk";
import { aiUsageService } from "../services/aiUsageService";
import { checkSubscription } from "../services/subscriptionGuard";
import { checkUsageLimit, UsageLimitExceededError } from "../services/usageLimitGuard";

export function setupAudioStream(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;
    if (pathname === "/api/audio/stream") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", async (ws: WSWebSocket, req: IncomingMessage) => {
    console.log("[DEBUG WS] Start connection handler");
    let currentUserId = "";
    let currentWorkspaceId = "";
    let isClientEnding = false;

    let isMicReady = false;
    let isSysReady = false;
    const micBuffer: ArrayBuffer[] = [];
    const sysBuffer: ArrayBuffer[] = [];
    let dgConnMic: ListenLiveClient | null = null;
    let dgConnSys: ListenLiveClient | null = null;

    const totalAudioSeconds = { mic: 0, sys: 0 };
    const bytesPerSecond = 24000 * 2; // sample_rate * bytes_per_sample (16bit=2)

    // Speaker-bleed killer: when the user listens through speakers, the meeting
    // audio re-enters the mic and gets transcribed as the user's words —
    // duplicating the sys channel. Drop mic segments whose text is contained in
    // sys text that STARTED earlier (direction guard: the user's own voice
    // coming BACK through sys — far-end echo — starts later and never causes
    // their speech to be dropped). Disable with ECHO_DEDUP_DISABLED=true.
    const echoDedupDisabled = process.env.ECHO_DEDUP_DISABLED === "true";
    const echoDeduper = new EchoDeduper();
    // Wall-clock at the first audio packet of each stream — anchors Deepgram's
    // per-stream `start` offsets (seconds) onto one shared clock.
    const streamEpochMs: { mic?: number; sys?: number } = {};

    let dgConfig: Parameters<ReturnType<typeof createClient>["listen"]["live"]>[0];
    let deepgram: ReturnType<typeof createClient>;
    let setupDgListeners: (dgConn: ListenLiveClient, source: "mic" | "sys") => void;

    // We define this higher up so it can be called dynamically
    ws.on("message", (message: Buffer | string) => {
      // Temporarily buffer early packets if deepgram isn't ready
      try {
        const data = JSON.parse(message.toString());

        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }

        if (data.type === "end_stream") {
          isClientEnding = true;
          logger.info("Electron cleanly terminated audio stream");
          try {
            if (dgConnMic && dgConnMic.getReadyState() === 1) dgConnMic.requestClose();
            if (dgConnSys && dgConnSys.getReadyState() === 1) dgConnSys.requestClose();
          } catch (e) {
            console.error("Failed to close Deepgram connections:", e);
          }

          const totalSecs = Math.max(totalAudioSeconds.mic, totalAudioSeconds.sys);
          if (totalSecs > 0 && currentWorkspaceId && currentWorkspaceId !== "placeholder") {
            aiUsageService
              .logUsage({
                userId: currentUserId,
                workspaceId: currentWorkspaceId,
                feature: "RECORDER",
                provider: "DEEPGRAM",
                model: "nova-3-live",
                inputTokens: Math.ceil(totalSecs),
                outputTokens: 0,
              })
              .catch((e) => logger.error("Usage logging error", e));
          }
          return;
        }

        if (data.type === "change_language") {
          if (!dgConfig || !deepgram || !setupDgListeners) {
            logger.warn("Received change_language before Deepgram was initialized");
            return;
          }
          logger.info(`Changing stream language to ${data.language}`);
          const newLanguage = data.language === "multi" || !data.language ? "multi" : data.language;

          // Update the config so auto-reconnects use the new language
          dgConfig.language = newLanguage;

          const oldMic = dgConnMic;
          const oldSys = dgConnSys;

          dgConnMic = deepgram.listen.live(dgConfig);
          dgConnSys = deepgram.listen.live(dgConfig);

          isMicReady = false;
          isSysReady = false;

          if (setupDgListeners) {
            setupDgListeners(dgConnMic, "mic");
            setupDgListeners(dgConnSys, "sys");
          }

          // Carefully detach and close old connections to prevent zombie reconnects
          if (oldMic) {
            oldMic.removeAllListeners();
            if (oldMic.getReadyState() === 1) oldMic.requestClose();
          }
          if (oldSys) {
            oldSys.removeAllListeners();
            if (oldSys.getReadyState() === 1) oldSys.requestClose();
          }

          return;
        }

        if (data.type === "input_audio") {
          const source = data.source as "mic" | "sys";
          const raw = Buffer.from(data.audio, "base64");

          // First audio packet of this stream = its audio-timeline origin.
          if (streamEpochMs[source] === undefined) {
            streamEpochMs[source] = Date.now();
            // Both epochs logged so we can verify mic/sys clock alignment —
            // a large delta here would skew the direction guard.
            logger.info(
              `[EchoDedup] ${source} stream epoch set; mic=${streamEpochMs.mic ?? "-"} sys=${
                streamEpochMs.sys ?? "-"
              } delta=${
                streamEpochMs.mic !== undefined && streamEpochMs.sys !== undefined
                  ? `${streamEpochMs.sys - streamEpochMs.mic}ms (sys-mic)`
                  : "n/a"
              }`,
            );
          }

          totalAudioSeconds[source] += raw.length / bytesPerSecond;

          if (source === "mic") {
            if (isMicReady && dgConnMic && dgConnMic.getReadyState() === 1) {
              dgConnMic.send(raw as unknown as ArrayBufferLike);
            } else {
              micBuffer.push(raw as unknown as ArrayBuffer);
            }
          } else if (source === "sys") {
            if (isSysReady && dgConnSys && dgConnSys.getReadyState() === 1) {
              dgConnSys.send(raw as unknown as ArrayBufferLike);
            } else {
              sysBuffer.push(raw as unknown as ArrayBuffer);
            }
          }
        }
      } catch (err) {
        logger.error("Failed to parse incoming WS message:", err);
      }
    });

    ws.on("close", (code?: number, reason?: Buffer) => {
      isClientEnding = true;
      // Log the close code/reason so we can tell WHY a live session dropped:
      //  1000 = normal (user stopped) · 1001 = server going away (redeploy/restart)
      //  1006 = abnormal close (network/proxy drop, e.g. Railway edge recycling)
      //  1011 = server error · 1008 = policy (auth/subscription/usage from us)
      // A non-1000 code while still recording is what surfaces the recorder's
      // "reconnecting" banner — this tells us if it was infra vs network vs us.
      const reasonText = reason?.toString?.() || "";
      const level = code && code !== 1000 && code !== 1005 ? "warn" : "info";
      logger[level](
        `[audioStream] Client WebSocket closed (code=${code ?? "n/a"}${reasonText ? `, reason="${reasonText}"` : ""})`,
      );
      try {
        if (dgConnMic && dgConnMic.getReadyState() === 1) dgConnMic.requestClose();
        if (dgConnSys && dgConnSys.getReadyState() === 1) dgConnSys.requestClose();
      } catch (e) {
        logger.error("Failed to close Deepgram connections:", e);
      }
    });

    try {
      // 1. Auth check
      const url = new URL(req.url || "", `http://${req.headers.host}`);
      const token = url.searchParams.get("token");
      const language = url.searchParams.get("language") || "multi";
      let contextIdsParam = url.searchParams.get("contextIds");
      const projectIdsParam = url.searchParams.get("projectIds");
      console.log(
        "[DEBUG WS] parsed URL parameters",
        Boolean(token),
        language,
        contextIdsParam,
        projectIdsParam,
      );

      // If only projectIds was provided (post Context-hidden refactor), resolve
      // to the paired contextIds so we can still pull keyword hints.
      if (!contextIdsParam && projectIdsParam) {
        const projectIds = projectIdsParam.split(",").filter(Boolean);
        const ctxRows = await prisma.context.findMany({
          where: { projectId: { in: projectIds } },
          select: { id: true },
        });
        if (ctxRows.length > 0) {
          contextIdsParam = ctxRows.map((c) => c.id).join(",");
        }
      }

      if (!token) {
        ws.send(JSON.stringify({ type: "error", message: "Unauthorized: Missing token" }));
        ws.close(1008);
        return;
      }

      console.log("[DEBUG WS] verifying Firebase token");
      const decodedToken = await firebaseAdmin.auth().verifyIdToken(token);

      console.log("[DEBUG WS] firebase verified, fetching db user");
      const userEmail = decodedToken.email ?? "";
      const dbUser = await prisma.user.findUnique({ where: { email: userEmail } });
      if (!dbUser) throw new Error("User not found in DB");

      currentUserId = dbUser.id;

      const workspaceIdParam = url.searchParams.get("workspaceId");
      if (workspaceIdParam) {
        currentWorkspaceId = workspaceIdParam;
      } else {
        const membership = await prisma.workspaceMember.findFirst({ where: { userId: dbUser.id } });
        currentWorkspaceId = membership?.workspaceId || "placeholder";
      }

      logger.info(`WebSocket User Authenticated: ${userEmail}`);

      let workspaceRecord = null;
      if (currentWorkspaceId && currentWorkspaceId !== "placeholder") {
        workspaceRecord = await prisma.workspace.findUnique({ where: { id: currentWorkspaceId } });

        // Enforce subscription before opening Deepgram (which costs us / the
        // user real money per second of audio). Self-host / OSS instances
        // without STRIPE_SECRET_KEY are auto-bypassed by checkSubscription.
        const sub = await checkSubscription(currentWorkspaceId);
        if (!sub.active) {
          ws.send(
            JSON.stringify({
              type: "error",
              code: "SUBSCRIPTION_REQUIRED",
              reason: sub.reason ?? "no_subscription",
              message:
                "An active subscription is required to start a recording. Open Plan AI → Billing to choose a plan.",
            }),
          );
          ws.close(1008, "SUBSCRIPTION_REQUIRED");
          return;
        }

        // Enforce recording-hour limit for managed plans
        try {
          await checkUsageLimit(currentWorkspaceId, "recording");
        } catch (limitErr) {
          if (limitErr instanceof UsageLimitExceededError) {
            ws.send(
              JSON.stringify({
                type: "error",
                code: "USAGE_LIMIT_EXCEEDED",
                limitType: limitErr.limitType,
                message: limitErr.message,
                used: limitErr.used,
                allowed: limitErr.allowed,
              }),
            );
            ws.close(1008, "USAGE_LIMIT_EXCEEDED");
            return;
          }
          throw limitErr;
        }
      }

      console.log("[DEBUG WS] looking up DEEPGRAM_API_KEY");
      let deepgramApiKey: string | undefined = undefined;
      const isCourtesy = workspaceRecord?.isCourtesy ?? false;

      // Deepgram keys are 32+ char hex strings — basic shape check rejects obvious junk
      if (
        workspaceRecord?.deepgramKey &&
        /^[a-f0-9]{32,}$/i.test(workspaceRecord.deepgramKey.trim())
      ) {
        deepgramApiKey = workspaceRecord.deepgramKey.trim();
      }

      // Fall back to the global key ONLY if the workspace has courtesy access
      if (!deepgramApiKey && isCourtesy) {
        deepgramApiKey = EnvUtils.get("DEEPGRAM_API_KEY");
      }

      if (!deepgramApiKey) {
        ws.send(
          JSON.stringify({
            type: "error",
            code: "MISSING_API_KEY",
            provider: "DEEPGRAM",
            message:
              "MISSING_API_KEY: Configure a Deepgram API key in Workspace Settings to start recording.",
          }),
        );
        ws.close(1011, "MISSING_API_KEY");
        return;
      }

      console.log("[DEBUG WS] creating deepgram client");
      deepgram = createClient(deepgramApiKey);

      // Collect keywords from contexts
      let keyterms: string[] | undefined = undefined;
      if (contextIdsParam) {
        const ids = contextIdsParam.split(",");
        const contexts = await prisma.context.findMany({
          where: { id: { in: ids } },
          select: { keywords: true },
        });

        const allKeywords = new Set<string>();
        contexts.forEach((c) => {
          if (c.keywords && Array.isArray(c.keywords)) {
            c.keywords.forEach((kw) => allKeywords.add(kw));
          }
        });

        if (allKeywords.size > 0) {
          // Deepgram Nova-3 caps keyterms at 100; cap defensively so a
          // huge project with many files doesn't break the WS handshake.
          const DEEPGRAM_KEYTERM_LIMIT = 100;
          keyterms = Array.from(allKeywords).slice(0, DEEPGRAM_KEYTERM_LIMIT);
          console.log(
            `[DEBUG WS] Loaded ${keyterms.length} keyterms from contexts (of ${allKeywords.size} available).`,
          );
        }
      }

      dgConfig = {
        model: "nova-3",
        language: language === "multi" ? "multi" : language,
        smart_format: true,
        interim_results: true,
        diarize: true,
        encoding: "linear16",
        sample_rate: 24000,
        endpointing: 500,
        utterance_end_ms: 1000,
        vad_events: true,
        filler_words: false,
        ...(keyterms && keyterms.length > 0 ? { keyterm: keyterms } : {}),
      };

      console.log(
        "[DEBUG WS] invoking deepgram.listen.live for MIC and SYS with config:",
        JSON.stringify(dgConfig),
      );
      dgConnMic = deepgram.listen.live(dgConfig);
      dgConnSys = deepgram.listen.live(dgConfig);

      setupDgListeners = (dgConn: ListenLiveClient, source: "mic" | "sys") => {
        // Diagnostic interval to track readyState
        const diagInterval = setInterval(() => {
          try {
            const rs = dgConn.getReadyState();
            // console.log(`[Deepgram Diagnostics] ${source} readyState=${rs}`);
            if (rs === 1 || rs === 3) clearInterval(diagInterval);
          } catch (e) {
            console.warn("[Deepgram Diagnostics] Error getting readyState", e);
            clearInterval(diagInterval);
          }
        }, 500);

        // KeepAlive interval to prevent 12-second idle timeout on pure digital silence (sys audio)
        const keepAliveInterval = setInterval(() => {
          if (dgConn && dgConn.getReadyState() === 1) {
            try {
              dgConn.keepAlive();
            } catch (e) {
              console.warn(`[Deepgram] Failed to send keepAlive for ${source}`, e);
            }
          }
        }, 8000);

        dgConn.on(LiveTranscriptionEvents.Open, () => {
          clearInterval(diagInterval);
          //console.log(`[Deepgram] Stream Open: ${source}`);
          if (source === "mic") {
            isMicReady = true;
            micBuffer.forEach((buf) => dgConn.send(buf as unknown as ArrayBufferLike));
            micBuffer.length = 0;
          } else {
            isSysReady = true;
            sysBuffer.forEach((buf) => dgConn.send(buf as unknown as ArrayBufferLike));
            sysBuffer.length = 0;
          }
          ws.send(JSON.stringify({ type: "ready", source }));
        });

        dgConn.on(
          LiveTranscriptionEvents.Transcript,
          (data: {
            type: string;
            is_final?: boolean;
            start?: number;
            channel?: {
              alternatives?: Array<{
                transcript?: string;
                words?: Array<{ word?: string; punctuated_word?: string; start?: number }>;
              }>;
            };
          }) => {
            if (data.type === "Results" && data.channel?.alternatives?.[0]) {
              const alt = data.channel.alternatives[0];
              const transcript = alt.transcript;
              if (transcript) {
                let outText = transcript;
                if (!echoDedupDisabled) {
                  // Per-word wall-clock times: stream epoch + Deepgram's
                  // per-word `start` offsets. Both channels hear the same
                  // physical audio in real time, so bleed words carry ~the
                  // same wall time on both — regardless of when each stream
                  // started capturing or how utterances got segmented.
                  const epoch = streamEpochMs[source];
                  const hasWordTimes = epoch !== undefined && (alt.words?.length ?? 0) > 0;
                  const segStartMs =
                    epoch !== undefined && typeof data.start === "number"
                      ? epoch + data.start * 1000
                      : Date.now();
                  const words = hasWordTimes
                    ? wordsFromDeepgram(alt.words!, epoch!)
                    : wordsFromText(transcript, segStartMs);
                  if (source === "sys") {
                    // Feed the deduper with everything heard on the system
                    // channel (interim + final) so the matching window is warm
                    // even before Deepgram finalizes the sys segment.
                    echoDeduper.noteSystemWords(words);
                    if (data.is_final) {
                      logger.info(
                        `[EchoDedup] sys noted (final): start=+${
                          typeof data.start === "number" ? data.start.toFixed(2) : "?"
                        }s wordTimes=${hasWordTimes} "${transcript.slice(0, 80)}"`,
                      );
                    }
                  } else {
                    // Word-level subtraction: when a segment is predominantly
                    // echo we strip ONLY the bleed words and keep the user's own
                    // words spoken over the other person (double-talk), instead
                    // of dropping the whole segment.
                    const dg = hasWordTimes ? alt.words! : [];
                    const sub = echoDeduper.subtractEcho(
                      dg,
                      epoch ?? segStartMs,
                      transcript,
                      segStartMs,
                    );
                    // Log every FINAL decision (kept / subtracted / dropped)
                    // with full diagnostics — this is what we need to tune it.
                    if (data.is_final) {
                      const action = !sub.keptText
                        ? "DROPPED"
                        : sub.removedWords > 0
                          ? `subtracted(-${sub.removedWords}/${sub.totalWords})`
                          : "kept";
                      logger.info(
                        `[EchoDedup] mic ${action} (final): ` +
                          `start=+${
                            typeof data.start === "number" ? data.start.toFixed(2) : "?"
                          }s wordTimes=${hasWordTimes} reason=${sub.verdict.reason} ` +
                          `coverage=${(sub.verdict.coverage * 100).toFixed(0)}% ` +
                          `matched=${sub.verdict.matchedTokens}/${sub.verdict.micTokenCount} ` +
                          `sysWords=${sub.verdict.sysWordsInWindow} ` +
                          `"${transcript.slice(0, 80)}"` +
                          (sub.removedWords > 0 ? ` → "${sub.keptText.slice(0, 80)}"` : ""),
                      );
                    }
                    if (!sub.keptText) return; // segment was entirely echo
                    outText = sub.keptText;
                  }
                }
                ws.send(
                  JSON.stringify({
                    type: "transcript",
                    source,
                    isFinal: data.is_final,
                    text: outText,
                  }),
                );
              }
            }
          },
        );

        dgConn.on(LiveTranscriptionEvents.SpeechStarted, () => {
          ws.send(JSON.stringify({ type: "speech_started", source }));
        });

        dgConn.on(LiveTranscriptionEvents.UtteranceEnd, () => {
          ws.send(JSON.stringify({ type: "utterance_end", source }));
        });

        dgConn.on(LiveTranscriptionEvents.Error, (err: Error | unknown) => {
          clearInterval(diagInterval);
          clearInterval(keepAliveInterval);
          if (ws.readyState === ws.OPEN) {
            let errMsg = "Unknown Deepgram Error";
            if (err instanceof Error) errMsg = err.message;
            else if (typeof err === "object" && err !== null && "message" in err)
              errMsg = String(err.message);
            else if (typeof err === "string") errMsg = err;
            else errMsg = String(err);

            // Auth errors get a structured code so the recorder can show an actionable CTA
            if (/401|403|unauthor|invalid_auth/i.test(errMsg)) {
              logger.error(
                `[Deepgram] Auth failure on ${source} stream for workspace ${currentWorkspaceId}`,
                err,
              );
              const authMsg =
                "INVALID_API_KEY: Your Deepgram API key was rejected. Verify it in Workspace Settings.";
              ws.send(
                JSON.stringify({
                  type: "error",
                  code: "INVALID_API_KEY",
                  provider: "DEEPGRAM",
                  message: authMsg,
                }),
              );
              return;
            }

            logger.error(
              `[Deepgram] Runtime error on ${source} stream for workspace ${currentWorkspaceId}: ${errMsg}`,
              err,
            );

            // Format for a better user experience
            if (errMsg.includes("Received network error or non-101 status code")) {
              errMsg = "Transcription server is currently unavailable (Network Error).";
            }

            ws.send(JSON.stringify({ type: "error", message: errMsg }));
          }
        });

        dgConn.on(LiveTranscriptionEvents.Close, (event: unknown) => {
          clearInterval(diagInterval);
          clearInterval(keepAliveInterval);
          //console.log(`[Deepgram] Stream Closed: ${source}. Details: ${JSON.stringify(event)}`);

          // Automatically Reconnect if Deepgram dropped the socket but the user is still actively recording!
          if (!isClientEnding && ws.readyState === ws.OPEN) {
            //console.log(`[Deepgram] Reconnecting dropped ${source} stream...`);
            const newConn = deepgram.listen.live(dgConfig);
            if (source === "mic") {
              isMicReady = false;
              dgConnMic = newConn;
            } else {
              isSysReady = false;
              dgConnSys = newConn;
            }
            setupDgListeners(newConn, source);
          }
        });

        dgConn.on(LiveTranscriptionEvents.Unhandled, (msg: unknown) => {
          logger.warn(`[Deepgram] Unhandled event on ${source}:`, msg);
        });
      };

      setupDgListeners(dgConnMic, "mic");
      setupDgListeners(dgConnSys, "sys");
      console.log("[DEBUG WS] deepgram connection complete");
    } catch (criticalError) {
      logger.error("[DEBUG WS] Critical unhandled error in socket initialization:", criticalError);
    }
  });
}
