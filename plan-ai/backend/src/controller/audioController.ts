import { Route, Tags, Security, Post, Request, UploadedFile } from "tsoa";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import { logger } from "../utils/logger";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import type { ApiResponse } from "./controllerTypes";
import { aiUsageService } from "../services/aiUsageService";

@Route("api/audio")
@Tags("Audio")
export class AudioController extends BaseWorkspaceController {
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
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    if (!micFile && !sysFile) {
      this.setStatus(400);
      throw { status: 400, message: "No audio files uploaded" };
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      this.setStatus(500);
      throw { status: 500, message: "Transcription service is not configured" };
    }

    const transcribeWithGroq = async (
      file: Express.Multer.File,
    ): Promise<{ text: string; duration: number }> => {
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
      form.append("response_format", "verbose_json");

      const groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqApiKey}` },
        body: form,
      });

      if (!groqResponse.ok) {
        const errBody = await groqResponse.text();
        logger.error("Groq transcription error", { status: groqResponse.status, body: errBody });
        return { text: "", duration: 0 }; // Silently fail individual chunks rather than breaking the whole record flow
      }

      const json = await groqResponse.json();
      return {
        text: (json.text || "").trim(),
        duration: json.duration ? Math.ceil(json.duration) : 0,
      };
    };

    // Run parallel transcriptions
    const [micResult, sysResult] = await Promise.all([
      micFile ? transcribeWithGroq(micFile) : Promise.resolve({ text: "", duration: 0 }),
      sysFile ? transcribeWithGroq(sysFile) : Promise.resolve({ text: "", duration: 0 }),
    ]);

    const totalDuration = micResult.duration + sysResult.duration;
    if (totalDuration > 0) {
      await aiUsageService.logUsage({
        userId: user.id,
        workspaceId,
        feature: "RECORDER",
        provider: "GROQ",
        model: "whisper-large-v3-turbo",
        inputTokens: totalDuration, // Recording seconds mapped to inputTokens
        outputTokens: 0,
      });
    }

    // Format final text
    let finalOutput = "";
    if (micResult.text) finalOutput += `User: ${micResult.text}\n`;
    if (sysResult.text) finalOutput += `Others: ${sysResult.text}\n`;

    return {
      status: 200,
      data: { text: finalOutput.trim() },
    };
  }
}
