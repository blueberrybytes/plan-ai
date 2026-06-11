import { Prisma } from "@prisma/client";
import prisma from "../prisma/prismaClient";

export interface CustomThemeUpsertInput {
  userId: string;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  surfaceColor?: string | null;
  textPrimaryColor?: string | null;
  textSecondaryColor?: string | null;
  fontFamily?: string | null;
  headingFontFamily?: string | null;
  borderRadius?: number | null;
  density?: number | null;
  configJson?: Prisma.JsonValue | null;
}

export class CustomThemeService {
  public async getByUserId(userId: string) {
    return prisma.customTheme.findUnique({ where: { userId } });
  }

  public async upsert(input: CustomThemeUpsertInput) {
    const { userId, configJson, ...rest } = input;
    return prisma.customTheme.upsert({
      where: { userId },
      create: {
        userId,
        ...rest,
        ...(typeof configJson === "undefined"
          ? {}
          : configJson === null
            ? { configJson: Prisma.JsonNull }
            : { configJson }),
      },
      update: {
        ...rest,
        ...(typeof configJson === "undefined"
          ? {}
          : configJson === null
            ? { configJson: Prisma.JsonNull }
            : { configJson }),
      },
    });
  }

  public async deleteByUserId(userId: string) {
    return prisma.customTheme.delete({ where: { userId } });
  }
}

export const customThemeService = new CustomThemeService();
