import {
  Controller,
  Post,
  Get,
  Route,
  Request,
  Tags,
  SuccessResponse,
  Security,
  Body,
  Path,
} from "tsoa";
import * as express from "express";
import {
  githubIntegrationService,
  GithubInstallationNode,
} from "../services/githubIntegrationService";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

@Tags("Integrations")
@Route("api/integrations")
export class GithubIntegrationController extends Controller {
  /**
   * Receives incoming Webhooks from the GitHub App installed on user repositories.
   * Processes the X-Hub-Signature-256 headers directly from the raw byte stream to verify authenticity.
   */
  @SuccessResponse("200", "Webhook received and processed")
  @Post("github/webhook")
  public async handleWebhook(@Request() req: express.Request): Promise<{ status: string }> {
    const rawReq = req as express.Request & { rawBody?: Buffer };

    const signature = req.headers["x-hub-signature-256"] as string;
    const githubEventName = req.headers["x-github-event"] as string;
    const deliveryId = req.headers["x-github-delivery"] as string;

    if (!signature || !githubEventName || !deliveryId) {
      this.setStatus(400);
      throw new Error("Missing critical GitHub headers.");
    }

    // Since bodyParser automatically modifies the stream, server.ts attaches .rawBody buffer
    const rawBodyBuffer = rawReq.rawBody;

    // We must pass the raw text to verifyAndReceive
    const payloadText = rawBodyBuffer ? rawBodyBuffer.toString("utf8") : JSON.stringify(req.body);

    const verified = await githubIntegrationService.verifyAndReceiveWebhook(
      signature,
      deliveryId,
      githubEventName,
      payloadText,
    );

    if (!verified) {
      this.setStatus(401);
      throw new Error("Webhook signature verification failed.");
    }

    // Acknowledge synchronously, handling is done asynchronously in the service
    return { status: "ok" };
  }

  /**
   * Binds a newly installed GitHub App to the current authenticated user.
   */
  @SuccessResponse("200", "Bound successfully")
  @Security("ClientLevel")
  @Post("github/bind")
  public async bindInstallation(
    @Request() request: AuthenticatedRequest,
    @Body() body: { installationId: string },
  ): Promise<{ success: boolean; message?: string }> {
    if (!request.user) {
      this.setStatus(401);
      throw new Error("Unauthorized.");
    }

    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user.uid },
    });

    if (!user) {
      this.setStatus(404);
      throw new Error("User not found.");
    }

    // Attempt to locate old integration to append
    const existingIntegration = await prisma.userIntegration.findUnique({
      where: {
        userId_provider: {
          userId: user.id,
          provider: "GITHUB",
        },
      },
    });

    let newAccountId = body.installationId;
    if (existingIntegration?.accountId) {
      const ids = existingIntegration.accountId.split(",");
      if (!ids.includes(body.installationId)) {
        ids.push(body.installationId);
      }
      newAccountId = ids.join(",");
    }

    // Upsert the integration record
    await prisma.userIntegration.upsert({
      where: {
        userId_provider: {
          userId: user.id,
          provider: "GITHUB",
        },
      },
      update: {
        status: "CONNECTED",
        accountId: newAccountId,
      },
      create: {
        userId: user.id,
        provider: "GITHUB",
        accountId: body.installationId,
        status: "CONNECTED",
        accessToken: "", // Not used directly for Github Apps which have their own key
      },
    });

    return { success: true };
  }

  /**
   * Returns a list of repositories accessible to the authenticated user's installed GitHub app.
   */
  @SuccessResponse("200", "Repositories fetched successfully")
  @Security("ClientLevel")
  @Get("github/repositories")
  public async getConnectedRepositories(
    @Request() request: AuthenticatedRequest,
  ): Promise<{ installations: GithubInstallationNode[] }> {
    if (!request.user) {
      this.setStatus(401);
      throw new Error("Unauthorized.");
    }

    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user.uid },
    });

    if (!user) {
      this.setStatus(404);
      throw new Error("User not found.");
    }

    const integration = await prisma.userIntegration.findUnique({
      where: {
        userId_provider: {
          userId: user.id,
          provider: "GITHUB",
        },
      },
    });

    if (!integration || !integration.accountId || integration.status !== "CONNECTED") {
      return { installations: [] };
    }

    const installations = await githubIntegrationService.getAccessibleRepositories(
      integration.accountId,
    );
    return { installations };
  }

  /**
   * Returns a list of branches for a specific repository.
   */
  @SuccessResponse("200", "Branches fetched successfully")
  @Security("ClientLevel")
  @Get("github/installations/{installationId}/repositories/{owner}/{repo}/branches")
  public async getRepositoryBranches(
    @Request() request: AuthenticatedRequest,
    @Path() installationId: string,
    @Path() owner: string,
    @Path() repo: string,
  ): Promise<{ branches: { name: string }[] }> {
    if (!request.user) {
      this.setStatus(401);
      throw new Error("Unauthorized.");
    }

    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user.uid },
    });

    if (!user) {
      this.setStatus(404);
      throw new Error("User not found.");
    }

    const branches = await githubIntegrationService.getRepositoryBranches(
      Number(installationId),
      owner,
      repo,
    );
    return { branches };
  }
}
