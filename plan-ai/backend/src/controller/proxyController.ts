import { Controller, Get, Route, Tags, Query } from "tsoa";
import axios from "axios";
import sharp from "sharp";
import { logger } from "../utils/logger";

export interface ProxyImageResponse {
  mimeType: string;
  base64: string;
}

/**
 * Max bytes we'll pull from an upstream URL. Prevents OOM if someone points
 * us at a 4GB tarball masquerading as an image.
 */
const MAX_UPSTREAM_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * Detect SVG payloads. Some hosts mis-serve SVG as `application/octet-stream`
 * or `text/plain`, so we sniff the bytes too — `<svg` (case-insensitive) or
 * an `<?xml` preamble followed by an SVG root works for ~all real SVG files.
 */
const looksLikeSvg = (contentType: string, buf: Buffer): boolean => {
  if (contentType.toLowerCase().includes("svg")) return true;
  const head = buf.slice(0, 256).toString("utf8").trimStart().toLowerCase();
  return head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"));
};

@Route("api/proxy")
@Tags("Proxy")
export class ProxyController extends Controller {
  /**
   * Proxies an image from Google Cloud Storage to bypass strict CORS requirements
   * blockages during PPTX/Diagram PDF exports on Railway deployed frontends.
   */
  @Get("image")
  public async proxyGCSImage(@Query() url: string): Promise<ProxyImageResponse> {
    const cleanUrl = url.trim().replace(/^"|"$/g, "");
    if (!cleanUrl.startsWith("http")) {
      this.setStatus(400);
      throw new Error("Invalid URL. Must be an HTTP(s) resource.");
    }

    // Basic SSRF protection: deny internal/local IPs and localhost
    try {
      const parsedUrl = new URL(cleanUrl);
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
      const response = await axios.get(cleanUrl, {
        responseType: "arraybuffer",
        timeout: 15_000,
        maxContentLength: MAX_UPSTREAM_BYTES,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
        },
      });
      const contentTypeHeader = response.headers["content-type"];
      const upstreamMime =
        typeof contentTypeHeader === "string"
          ? contentTypeHeader
          : String(contentTypeHeader || "image/png");
      const rawBuffer = Buffer.from(response.data, "binary");

      // PPTX (pptxgenjs) + most rasterizers can't render SVG natively. If the
      // upstream sent SVG, rasterize it to a 512px-wide PNG so the export
      // pipeline gets a usable image. We cap at 512px to keep PPTX file size
      // sane (logos are typically ≤200px in the final render).
      if (looksLikeSvg(upstreamMime, rawBuffer)) {
        try {
          const pngBuffer = await sharp(rawBuffer, { density: 192 })
            .resize({ width: 512, withoutEnlargement: true })
            .png()
            .toBuffer();
          return {
            mimeType: "image/png",
            base64: pngBuffer.toString("base64"),
          };
        } catch (svgErr) {
          logger.warn(
            "[ProxyController] SVG rasterization failed, returning raw SVG",
            svgErr instanceof Error ? svgErr.message : String(svgErr),
          );
          // Fall through and return the raw SVG — better than 500ing.
          return {
            mimeType: "image/svg+xml",
            base64: rawBuffer.toString("base64"),
          };
        }
      }

      return {
        mimeType: upstreamMime,
        base64: rawBuffer.toString("base64"),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ProxyController] Failed to proxy image", msg);
      this.setStatus(500);
      throw new Error("Failed to dynamically fetch and process image: " + msg);
    }
  }
}
