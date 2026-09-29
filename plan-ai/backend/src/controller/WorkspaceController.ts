import { BaseWorkspaceController } from "./BaseWorkspaceController";
import { Get, Post, Put, Delete, Body, Route, Security, Request, Tags, Path, Query } from "tsoa";
import {
  PrismaClient,
  WorkspaceRole,
  WorkspaceTier,
  Role,
  UserPersona,
  Prisma,
} from "@prisma/client";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import { sendWorkspaceInvitationEmail } from "../services/emailService";
import { validateOpenRouterKey, validateDeepgramKey } from "../services/keyValidationService";
import { setUserRole } from "../firebase/firebaseAdmin";
import { encryptWorkspaceKeys } from "../utils/workspaceSecrets";
import { isEncryptedSecret } from "../utils/secretCrypto";
import { listAudit, recordAudit } from "../services/auditLogService";
import { deleteWorkspaceData } from "../services/dataDeletionService";
import { exportWorkspace } from "../services/workspaceExportService";
import type { TsoaJsonObject } from "./controllerTypes";
import { revokeMcpTokensForMember } from "../services/mcpTokenService";
import { checkWorkspacePolicy, type WorkspacePolicy } from "../services/workspaceAccess";

const prisma = new PrismaClient();

export interface WorkspaceResponse {
  id: string;
  name: string;
  tier: WorkspaceTier;
  role: WorkspaceRole;
  stripeId: string | null;
  monthlyTokenLimit?: number;
  openRouterKey?: string;
  deepgramKey?: string;
  /** OpenAI key (BYOK) used only for embeddings/RAG. Returned masked. */
  openaiKey?: string;
  isCourtesy?: boolean;
  /** Workspace-wide default brand theme for AI-generated docs & slides. Null = none. */
  defaultThemeId?: string | null;
  /** Days meeting audio is kept before it is deleted. Null keeps it forever. */
  audioRetentionDays?: number | null;
  /** Sign-in rules. Empty list, false and null mean no rule. */
  allowedEmailDomains?: string[];
  requireMfa?: boolean;
  requiredSignInProvider?: string | null;
}

export interface UpdateWorkspaceSettingsRequest {
  openRouterKey?: string | null;
  deepgramKey?: string | null;
  /** OpenAI key (BYOK) for embeddings/RAG. Pass null to clear; omit to leave unchanged. */
  openaiKey?: string | null;
  monthlyTokenLimit?: number;
  // No isCourtesy here. A courtesy workspace runs on the platform's own AI
  // keys, so only the platform turns it on (in the database), never an owner.
  /** Workspace-wide default brand theme. Pass null to clear; omit to leave unchanged. */
  defaultThemeId?: string | null;
  /**
   * Days to keep meeting audio (1 to 3650). Null keeps it forever; omit to
   * leave unchanged. Transcripts, summaries and tasks are never deleted.
   */
  audioRetentionDays?: number | null;
  /**
   * Only accounts with an email in these domains can use the workspace, e.g.
   * ["acme.com"]. Empty list removes the rule; omit to leave unchanged.
   */
  allowedEmailDomains?: string[];
  /** Members must sign in with a second factor. Omit to leave unchanged. */
  requireMfa?: boolean;
  /**
   * Firebase sign-in provider every member must use: "google.com",
   * "microsoft.com", "apple.com", "password", or an SSO provider id such as
   * "saml.acme" / "oidc.acme". Null removes the rule; omit to leave unchanged.
   */
  requiredSignInProvider?: string | null;
}

export interface AuditLogEntryResponse {
  id: string;
  action: string;
  actorUserId: string | null;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: TsoaJsonObject | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogResponse {
  entries: AuditLogEntryResponse[];
  nextCursor: string | null;
}

export interface InviteMemberRequest {
  email: string;
  role: WorkspaceRole;
  personas?: UserPersona[];
  personaNotes?: string;
}

export interface UpdateMemberRequest {
  role?: WorkspaceRole;
  personas?: UserPersona[];
  personaNotes?: string | null;
}

export interface CreateWorkspaceRequest {
  name: string;
  tier?: WorkspaceTier;
}

export interface WorkspaceMemberResponse {
  id: string; // member id
  userId: string | null;
  name: string | null;
  email: string;
  role: WorkspaceRole;
  personas: UserPersona[];
  personaNotes?: string | null;
  status: "ACTIVE" | "PENDING";
  createdAt: string;
}

export interface WorkspaceTeamResponse {
  members: WorkspaceMemberResponse[];
  maxInvitations: number;
}

@Route("api/workspaces")
@Tags("Workspaces")
export class WorkspaceController extends BaseWorkspaceController {
  /**
   * Obtiene la lista de Workspaces a los que pertenece el usuario autenticado.
   */
  @Get("/")
  @Security("BearerAuth")
  public async getMyWorkspaces(
    @Request() request: AuthenticatedRequest,
  ): Promise<WorkspaceResponse[]> {
    if (!request.user) {
      this.setStatus(401);
      throw { status: 401, message: "Unauthorized" };
    }

    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user.uid },
    });

    if (!user) {
      this.setStatus(404);
      throw { status: 404, message: "User not found" };
    }

    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.id },
      include: {
        workspace: true,
      },
    });

    return memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      tier: m.workspace.tier,
      role: m.role,
      stripeId: m.workspace.stripeId,
      monthlyTokenLimit: m.workspace.monthlyTokenLimit,
      isCourtesy: m.workspace.isCourtesy,
      openRouterKey:
        m.role === "OWNER"
          ? m.workspace.openRouterKey
            ? "••••••••••••••••"
            : undefined
          : undefined,
      deepgramKey:
        m.role === "OWNER" ? (m.workspace.deepgramKey ? "••••••••••••••••" : undefined) : undefined,
      openaiKey:
        m.role === "OWNER" ? (m.workspace.openaiKey ? "••••••••••••••••" : undefined) : undefined,
      defaultThemeId: m.workspace.defaultThemeId,
      audioRetentionDays: m.workspace.audioRetentionDays,
      allowedEmailDomains: m.workspace.allowedEmailDomains,
      requireMfa: m.workspace.requireMfa,
      requiredSignInProvider: m.workspace.requiredSignInProvider,
    }));
  }

  /**
   * Obtiene la lista de miembros e invitaciones pendientes del Workspace activo.
   */
  @Get("/members")
  @Security("ClientLevel")
  public async getWorkspaceMembers(
    @Request() request: AuthenticatedRequest,
  ): Promise<WorkspaceTeamResponse> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const activeMembersRaw = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: true },
    });

    const activeMembers: WorkspaceMemberResponse[] = activeMembersRaw.map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      personas: m.personas,
      personaNotes: m.personaNotes,
      status: "ACTIVE",
      createdAt: m.user.createdAt.toISOString(),
    }));

    const invitationsRaw = await prisma.workspaceInvitation.findMany({
      where: { workspaceId, status: "PENDING" },
    });

    const pendingMembers: WorkspaceMemberResponse[] = invitationsRaw.map((inv) => ({
      id: inv.id,
      userId: null,
      name: null,
      email: inv.email,
      role: inv.role,
      personas: inv.personas,
      personaNotes: inv.personaNotes,
      status: "PENDING",
      createdAt: inv.createdAt.toISOString(),
    }));

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });

    return {
      members: [...activeMembers, ...pendingMembers],
      maxInvitations: workspace?.maxInvitations ?? 0,
    };
  }

  /**
   * Creates a new workspace. TEMPORARY: Only allowed for ADMIN users.
   */
  @Post("/")
  @Security("ClientLevel")
  public async createWorkspace(
    @Request() request: AuthenticatedRequest,
    @Body() body: CreateWorkspaceRequest,
  ): Promise<WorkspaceResponse> {
    if (!request.user) {
      this.setStatus(401);
      throw { status: 401, message: "Unauthorized" };
    }

    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user.uid },
    });

    if (!user) {
      this.setStatus(404);
      throw { status: 404, message: "User not found" };
    }

    if (user.role !== Role.ADMIN) {
      this.setStatus(403);
      throw { status: 403, message: "Only ADMIN users can create new workspaces." };
    }

    if (!body.name || body.name.trim() === "") {
      this.setStatus(400);
      throw { status: 400, message: "Workspace name is required." };
    }

    const newWorkspace = await prisma.workspace.create({
      data: {
        name: body.name.trim(),
        tier: body.tier || "FREE",
      },
    });

    await prisma.workspaceMember.create({
      data: {
        workspaceId: newWorkspace.id,
        userId: user.id,
        role: "OWNER",
      },
    });

    return {
      id: newWorkspace.id,
      name: newWorkspace.name,
      tier: newWorkspace.tier,
      role: "OWNER",
      stripeId: newWorkspace.stripeId,
      isCourtesy: newWorkspace.isCourtesy,
    };
  }

  /**
   * Invites a user (existing or new) to the currently active workspace.
   */
  @Post("/members/invite")
  @Security("ClientLevel")
  public async inviteMember(
    @Request() request: AuthenticatedRequest,
    @Body() body: InviteMemberRequest,
  ): Promise<{ success: boolean; message: string }> {
    const {
      user,
      workspaceId,
      role: requesterRole,
    } = await this.getAuthorizedWorkspaceAccess(request);

    if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") {
      this.setStatus(403);
      throw { status: 403, message: "Only workspace owners or admins can invite members." };
    }

    if (body.role === "OWNER") {
      this.setStatus(403);
      throw { status: 403, message: "You cannot invite a user as an OWNER." };
    }

    // Optional: Prevent Admins from inviting other Admins (only Owners can invite Admins)
    if (body.role === "ADMIN" && requesterRole !== "OWNER") {
      this.setStatus(403);
      throw { status: 403, message: "Only the workspace owner can invite new admins." };
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });

    // Check invitation limits
    const activeMembersCount = await prisma.workspaceMember.count({
      where: { workspaceId },
    });
    const pendingInvitationsCount = await prisma.workspaceInvitation.count({
      where: { workspaceId, status: "PENDING" },
    });

    const totalSeats = workspace?.subscriptionSeats || 1;
    if (workspace && activeMembersCount + pendingInvitationsCount >= totalSeats) {
      this.setStatus(403);
      throw { status: 403, message: "Workspace seat limit reached." };
    }

    const invitedUserEmail = body.email.toLowerCase().trim();
    if (!invitedUserEmail) {
      this.setStatus(400);
      throw { status: 400, message: "Invalid email address." };
    }

    if (
      workspace &&
      checkWorkspacePolicy(
        { ...workspace, requireMfa: false, requiredSignInProvider: null },
        invitedUserEmail,
        undefined,
      )
    ) {
      this.setStatus(400);
      throw {
        status: 400,
        message: `This workspace only allows accounts from ${workspace.allowedEmailDomains.join(", ")}.`,
      };
    }

    const workspaceName = workspace ? workspace.name : "Workspace";
    const invitedUser = await prisma.user.findUnique({ where: { email: invitedUserEmail } });

    if (!invitedUser) {
      const existingInvitation = await prisma.workspaceInvitation.findFirst({
        where: {
          email: invitedUserEmail,
          workspaceId,
          status: "PENDING",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });

      if (existingInvitation) {
        this.setStatus(400);
        throw { status: 400, message: "User has already been invited to this workspace." };
      }

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await prisma.workspaceInvitation.create({
        data: {
          email: invitedUserEmail,
          workspaceId,
          role: body.role,
          personas: body.personas || [],
          personaNotes: body.personaNotes || null,
          inviterId: user.id,
          expiresAt,
        },
      });

      await sendWorkspaceInvitationEmail(invitedUserEmail, user.email, workspaceName);
      await recordAudit({
        workspaceId,
        actor: user,
        action: "member.invited",
        targetType: "email",
        targetId: invitedUserEmail,
        metadata: { role: body.role },
        request,
      });

      return { success: true, message: "Invitation email sent successfully." };
    }

    const existingMembership = await prisma.workspaceMember.findFirst({
      where: { userId: invitedUser.id, workspaceId },
    });

    if (existingMembership) {
      this.setStatus(400);
      throw { status: 400, message: "User is already a member of this workspace." };
    }

    await prisma.workspaceMember.create({
      data: {
        userId: invitedUser.id,
        workspaceId,
        role: body.role,
        personas: body.personas || [],
        personaNotes: body.personaNotes || null,
      },
    });

    if (invitedUser.role === Role.PENDING) {
      await prisma.user.update({
        where: { id: invitedUser.id },
        data: { role: Role.CLIENT },
      });
      await setUserRole(invitedUser.firebaseUid, Role.CLIENT).catch((e) =>
        console.warn("Failed to sync role to Firebase for invited user", e),
      );
    }

    await sendWorkspaceInvitationEmail(invitedUserEmail, user.email, workspaceName);
    await recordAudit({
      workspaceId,
      actor: user,
      action: "member.added",
      targetType: "user",
      targetId: invitedUser.id,
      metadata: { email: invitedUserEmail, role: body.role },
      request,
    });

    return { success: true, message: "User successfully invited and added to workspace." };
  }

  /**
   * Updates an existing workspace member's role and/or personas.
   */
  @Put("/members/{memberId}")
  @Security("ClientLevel")
  public async updateWorkspaceMember(
    @Request() request: AuthenticatedRequest,
    @Path() memberId: string,
    @Body() body: UpdateMemberRequest,
  ): Promise<{ success: boolean; message: string }> {
    const {
      user: requester,
      workspaceId,
      role: requesterRole,
    } = await this.getAuthorizedWorkspaceAccess(request);

    if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") {
      this.setStatus(403);
      throw { status: 403, message: "Only workspace owners or admins can update members." };
    }

    const targetMember = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
      include: { user: true },
    });

    if (!targetMember || targetMember.workspaceId !== workspaceId) {
      this.setStatus(404);
      throw { status: 404, message: "Member not found in this workspace." };
    }

    // Owner protection
    if (targetMember.role === "OWNER" && body.role && body.role !== "OWNER") {
      this.setStatus(400);
      throw { status: 400, message: "The workspace owner's role cannot be changed." };
    }

    // Admin protection
    if (targetMember.role === "ADMIN" && requesterRole !== "OWNER") {
      this.setStatus(403);
      throw { status: 403, message: "Only the workspace owner can update admins." };
    }

    // Prevent promoting someone to Owner via this endpoint (usually handled via transfer)
    if (body.role === "OWNER") {
      this.setStatus(403);
      throw { status: 403, message: "Cannot assign OWNER role via update endpoint." };
    }

    // Same rule as invitations: only the owner makes admins.
    if (body.role === "ADMIN" && targetMember.role !== "ADMIN" && requesterRole !== "OWNER") {
      this.setStatus(403);
      throw { status: 403, message: "Only the workspace owner can make someone an admin." };
    }

    // Construct update payload dynamically
    const updateData: {
      role?: WorkspaceRole;
      personas?: UserPersona[];
      personaNotes?: string | null;
    } = {};
    if (body.role !== undefined) updateData.role = body.role;
    if (body.personas !== undefined) updateData.personas = body.personas;
    if (body.personaNotes !== undefined) updateData.personaNotes = body.personaNotes;

    await prisma.workspaceMember.update({
      where: { id: memberId },
      data: updateData,
    });

    if (updateData.role && updateData.role !== targetMember.role) {
      await recordAudit({
        workspaceId,
        actor: requester,
        action: "member.role_changed",
        targetType: "user",
        targetId: targetMember.userId,
        metadata: { email: targetMember.user.email, from: targetMember.role, to: updateData.role },
        request,
      });
    }

    return { success: true, message: "Workspace member updated successfully." };
  }

  /**
   * Removes an active member from the workspace.
   * OWNER cannot be removed. Requester must be OWNER or ADMIN.
   */
  @Delete("/members/{memberId}")
  @Security("ClientLevel")
  public async removeWorkspaceMember(
    @Request() request: AuthenticatedRequest,
    @Path() memberId: string,
  ): Promise<{ success: boolean; message: string }> {
    const {
      user: requester,
      workspaceId,
      role: requesterRole,
    } = await this.getAuthorizedWorkspaceAccess(request);

    if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") {
      this.setStatus(403);
      throw { status: 403, message: "Only workspace owners or admins can remove members." };
    }

    const targetMember = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
      include: { user: { select: { email: true } } },
    });

    if (!targetMember || targetMember.workspaceId !== workspaceId) {
      this.setStatus(404);
      throw { status: 404, message: "Member not found in this workspace." };
    }

    if (targetMember.role === "OWNER") {
      this.setStatus(400);
      throw { status: 400, message: "The workspace owner cannot be removed." };
    }

    // Prevent admins from removing other admins (only owners can)
    if (targetMember.role === "ADMIN" && requesterRole !== "OWNER") {
      this.setStatus(403);
      throw { status: 403, message: "Only the workspace owner can remove admins." };
    }

    await prisma.workspaceMember.delete({ where: { id: memberId } });
    // Their MCP tokens for this workspace die with the membership.
    const revokedTokens = await revokeMcpTokensForMember(targetMember.userId, workspaceId);
    await recordAudit({
      workspaceId,
      actor: requester,
      action: "member.removed",
      targetType: "user",
      targetId: targetMember.userId,
      metadata: { email: targetMember.user.email, role: targetMember.role, revokedTokens },
      request,
    });

    return { success: true, message: "Member removed from workspace." };
  }

  /**
   * Cancels a pending workspace invitation.
   */
  @Delete("/invitations/{invitationId}")
  @Security("ClientLevel")
  public async cancelInvitation(
    @Request() request: AuthenticatedRequest,
    @Path() invitationId: string,
  ): Promise<{ success: boolean; message: string }> {
    const {
      user: requester,
      workspaceId,
      role: requesterRole,
    } = await this.getAuthorizedWorkspaceAccess(request);

    if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") {
      this.setStatus(403);
      throw { status: 403, message: "Only workspace owners or admins can cancel invitations." };
    }

    const invitation = await prisma.workspaceInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation || invitation.workspaceId !== workspaceId) {
      this.setStatus(404);
      throw { status: 404, message: "Invitation not found in this workspace." };
    }

    await prisma.workspaceInvitation.delete({ where: { id: invitationId } });
    await recordAudit({
      workspaceId,
      actor: requester,
      action: "member.invitation_cancelled",
      targetType: "email",
      targetId: invitation.email,
      request,
    });

    return { success: true, message: "Invitation cancelled." };
  }

  /**
   * Updates workspace settings like API keys and token limits.
   */
  @Put("/settings")
  @Security("ClientLevel")
  public async updateWorkspaceSettings(
    @Request() request: AuthenticatedRequest,
    @Body() body: UpdateWorkspaceSettingsRequest,
  ): Promise<{ success: boolean; message: string }> {
    const {
      user: requester,
      workspaceId,
      role: requesterRole,
    } = await this.getAuthorizedWorkspaceAccess(request);

    if (requesterRole !== "OWNER") {
      this.setStatus(403);
      throw { status: 403, message: "Only workspace owners can update settings." };
    }

    // A value that looks like one of our encrypted secrets would be stored
    // as it is and then fail to decrypt on every read of this workspace.
    if (
      [body.openRouterKey, body.deepgramKey, body.openaiKey].some((k) =>
        isEncryptedSecret(k?.trim()),
      )
    ) {
      this.setStatus(400);
      throw { status: 400, message: "That does not look like an API key." };
    }

    const updateData: Prisma.WorkspaceUpdateInput = {};
    if (body.openRouterKey !== undefined && body.openRouterKey !== "••••••••••••••••") {
      updateData.openRouterKey = body.openRouterKey;
    }
    if (body.deepgramKey !== undefined && body.deepgramKey !== "••••••••••••••••") {
      updateData.deepgramKey = body.deepgramKey;
    }
    if (body.openaiKey !== undefined && body.openaiKey !== "••••••••••••••••") {
      updateData.openaiKey = body.openaiKey;
    }

    // Validate newly-provided BYOK keys against the provider before persisting,
    // so we never store a broken key (which would silently disable recordings /
    // AI). A definitive 401/403 blocks the save with a clear message; a network
    // failure is non-blocking (we don't want a transient outage to stop a save).
    const invalidKeys: string[] = [];
    if (typeof updateData.openRouterKey === "string" && updateData.openRouterKey.trim()) {
      const check = await validateOpenRouterKey(updateData.openRouterKey.trim());
      if (check.checked && !check.valid) invalidKeys.push("OpenRouter");
    }
    if (typeof updateData.deepgramKey === "string" && updateData.deepgramKey.trim()) {
      const check = await validateDeepgramKey(updateData.deepgramKey.trim());
      if (check.checked && !check.valid) invalidKeys.push("Deepgram");
    }
    if (invalidKeys.length > 0) {
      this.setStatus(400);
      throw {
        status: 400,
        message: `Invalid API key${invalidKeys.length > 1 ? "s" : ""}: ${invalidKeys.join(
          ", ",
        )}. Please double-check the key${invalidKeys.length > 1 ? "s" : ""} and try again.`,
      };
    }

    if (body.monthlyTokenLimit !== undefined) updateData.monthlyTokenLimit = body.monthlyTokenLimit;
    if (body.audioRetentionDays !== undefined) {
      const days = body.audioRetentionDays;
      if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) {
        this.setStatus(400);
        throw { status: 400, message: "Audio retention must be between 1 and 3650 days." };
      }
      updateData.audioRetentionDays = days;
    }
    if (body.defaultThemeId !== undefined) {
      // Validate the theme belongs to this workspace (null clears it).
      if (body.defaultThemeId) {
        const theme = await prisma.brandTheme.findFirst({
          where: { id: body.defaultThemeId, workspaceId },
          select: { id: true },
        });
        if (!theme) {
          this.setStatus(400);
          throw { status: 400, message: "Theme not found in this workspace" };
        }
      }
      updateData.defaultTheme = body.defaultThemeId
        ? { connect: { id: body.defaultThemeId } }
        : { disconnect: true };
    }

    const signInRules = await this.validatedSignInRules(workspaceId, body, request);
    Object.assign(updateData, signInRules);

    // Validation above needs the plain keys; only the stored copy is encrypted.
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: encryptWorkspaceKeys(updateData),
    });

    // Which settings changed, never the values of the keys.
    const changed: Record<string, string | number | boolean | string[] | null> = {};
    for (const key of ["openRouterKey", "deepgramKey", "openaiKey"] as const) {
      if (key in updateData) changed[key] = updateData[key] ? "set" : "cleared";
    }
    if (body.monthlyTokenLimit !== undefined) changed.monthlyTokenLimit = body.monthlyTokenLimit;
    if (body.audioRetentionDays !== undefined) changed.audioRetentionDays = body.audioRetentionDays;
    if (body.defaultThemeId !== undefined) changed.defaultThemeId = body.defaultThemeId;
    Object.assign(changed, signInRules);
    await recordAudit({
      workspaceId,
      actor: requester,
      action: "settings.updated",
      targetType: "workspace",
      targetId: workspaceId,
      metadata: changed,
      request,
    });

    return { success: true, message: "Workspace settings updated." };
  }

  /**
   * Who did what in the workspace, newest first. Owners and admins only.
   * Pass `nextCursor` back as `cursor` to read older entries.
   */
  @Get("/audit-log")
  @Security("ClientLevel")
  public async getAuditLog(
    @Request() request: AuthenticatedRequest,
    @Query() limit?: number,
    @Query() cursor?: string,
    @Query() action?: string,
  ): Promise<AuditLogResponse> {
    const { workspaceId, role } = await this.getAuthorizedWorkspaceAccess(request);
    if (role !== "OWNER" && role !== "ADMIN") {
      this.setStatus(403);
      throw { status: 403, message: "Only workspace owners and admins can read the audit log." };
    }
    const page = await listAudit(workspaceId, { limit, cursor, action });
    return {
      entries: page.entries.map((e) => ({
        ...e,
        metadata: (e.metadata ?? null) as TsoaJsonObject | null,
        createdAt: e.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * Everything in the workspace as one JSON file (meetings, tasks, files,
   * documents, chats, audit log). Keys and tokens are not included. Owner only.
   */
  @Get("/export")
  @Security("ClientLevel")
  public async exportWorkspaceData(
    @Request() request: AuthenticatedRequest,
  ): Promise<TsoaJsonObject> {
    const { user, workspaceId, role } = await this.getAuthorizedWorkspaceAccess(request);
    if (role !== "OWNER") {
      this.setStatus(403);
      throw { status: 403, message: "Only the workspace owner can export its data." };
    }
    await recordAudit({ workspaceId, actor: user, action: "workspace.exported", request });
    return (await exportWorkspace(workspaceId)) as TsoaJsonObject;
  }

  /**
   * Makes another member the owner. The current owner becomes an admin.
   */
  @Post("/transfer-ownership")
  @Security("ClientLevel")
  public async transferOwnership(
    @Request() request: AuthenticatedRequest,
    @Body() body: { memberId: string },
  ): Promise<{ success: boolean; message: string }> {
    const { user, workspaceId, role } = await this.getAuthorizedWorkspaceAccess(request);
    if (role !== "OWNER") {
      this.setStatus(403);
      throw { status: 403, message: "Only the workspace owner can transfer ownership." };
    }
    const target = await prisma.workspaceMember.findUnique({
      where: { id: body?.memberId ?? "" },
      include: { user: { select: { email: true } } },
    });
    if (!target || target.workspaceId !== workspaceId || target.userId === user.id) {
      this.setStatus(404);
      throw { status: 404, message: "Member not found in this workspace." };
    }
    await prisma.$transaction([
      prisma.workspaceMember.update({ where: { id: target.id }, data: { role: "OWNER" } }),
      prisma.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId, userId: user.id } },
        data: { role: "ADMIN" },
      }),
    ]);
    await recordAudit({
      workspaceId,
      actor: user,
      action: "workspace.ownership_transferred",
      targetType: "user",
      targetId: target.userId,
      metadata: { email: target.user.email },
      request,
    });
    return { success: true, message: "Ownership transferred." };
  }

  /**
   * Deletes the workspace and all its data: meetings with their audio,
   * files, vectors, documents, chats and members. It cannot be undone. The
   * owner types the workspace name to confirm. A paid subscription must be
   * cancelled first, so billing never outlives the data.
   */
  @Post("/delete")
  @Security("ClientLevel")
  public async deleteWorkspace(
    @Request() request: AuthenticatedRequest,
    @Body() body: { confirmName: string },
  ): Promise<{ success: boolean; message: string }> {
    const { user, workspaceId, role } = await this.getAuthorizedWorkspaceAccess(request);
    if (role !== "OWNER") {
      this.setStatus(403);
      throw { status: 403, message: "Only the workspace owner can delete it." };
    }
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { name: true, subscriptionStatus: true, subscriptionCancelAtPeriodEnd: true },
    });
    // Without any workspace the user could not use the app, and only
    // platform admins can create one.
    const ownWorkspaces = await prisma.workspaceMember.count({ where: { userId: user.id } });
    if (ownWorkspaces <= 1) {
      this.setStatus(409);
      throw {
        status: 409,
        message:
          "This is your only workspace. Delete your account instead, or join another workspace first.",
      };
    }
    if ((body?.confirmName ?? "").trim() !== workspace.name.trim()) {
      this.setStatus(400);
      throw { status: 400, message: "Type the workspace name exactly to confirm." };
    }
    const billing = workspace.subscriptionStatus;
    if (
      (billing === "ACTIVE" || billing === "TRIALING" || billing === "PAST_DUE") &&
      !workspace.subscriptionCancelAtPeriodEnd
    ) {
      this.setStatus(409);
      throw {
        status: 409,
        message: "Cancel the subscription in Billing before deleting the workspace.",
      };
    }
    // Written before the delete: the entry has no foreign key and stays.
    await recordAudit({
      workspaceId,
      actor: user,
      action: "workspace.deleted",
      targetType: "workspace",
      targetId: workspaceId,
      metadata: { name: workspace.name },
      request,
    });
    await deleteWorkspaceData(workspaceId);
    return { success: true, message: "Workspace deleted." };
  }

  /**
   * Checks the sign-in rules in a settings update. The owner saving them must
   * meet them with their current sign-in, or they would lock themselves out.
   */
  private async validatedSignInRules(
    workspaceId: string,
    body: UpdateWorkspaceSettingsRequest,
    request: AuthenticatedRequest,
  ): Promise<Partial<WorkspacePolicy>> {
    const rules: Partial<WorkspacePolicy> = {};
    const bad = (message: string) => {
      this.setStatus(400);
      return { status: 400, message };
    };

    if (body.allowedEmailDomains !== undefined) {
      if (!Array.isArray(body.allowedEmailDomains) || body.allowedEmailDomains.length > 20) {
        throw bad("Give at most 20 email domains.");
      }
      const domains = Array.from(
        new Set(
          body.allowedEmailDomains.map((d) => String(d).trim().toLowerCase().replace(/^@/, "")),
        ),
      ).filter(Boolean);
      if (domains.some((d) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d))) {
        throw bad("Email domains look like acme.com, without @ or spaces.");
      }
      rules.allowedEmailDomains = domains;
    }
    if (body.requireMfa !== undefined) {
      if (typeof body.requireMfa !== "boolean") throw bad("requireMfa must be true or false.");
      rules.requireMfa = body.requireMfa;
    }
    if (body.requiredSignInProvider !== undefined) {
      const provider = body.requiredSignInProvider?.trim() || null;
      if (
        provider &&
        !/^(password|google\.com|microsoft\.com|apple\.com|(saml|oidc)\.[a-z0-9_-]+)$/i.test(
          provider,
        )
      ) {
        throw bad("Unknown sign-in provider.");
      }
      rules.requiredSignInProvider = provider;
    }
    if (Object.keys(rules).length === 0) return rules;

    const current = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { allowedEmailDomains: true, requireMfa: true, requiredSignInProvider: true },
    });
    const lockout = checkWorkspacePolicy(
      { ...current, ...rules },
      request.user?.email,
      request.user,
    );
    if (lockout) {
      throw bad(
        `These rules would lock you out: ${lockout.message} Sign in the required way first, then save them.`,
      );
    }
    return rules;
  }
}
