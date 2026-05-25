import { Controller, Get, Route, Tags, Query } from "tsoa";
import axios from "axios";
import { logger } from "../utils/logger";

export interface ProxyImageResponse {
  mimeType: string;
  base64: string;
}

@Route("api/proxy")
@Tags("Proxy")
export class ProxyController extends Controller {
  /**
   * Proxies an image from Google Cloud Storage to bypass strict CORS requirements
   * blockages during PPTX/Diagram PDF exports on Railway deployed frontends.
   */
  @Get("image")
  public async proxyGCSImage(@Query() url: string): Promise<ProxyImageResponse> {
    if (!url.startsWith("http")) {
      this.setStatus(400);
      throw new Error("Invalid URL. Must be an HTTP(s) resource.");
    }

    // Basic SSRF protection: deny internal/local IPs and localhost
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      if (
        hostname === "localhost" ||
        hostname.startsWith("127.") ||
        hostname.startsWith("10.") ||
        hostname.startsWith("192.168.") ||
        hostname.endsWith(".local")
      ) {
        this.setStatus(403);
        throw new Error("Proxy access to local or internal networks is forbidden.");
      }
    } catch (e) {
      logger.error(
        "[ProxyController] Invalid URL format",
        e instanceof Error ? e.message : String(e),
      );
      this.setStatus(400);
      throw new Error("Invalid URL format.");
    }

    try {
      const response = await axios.get(url, { responseType: "arraybuffer" });
      const contentType = response.headers["content-type"];
      const mimeType =
        typeof contentType === "string" ? contentType : String(contentType || "image/png");
      const base64 = Buffer.from(response.data, "binary").toString("base64");

      return {
        mimeType,
        base64,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ProxyController] Failed to proxy image", msg);
      this.setStatus(500);
      throw new Error("Failed to dynamically fetch and process image: " + msg);
    }
  }
}
