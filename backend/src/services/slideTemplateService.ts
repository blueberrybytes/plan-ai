import { SlideTemplate, SlideTypeConfig, Prisma } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";

export interface SlideTypeConfigInput {
  slideTypeKey: string;
  displayName: string;
  description?: string | null;
  parametersSchema: Prisma.JsonValue;
  position?: number;
}

export interface CreateTemplateInput {
  userId: string;
  name: string;
  description?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  headingFont?: string | null;
  bodyFont?: string | null;
  logoUrl?: string | null;
  slideTypes?: SlideTypeConfigInput[];
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  headingFont?: string | null;
  bodyFont?: string | null;
  logoUrl?: string | null;
  slideTypes?: SlideTypeConfigInput[];
}

export type TemplateWithSlideTypes = SlideTemplate & {
  slideTypes: SlideTypeConfig[];
};

export class SlideTemplateService {
  public async createTemplate(input: CreateTemplateInput): Promise<TemplateWithSlideTypes> {
    const { slideTypes, ...templateData } = input;

    const template = await prisma.slideTemplate.create({
      data: {
        ...templateData,
        slideTypes: slideTypes
          ? {
              create: slideTypes.map((st, index) => ({
                slideTypeKey: st.slideTypeKey,
                displayName: st.displayName,
                description: st.description ?? null,
                parametersSchema: st.parametersSchema as Prisma.InputJsonValue,
                position: st.position ?? index,
              })),
            }
          : undefined,
      },
      include: { slideTypes: { orderBy: { position: "asc" } } },
    });

    logger.info(
      `Created slide template "${template.name}" (${template.id}) for user ${input.userId}`,
    );
    return template;
  }

  public async getTemplates(userId: string): Promise<TemplateWithSlideTypes[]> {
    return prisma.slideTemplate.findMany({
      where: { userId },
      include: { slideTypes: { orderBy: { position: "asc" } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  public async getTemplateById(
    userId: string,
    templateId: string,
  ): Promise<TemplateWithSlideTypes> {
    const template = await prisma.slideTemplate.findFirst({
      where: { id: templateId, userId },
      include: { slideTypes: { orderBy: { position: "asc" } } },
    });

    if (!template) {
      throw { status: 404, message: "Slide template not found" };
    }

    return template;
  }

  public async updateTemplate(
    userId: string,
    templateId: string,
    input: UpdateTemplateInput,
  ): Promise<TemplateWithSlideTypes> {
    // Verify ownership
    await this.getTemplateById(userId, templateId);

    const { slideTypes, ...templateData } = input;

    return prisma.$transaction(async (tx) => {
      // Update template fields
      await tx.slideTemplate.update({
        where: { id: templateId },
        data: templateData,
      });

      // Replace slide types if provided
      if (slideTypes) {
        await tx.slideTypeConfig.deleteMany({ where: { templateId } });
        if (slideTypes.length > 0) {
          await tx.slideTypeConfig.createMany({
            data: slideTypes.map((st, index) => ({
              templateId,
              slideTypeKey: st.slideTypeKey,
              displayName: st.displayName,
              description: st.description ?? null,
              parametersSchema: st.parametersSchema as Prisma.InputJsonValue,
              position: st.position ?? index,
            })),
          });
        }
      }

      const updated = await tx.slideTemplate.findUniqueOrThrow({
        where: { id: templateId },
        include: { slideTypes: { orderBy: { position: "asc" } } },
      });

      logger.info(`Updated slide template "${updated.name}" (${templateId})`);
      return updated;
    });
  }

  public async deleteTemplate(userId: string, templateId: string): Promise<void> {
    await this.getTemplateById(userId, templateId);
    await prisma.slideTemplate.delete({ where: { id: templateId } });
    logger.info(`Deleted slide template ${templateId}`);
  }
}

export const slideTemplateService = new SlideTemplateService();
