import { Controller, Get, Route, Tags, Path } from "tsoa";
import { findPublicPrototype } from "../services/prototypeGenerationService";

interface PublicPrototypeResponse {
  id: string;
  title: string;
  variant: string;
  /** Sanitized HTML. The viewer MUST render this inside a sandboxed iframe. */
  html: string;
}

/**
 * Serves generated prototypes to prospects, who have no account.
 *
 * Returns the HTML as JSON rather than as a page: the client renders it inside
 * a fully-sandboxed iframe, so the markup never becomes a document on our own
 * origin. Serving it as `text/html` from this domain would give model-authored
 * markup the same origin as the logged-in app.
 */
@Route("api/public/prototypes")
@Tags("Public Prototypes")
export class PublicPrototypeController extends Controller {
  @Get("{id}")
  public async getPublicPrototype(@Path() id: string): Promise<PublicPrototypeResponse> {
    const prototype = await findPublicPrototype(id);

    if (!prototype) {
      this.setStatus(404);
      // Same response whether the row is missing or simply not published — a
      // prober should not be able to enumerate unpublished prototypes.
      throw new Error("Prototype not found");
    }

    return {
      id: prototype.id,
      title: prototype.title,
      variant: prototype.variant,
      html: prototype.html,
    };
  }
}
