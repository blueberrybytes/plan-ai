import { Controller, Get, Route, Security, Tags } from "tsoa";
import { AI_MODEL_LIMITS } from "../services/aiContextRouter";

export interface AiModelResponse {
  key: string;
  name: string;
  maxTokens: number;
  description: string;
  tags: string[];
}

@Route("api/ai")
@Tags("AI")
@Security("ClientLevel")
export class AiController extends Controller {
  /**
   * Retrieves the list of supported AI models and their context limits.
   */
  @Get("models")
  public async getModels(): Promise<AiModelResponse[]> {
    return Object.entries(AI_MODEL_LIMITS).map(([key, limit]) => ({
      key,
      name: limit.modelName,
      maxTokens: limit.maxTokens,
      description: limit.description,
      tags: limit.tags,
    }));
  }
}
