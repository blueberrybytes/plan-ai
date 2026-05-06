import { Route, Tags, Response, Get, Controller } from "tsoa";
import { ApiResponse, GenericResponse } from "./controllerTypes";

export interface VersionInfo {
  version: string;
  url: string;
}

@Route("api/version")
@Tags("Version")
export class VersionController extends Controller {
  /**
   * Get latest desktop application version for Mac App Store redirect checking.
   */
  @Get("desktop/latest")
  @Response<ApiResponse<VersionInfo>>(200, "Successfully retrieved")
  @Response<GenericResponse>(500, "Internal Server Error")
  public getLatestDesktopVersion(): ApiResponse<VersionInfo> {
    // Currently hardcoded to trigger when ready.
    // This can be adapted to pull from environment variables or DB in the future.
    return {
      status: 200,
      data: {
        version: "1.0.13",
        url: "macappstore://apps.apple.com/app/id6759553699", // Replace with real App ID
      },
    };
  }
}
