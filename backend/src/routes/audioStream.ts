/* eslint-disable @typescript-eslint/no-explicit-any */
import { WebSocketServer, WebSocket as WSWebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import { firebaseAdmin } from "../firebase/firebaseAdmin";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";
import EnvUtils from "../utils/EnvUtils";
import { OpenAIRealtimeWebSocket } from "openai/realtime/websocket";
import OpenAI from "openai";

(global as any).WebSocket = WSWebSocket;

export function setupAudioStream(server: Server) {
  // Mount a dedicated WebSocket server on a specific path
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;

    if (pathname === "/api/audio/stream") {
      console.log("Upgrade request for /api/audio/stream");
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", async (ws: WSWebSocket, req: IncomingMessage) => {
    let openAiWsMic: OpenAIRealtimeWebSocket | null = null;
    let openAiWsSys: OpenAIRealtimeWebSocket | null = null;
    let isAuthenticated = false;

    logger.info("New WebSocket connection attempt on /api/audio/stream");

    // 1. Authenticate the connection via the sec-websocket-protocol or query param
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");

    if (!token) {
      ws.send(
        JSON.stringify({ type: "error", message: "Unauthorized: Missing token in query params" }),
      );
      ws.close(1008, "Policy Violation"); // 1008: Policy Violation
      console.log("Unauthorized: Missing token in query params");
      return;
    }

    try {
      const decodedToken = await firebaseAdmin.auth().verifyIdToken(token);
      const userEmail = decodedToken.email ?? "";

      const dbUser = await prisma.user.findUnique({
        where: { email: userEmail },
      });

      if (!dbUser) {
        throw new Error("User not found in DB");
      }

      isAuthenticated = true;
      logger.info(`WebSocket User Authenticated: ${userEmail}`);
    } catch (error) {
      logger.error("WebSocket Auth Failed:", error);
      ws.send(JSON.stringify({ type: "error", message: "Unauthorized: Invalid token" }));
      ws.close(1008);
      return;
    }

    // 2. Initialize OpenAI Realtime Connection via Official SDK
    const openAiApiKey = EnvUtils.get("OPENAI_API_KEY");
    if (!openAiApiKey) {
      logger.error("OPENAI_API_KEY is missing");
      ws.send(JSON.stringify({ type: "error", message: "OpenAI API Key missing on server" }));
      ws.close(1011);
      return;
    }

    const openai = new OpenAI({ apiKey: openAiApiKey });

    const connectOpenAi = async (source: "mic" | "sys") => {
      try {
        const aiWs = await OpenAIRealtimeWebSocket.create(openai, {
          model: "gpt-4o-realtime-preview",
        });

        const onOpen = () => {
          logger.info(`OpenAI Realtime [${source}] connection opened`);
          ws.send(JSON.stringify({ type: "ready", source }));

          aiWs.send({
            type: "session.update",
            session: {
              type: "realtime",
              output_modalities: ["text"],
              audio: {
                input: {
                  transcription: { model: "whisper-1" },
                },
              },
            } as any,
          } as any);
        };

        if (aiWs.socket.readyState === 1) onOpen();
        else aiWs.socket.addEventListener("open", onOpen);

        aiWs.on("conversation.item.input_audio_transcription.delta", (event: any) => {
          ws.send(
            JSON.stringify({
              type: "transcript",
              source,
              isFinal: false,
              text: event.delta,
            }),
          );
        });

        aiWs.on("conversation.item.input_audio_transcription.completed", (event: any) => {
          ws.send(
            JSON.stringify({
              type: "transcript",
              source,
              isFinal: true,
              text: event.transcript,
            }),
          );
        });

        aiWs.on("error", (event: any) => {
          logger.error(`OpenAI Realtime Error [${source}]:`, event.error || event);
        });

        aiWs.socket.addEventListener("close", () => {
          logger.info(`OpenAI connection [${source}] closed`);
        });

        return aiWs;
      } catch (error) {
        logger.error(`Failed to connect to OpenAI Realtime [${source}]:`, error);
        return null;
      }
    };

    openAiWsMic = await connectOpenAi("mic");
    openAiWsSys = await connectOpenAi("sys");

    if (!openAiWsMic) {
      ws.send(
        JSON.stringify({ type: "error", message: "Failed to connect to OpenAI Realtime (Mic)" }),
      );
      ws.close(1011);
      return;
    }

    // Send synthetic keep-alives since OpenAI drops idle sockets
    const keepAliveInterval: NodeJS.Timeout = setInterval(() => {
      console.log("Sending keep-alive to OpenAI [Dual]");
      if (openAiWsMic && openAiWsMic.socket.readyState === 1) {
        openAiWsMic.send({ type: "input_audio_buffer.append", audio: "AAA=" } as any);
      }
      if (openAiWsSys && openAiWsSys.socket.readyState === 1) {
        openAiWsSys.send({ type: "input_audio_buffer.append", audio: "AAA=" } as any);
      }
    }, 10 * 1000);

    // 3. Handle messages from Electron
    ws.on("message", (message: Buffer | string) => {
      if (!isAuthenticated) return;

      // Electron will send base64 chunked JSON payload due to PCM requirement
      try {
        const data = JSON.parse(message.toString());

        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }

        if (data.type === "end_stream") {
          logger.info("Electron cleanly terminated audio stream");
          openAiWsMic?.socket?.close();
          openAiWsSys?.socket?.close();
          return;
        }

        if (data.type === "input_audio") {
          const targetWs = data.source === "sys" ? openAiWsSys : openAiWsMic;
          if (targetWs && targetWs.socket.readyState === 1) {
            // OPEN
            targetWs.send({
              type: "input_audio_buffer.append",
              audio: data.audio, // Must be raw base64 encoded pcm16
            } as any);
          }
        }
      } catch (err) {
        logger.error("Failed to parse incoming WS message:", err);
      }
    });

    ws.on("close", () => {
      logger.info("Electron WebSocket disconnected");
      clearInterval(keepAliveInterval);
      openAiWsMic?.close();
      openAiWsSys?.close();
    });
  });
}
