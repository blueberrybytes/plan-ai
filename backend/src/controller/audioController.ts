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
    @UploadedFile("audio") audioFile: Express.Multer.File,
  ): Promise<ApiResponse<{ text: string }>> {
    await this.getAuthorizedUser(request);

    if (!audioFile) {
      this.setStatus(400);
      throw { status: 400, message: "No audio file uploaded" };
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      this.setStatus(500);
      throw { status: 500, message: "Transcription service is not configured" };
    }

    // Call Groq Whisper via multipart form (compatible with OpenAI audio API)
    const form = new FormData();
    const audioBlob = new Blob([new Uint8Array(audioFile.buffer)], {
      type: audioFile.mimetype || "audio/webm",
    });
    form.append("file", audioBlob, audioFile.originalname || "chunk.webm");
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
      this.setStatus(502);
      throw { status: 502, message: "Transcription service returned an error" };
    }

    const text = await groqResponse.text();

    return {
      status: 200,
      data: { text: text.trim() },
    };
  }
}
