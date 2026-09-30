import { Body, Controller, Get, Patch, Post, Request, Route, Security, Tags } from "tsoa";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import prisma from "../prisma/prismaClient";
import {
  PERSONAL_CONSENT_VERSION,
  enablePersonalMode,
  getPersonalStatus,
  updatePersonalSettings,
  withdrawPersonalConsent,
  type PersonalError,
  type PersonalStatus,
  type PersonalUser,
} from "../services/personalService";

export interface PersonalStatusResponse {
  /** Personal mode is turned on for this account (PERSONAL_MODE_EMAILS). */
  available: boolean;
  /** Consent given and the personal workspace exists. */
  enabled: boolean;
  workspaceId: string | null;
  consentAt: string | null;
  consentVersion: string | null;
  /** Version of the consent text the apps must show and send back. */
  currentConsentVersion: string;
  /** The accepted text is older than the current one. */
  consentOutdated: boolean;
  hideCalories: boolean;
  autoExtract: boolean;
}

export interface EnablePersonalRequest {
  /** Must be true: the user ticked the consent box. */
  consent: boolean;
  /** The version of the text the user read. */
  consentVersion: string;
}

export interface PersonalSettingsRequest {
  hideCalories?: boolean;
  autoExtract?: boolean;
}

const toResponse = (s: PersonalStatus): PersonalStatusResponse => ({
  available: s.available,
  enabled: s.enabled,
  workspaceId: s.workspaceId,
  consentAt: s.consentAt ? s.consentAt.toISOString() : null,
  consentVersion: s.consentVersion,
  currentConsentVersion: PERSONAL_CONSENT_VERSION,
  consentOutdated: s.consentOutdated,
  hideCalories: s.hideCalories,
  autoExtract: s.autoExtract,
});

/**
 * Personal mode of the signed-in user. Not tied to a workspace, so no
 * x-workspace-id is needed.
 */
@Route("api/personal")
@Tags("Personal")
@Security("ClientLevel")
export class PersonalController extends Controller {
  private async user(request: AuthenticatedRequest): Promise<PersonalUser> {
    if (!request.user) {
      this.setStatus(401);
      throw { status: 401, message: "Unauthorized" };
    }
    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user.uid },
      select: { id: true, email: true },
    });
    if (!user) {
      this.setStatus(404);
      throw { status: 404, message: "User not found" };
    }
    return user;
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const e = err as PersonalError;
      if (typeof e?.status === "number") this.setStatus(e.status);
      throw err;
    }
  }

  @Get("/")
  public async getPersonalStatus(
    @Request() request: AuthenticatedRequest,
  ): Promise<PersonalStatusResponse> {
    const user = await this.user(request);
    return toResponse(await getPersonalStatus(user));
  }

  /**
   * Gives consent to store health data and creates the personal workspace
   * the first time.
   */
  @Post("/enable")
  public async enablePersonalMode(
    @Request() request: AuthenticatedRequest,
    @Body() body: EnablePersonalRequest,
  ): Promise<PersonalStatusResponse> {
    const user = await this.user(request);
    return this.run(async () => toResponse(await enablePersonalMode(user, body, request)));
  }

  @Patch("/settings")
  public async updatePersonalSettings(
    @Request() request: AuthenticatedRequest,
    @Body() body: PersonalSettingsRequest,
  ): Promise<PersonalStatusResponse> {
    const user = await this.user(request);
    return this.run(async () => toResponse(await updatePersonalSettings(user, body ?? {})));
  }

  /** Withdraws consent and deletes every tracker and entry. Notes stay. */
  @Post("/withdraw-consent")
  public async withdrawPersonalConsent(
    @Request() request: AuthenticatedRequest,
  ): Promise<PersonalStatusResponse> {
    const user = await this.user(request);
    return this.run(async () => toResponse(await withdrawPersonalConsent(user, request)));
  }
}
