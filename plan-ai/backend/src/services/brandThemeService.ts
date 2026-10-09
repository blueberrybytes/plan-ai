import prisma from "../prisma/prismaClient";
import { type BrandTheme } from "@prisma/client";
import { adoptLogo } from "./brandLogoService";

export interface CreateBrandThemeInput {
  workspaceId: string;
  name: string;
  logoUrl?: string | null;
  headingFont?: string;
  bodyFont?: string;
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  backgroundStyle?: string | null;
  cardStyle?: string | null;
}

export const brandThemeService = {
  async findAll(userId: string, workspaceId: string): Promise<BrandTheme[]> {
    return prisma.brandTheme.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
  },

  async findById(userId: string, workspaceId: string, id: string): Promise<BrandTheme> {
    const theme = await prisma.brandTheme.findFirst({
      where: { id, workspaceId },
    });

    if (!theme) {
      throw new Error("Theme not found or unauthorized.");
    }
    return theme;
  },

  async create(userId: string, data: CreateBrandThemeInput): Promise<BrandTheme> {
    return prisma.brandTheme.create({
      data: {
        userId,
        ...data,
        logoUrl: await adoptLogo(userId, data.logoUrl),
      },
    });
  },

  async update(
    userId: string,
    workspaceId: string,
    id: string,
    data: Partial<CreateBrandThemeInput>,
  ): Promise<BrandTheme> {
    const theme = await this.findById(userId, workspaceId, id);
    return prisma.brandTheme.update({
      where: { id: theme.id },
      // Only when the logo changes: the stored one is already ours or was tried.
      data:
        data.logoUrl !== undefined && data.logoUrl !== theme.logoUrl
          ? { ...data, logoUrl: await adoptLogo(userId, data.logoUrl) }
          : data,
    });
  },

  async delete(userId: string, workspaceId: string, id: string): Promise<void> {
    const theme = await this.findById(userId, workspaceId, id);
    await prisma.brandTheme.delete({
      where: { id: theme.id },
    });
  },
};
