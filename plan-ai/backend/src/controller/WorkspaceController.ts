import { BaseWorkspaceController } from "./BaseWorkspaceController";
import { Get, Post, Put, Delete, Body, Route, Security, Request, Tags, Path } from "tsoa";
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
}

export interface UpdateWorkspaceSettingsRequest {
  openRouterKey?: string | null;
  deepgramKey?: string | null;
  /** OpenAI key (BYOK) for embeddings/RAG. Pass null to clear; omit to leave unchanged. */
  openaiKey?: string | null;
  monthlyTokenLimit?: number;
  isCourtesy?: boolean;
  /** Workspace-wide default brand theme. Pass null to clear; omit to leave unchanged. */
  defaultThemeId?: string | null;
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
    const { workspaceId, role: requesterRole } = await this.getAuthorizedWorkspaceAccess(request);

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
    const { workspaceId, role: requesterRole } = await this.getAuthorizedWorkspaceAccess(request);

    if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") {
      this.setStatus(403);
      throw { status: 403, message: "Only workspace owners or admins can remove members." };
    }

    const targetMember = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
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
    const { workspaceId, role: requesterRole } = await this.getAuthorizedWorkspaceAccess(request);

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
    const { workspaceId, role: requesterRole } = await this.getAuthorizedWorkspaceAccess(request);

    if (requesterRole !== "OWNER") {
      this.setStatus(403);
      throw { status: 403, message: "Only workspace owners can update settings." };
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
    if (body.isCourtesy !== undefined) updateData.isCourtesy = body.isCourtesy;
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

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: updateData,
    });

    return { success: true, message: "Workspace settings updated." };
  }
}
