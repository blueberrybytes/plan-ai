import { Controller, Get, Route, Security, Tags, Request } from "tsoa";
import { PrismaClient, Role } from "@prisma/client";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import { getAllEmailTemplates } from "../services/templates";

const prisma = new PrismaClient();

export interface AdminEmailTemplatesResponse {
  status: string;
  data: {
    id: string;
    name: string;
    html: string;
  }[];
}

@Tags("Admin")
@Route("api/admin/emails")
@Security("AdminOnly")
export class AdminEmailController extends Controller {
  /**
   * Fetch all email templates for admin preview.
   * Only allowed for users with the ADMIN role.
   */
  @Get("templates")
  public async getTemplates(
    @Request() request: AuthenticatedRequest,
  ): Promise<AdminEmailTemplatesResponse> {
    if (!request.user) {
      this.setStatus(401);
      throw new Error("Unauthorized");
    }

    const user = await prisma.user.findUnique({
      where: { firebaseUid: request.user.uid },
    });

    if (!user || user.role !== Role.ADMIN) {
      this.setStatus(403);
      throw new Error("Forbidden: This endpoint is restricted to ADMIN users.");
    }

    const templates = getAllEmailTemplates();

    return {
      status: "success",
      data: templates,
    };
  }
}
