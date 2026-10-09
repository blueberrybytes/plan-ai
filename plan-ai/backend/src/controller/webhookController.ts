import { countFeature } from "../services/featureUsageService";
import { Body, Delete, Get, Patch, Path, Post, Request, Route, Security, Tags } from "tsoa";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import type { TsoaJsonObject } from "./controllerTypes";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  listWebhookDeliveries,
  listWebhookEndpoints,
  redeliverWebhook,
  rotateWebhookSecret,
  sendWebhookTestEvent,
  updateWebhookEndpoint,
  type WebhookActor,
  type WebhookEndpointView,
} from "../services/webhookService";

/** A webhook endpoint. The signing secret is never part of it. */
export interface WebhookEndpointResponse {
  id: string;
  url: string;
  /** Event names this endpoint receives. Empty means all of them. */
  events: string[];
  description: string | null;
  enabled: boolean;
  /** Failed deliveries in a row. The endpoint is turned off at 20. */
  failureCount: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Returned once, on creation and on rotation. The secret cannot be read again. */
export interface WebhookEndpointSecretResponse {
  endpoint: WebhookEndpointResponse;
  secret: string;
}

export interface WebhookEndpointListResponse {
  endpoints: WebhookEndpointResponse[];
}

export interface CreateWebhookEndpointRequest {
  url: string;
  events?: string[];
  description?: string | null;
}

export interface UpdateWebhookEndpointRequest {
  url?: string;
  events?: string[];
  description?: string | null;
  enabled?: boolean;
}

export interface WebhookDeliveryResponse {
  id: string;
  event: string;
  /** PENDING, SUCCESS or FAILED. */
  status: string;
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  createdAt: string;
  deliveredAt: string | null;
  /** What was sent. Null when its project became restricted afterwards. */
  payload: TsoaJsonObject;
}

export interface WebhookDeliveryListResponse {
  deliveries: WebhookDeliveryResponse[];
}

export interface WebhookQueuedResponse {
  deliveryId: string;
}

const toResponse = (endpoint: WebhookEndpointView): WebhookEndpointResponse => ({
  id: endpoint.id,
  url: endpoint.url,
  events: endpoint.events,
  description: endpoint.description,
  enabled: endpoint.enabled,
  failureCount: endpoint.failureCount,
  lastSuccessAt: endpoint.lastSuccessAt?.toISOString() ?? null,
  lastFailureAt: endpoint.lastFailureAt?.toISOString() ?? null,
  createdAt: endpoint.createdAt.toISOString(),
  updatedAt: endpoint.updatedAt.toISOString(),
});

@Route("api/webhooks")
@Tags("Webhooks")
@Security("BearerAuth")
export class WebhookController extends BaseWorkspaceController {
  /** The service decides who may manage webhooks. This sets the HTTP status it asks for. */
  private async run<T>(
    request: AuthenticatedRequest,
    work: (workspaceId: string, actor: WebhookActor) => Promise<T>,
  ): Promise<T> {
    const { user, workspaceId, role } = await this.getAuthorizedWorkspaceAccess(request);
    try {
      return await work(workspaceId, { userId: user.id, email: user.email, role });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status) this.setStatus(status);
      throw err;
    }
  }

  /** Lists the workspace's webhook endpoints. Never returns a secret. */
  @Get()
  public async listEndpoints(
    @Request() request: AuthenticatedRequest,
  ): Promise<WebhookEndpointListResponse> {
    return this.run(request, async (workspaceId, actor) => ({
      endpoints: (await listWebhookEndpoints(workspaceId, actor)).map(toResponse),
    }));
  }

  /** Creates an endpoint. The secret is in this answer and cannot be read again. */
  @Post()
  public async createEndpoint(
    @Request() request: AuthenticatedRequest,
    @Body() body: CreateWebhookEndpointRequest,
  ): Promise<WebhookEndpointSecretResponse> {
    return this.run(request, async (workspaceId, actor) => {
      const { endpoint, secret } = await createWebhookEndpoint(workspaceId, actor, body);
      countFeature("webhook.created");
      return { endpoint: toResponse(endpoint), secret };
    });
  }

  /** Changes the URL, the events, the description or turns the endpoint on or off. */
  @Patch("{endpointId}")
  public async updateEndpoint(
    @Request() request: AuthenticatedRequest,
    @Path() endpointId: string,
    @Body() body: UpdateWebhookEndpointRequest,
  ): Promise<WebhookEndpointResponse> {
    return this.run(request, async (workspaceId, actor) =>
      toResponse(await updateWebhookEndpoint(workspaceId, actor, endpointId, body)),
    );
  }

  /** Replaces the secret. The new one is in this answer and cannot be read again. */
  @Post("{endpointId}/rotate-secret")
  public async rotateSecret(
    @Request() request: AuthenticatedRequest,
    @Path() endpointId: string,
  ): Promise<WebhookEndpointSecretResponse> {
    return this.run(request, async (workspaceId, actor) => {
      const { endpoint, secret } = await rotateWebhookSecret(workspaceId, actor, endpointId);
      return { endpoint: toResponse(endpoint), secret };
    });
  }

  @Delete("{endpointId}")
  public async deleteEndpoint(
    @Request() request: AuthenticatedRequest,
    @Path() endpointId: string,
  ): Promise<void> {
    await this.run(request, (workspaceId, actor) =>
      deleteWebhookEndpoint(workspaceId, actor, endpointId),
    );
    this.setStatus(204);
  }

  /** The last 50 deliveries of an endpoint, newest first. */
  @Get("{endpointId}/deliveries")
  public async listDeliveries(
    @Request() request: AuthenticatedRequest,
    @Path() endpointId: string,
  ): Promise<WebhookDeliveryListResponse> {
    return this.run(request, async (workspaceId, actor) => ({
      deliveries: (await listWebhookDeliveries(workspaceId, actor, endpointId)).map((d) => ({
        id: d.id,
        event: d.event,
        status: d.status,
        attempts: d.attempts,
        responseStatus: d.responseStatus,
        error: d.error,
        createdAt: d.createdAt.toISOString(),
        deliveredAt: d.deliveredAt?.toISOString() ?? null,
        payload: d.payload as TsoaJsonObject,
      })),
    }));
  }

  /** Sends a `ping` event to the endpoint, through the same queue and signing. */
  @Post("{endpointId}/test")
  public async sendTestEvent(
    @Request() request: AuthenticatedRequest,
    @Path() endpointId: string,
  ): Promise<WebhookQueuedResponse> {
    return this.run(request, (workspaceId, actor) =>
      sendWebhookTestEvent(workspaceId, actor, endpointId),
    );
  }

  /** Sends one past delivery again, with the same id and payload. */
  @Post("deliveries/{deliveryId}/redeliver")
  public async redeliver(
    @Request() request: AuthenticatedRequest,
    @Path() deliveryId: string,
  ): Promise<WebhookQueuedResponse> {
    return this.run(request, (workspaceId, actor) =>
      redeliverWebhook(workspaceId, actor, deliveryId),
    );
  }
}
