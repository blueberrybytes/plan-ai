import { Route, Tags, Security, Post, Request, UploadedFile, Controller } from "tsoa";
import { logger } from "../utils/logger";
import prisma from "../prisma/prismaClient";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import type { ApiResponse } from "./controllerTypes";

@Route("api/audio")
@Tags("Audio")
export class AudioController extends Controller {
  private async getAuthorizedUser(request: AuthenticatedRequest) {
    if (!request.user) {
      this.setStatus(401);
      throw { status: 401, message: "Unauthorized" };
    }

    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user.uid },
    });

    if (!user) {
      this.setStatus(404);
      throw { status: 404, message: "User not found" };
    }

    return user;
  }

  /**
   * Transcribe a raw audio chunk uploaded by the Electron recorder.
   * The Groq API key lives exclusively on the server — it is never sent to the client.
   */
  @Post("transcribe-chunk")
  @Security("ClientLevel")
  public async transcribeChunk(
    @Request() request: AuthenticatedRequest,
    @UploadedFile("mic") micFile?: Express.Multer.File,
    @UploadedFile("system") sysFile?: Express.Multer.File,
  ): Promise<ApiResponse<{ text: string }>> {
    await this.getAuthorizedUser(request);

    if (!micFile && !sysFile) {
      this.setStatus(400);
      throw { status: 400, message: "No audio files uploaded" };
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      this.setStatus(500);
      throw { status: 500, message: "Transcription service is not configured" };
    }

    const transcribeWithGroq = async (file: Express.Multer.File): Promise<string> => {
      const form = new FormData();

      const isM4A =
        file.originalname?.endsWith(".m4a") ||
        file.mimetype === "audio/m4a" ||
        file.mimetype === "audio/mp4";
      const actualMime = isM4A ? "audio/m4a" : file.mimetype || "audio/webm";
      const defaultName = isM4A ? "chunk.m4a" : "chunk.webm";

      const audioBlob = new Blob([new Uint8Array(file.buffer)], {
        type: actualMime,
      });
      form.append("file", audioBlob, file.originalname || defaultName);
      form.append("model", "whisper-large-v3-turbo");
      form.append("response_format", "text");

      const groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqApiKey}` },
        body: form,
      });

      if (!groqResponse.ok) {
        const errBody = await groqResponse.text();
        logger.error("Groq transcription error", { status: groqResponse.status, body: errBody });
        return ""; // Silently fail individual chunks rather than breaking the whole record flow
      }

      return groqResponse.text().then((t) => t.trim());
    };

    // Run parallel transcriptions
    const [micText, sysText] = await Promise.all([
      micFile ? transcribeWithGroq(micFile) : Promise.resolve(""),
      sysFile ? transcribeWithGroq(sysFile) : Promise.resolve(""),
    ]);

    // Format final text
    let finalOutput = "";
    if (micText) finalOutput += `User: ${micText}\n`;
    if (sysText) finalOutput += `Others: ${sysText}\n`;

    return {
      status: 200,
      data: { text: finalOutput.trim() },
    };
  }
}
