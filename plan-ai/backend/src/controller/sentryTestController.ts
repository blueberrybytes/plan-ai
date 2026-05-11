import { Controller, Get, Route } from "tsoa";

@Route("api/sentry-error")
export class SentryTestController extends Controller {
  @Get()
  public async getSentryError(): Promise<void> {
    console.log("Triggering Sentry test error from backend controller...");
    throw new Error("Sentry Backend Test Error (Uncaught Exception from Controller)");
  }
}
