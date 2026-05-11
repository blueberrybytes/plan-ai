import { Route, Tags, Post, Body, Security, Request, Controller } from "tsoa";
import prisma from "../prisma/prismaClient";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import type { ApiResponse } from "./controllerTypes";

export interface CustomThemePayload {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textPrimaryColor?: string;
  textSecondaryColor?: string;
  fontFamily?: string;
  headingFontFamily?: string;
  borderRadius?: number;
  configJson?: Record<string, unknown>;
}

export interface BrandThemePayload {
  name: string;
  headingFont: string;
  bodyFont: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  backgroundStyle?: string;
  cardStyle?: string;
}

export interface OnboardingCompleteRequest {
  uiTheme: CustomThemePayload;
  workspaceName?: string;
  brandTheme?: BrandThemePayload;
  openRouterKey?: string;
  deepgramKey?: string;
}

@Route("api/onboarding")
@Tags("Onboarding")
export class OnboardingController extends Controller {
  @Post("complete")
  @Security("BearerAuth")
  public async completeOnboarding(
    @Request() request: AuthenticatedRequest,
    @Body() body: OnboardingCompleteRequest,
  ): Promise<ApiResponse<{ success: boolean; role: string }>> {
    if (!request.user) {
      this.setStatus(401);
      throw new Error("Unauthorized");
    }

    const { uid } = request.user;
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
      include: { workspaceMembers: true },
    });

    if (!user) {
      this.setStatus(404);
      throw new Error("User not found");
    }

    // 1. Establish the User's UI CustomTheme
    await prisma.customTheme.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...body.uiTheme,
      },
      update: {
        ...body.uiTheme,
      },
    });

    // 2. Determine if user was invited (already has workspace memberships)
    const isInvited = user.workspaceMembers && user.workspaceMembers.length > 0;

    if (!isInvited) {
      // User is the creator, must provide workspaceName, brandTheme, and API keys
      if (!body.workspaceName || !body.brandTheme || !body.openRouterKey || !body.deepgramKey) {
        this.setStatus(400);
        throw new Error("workspaceName, brandTheme, and API keys are required for new workspace creators");
      }

      // Create Workspace
      const workspace = await prisma.workspace.create({
        data: {
          name: body.workspaceName,
          openRouterKey: body.openRouterKey || null,
          deepgramKey: body.deepgramKey || null,
          members: {
            create: { userId: user.id, role: "OWNER" },
          },
        },
      });

      // Create BrandTheme
      await prisma.brandTheme.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
          name: body.brandTheme.name || "Default Brand",
          headingFont: body.brandTheme.headingFont || "Inter",
          bodyFont: body.brandTheme.bodyFont || "Inter",
          primaryColor: body.brandTheme.primaryColor || "#4361EE",
          secondaryColor: body.brandTheme.secondaryColor || "#a78bfa",
          backgroundColor: body.brandTheme.backgroundColor || "#ffffff",
          textColor: body.brandTheme.textColor || "#0f172a",
          backgroundStyle: body.brandTheme.backgroundStyle || "solid",
          cardStyle: body.brandTheme.cardStyle || "flat",
        },
      });
    }

    // 3. Onboarding data saved — return the user's current role
    return {
      status: 200,
      data: { success: true, role: user.role },
    };
  }
}
