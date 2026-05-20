/* eslint-disable @typescript-eslint/no-unused-vars */
import { WebSocketServer, WebSocket as WSWebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import { firebaseAdmin } from "../firebase/firebaseAdmin";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";
import EnvUtils from "../utils/EnvUtils";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import type { ListenLiveClient } from "@deepgram/sdk";
import { aiUsageService } from "../services/aiUsageService";

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

    ws.on("close", () => {
      isClientEnding = true;
      logger.info("Electron WebSocket disconnected");
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
      const contextIdsParam = url.searchParams.get("contextIds");
      console.log("[DEBUG WS] parsed URL parameters", Boolean(token), language, contextIdsParam);

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
          keyterms = Array.from(allKeywords);
          console.log(`[DEBUG WS] Loaded ${keyterms.length} keyterms from contexts.`);
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
            channel?: { alternatives?: Array<{ transcript?: string }> };
          }) => {
            if (data.type === "Results" && data.channel?.alternatives?.[0]) {
              const transcript = data.channel.alternatives[0].transcript;
              if (transcript) {
                ws.send(
                  JSON.stringify({
                    type: "transcript",
                    source,
                    isFinal: data.is_final,
                    text: transcript,
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
