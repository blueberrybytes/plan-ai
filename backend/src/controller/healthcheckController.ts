/* eslint-disable @typescript-eslint/no-explicit-any */
import { Route, Tags, Response, Get, Controller } from "tsoa";
import { ApiResponse, GenericResponse } from "./controllerTypes";

@Route("api/healthcheck")
@Tags("Healthcheck")
export class HealthckeckController extends Controller {
  /**
   * Get Status.
   */
  @Get("status")
  @Response<ApiResponse<string>>(200, "Successfully retrieved")
  @Response<GenericResponse>(500, "Internal Server Error")
  protected getStatusPayload(): ApiResponse<string> {
    return {
      status: 200,
      data: "ok",
    };
  }

  public async getHealthStatus(): Promise<ApiResponse<string>> {
    try {
      return this.getStatusPayload();
    } catch (error: any) {
      this.setStatus(500);
      console.error("Error in health check:", error);
      throw {
        status: error.status || 500,
        message: error.message || "Internal Server Error",
      };
    }
  }
}
