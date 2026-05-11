import { Controller, Get, Route, Tags, Query } from "tsoa";
import axios from "axios";

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

    // Security restriction: only proxy Google Storage and Firebase Storage URLs to prevent SSRF
    if (
      !url.includes("storage.googleapis.com") &&
      !url.includes("firebasestorage.googleapis.com")
    ) {
      this.setStatus(403);
      throw new Error("Proxy access strictly limited to trusted Firebase/GCS bucket domains.");
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
