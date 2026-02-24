import prisma from "../prisma/prismaClient";
import { DocTheme } from "@prisma/client";

export interface CreateDocThemeInput {
  name: string;
  headingFont?: string;
  bodyFont?: string;
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
}

export class DocThemeService {
  public async create(userId: string, input: CreateDocThemeInput): Promise<DocTheme> {
    return prisma.docTheme.create({
      data: { userId, ...input },
    });
  }

  public async findAll(userId: string): Promise<DocTheme[]> {
    return prisma.docTheme.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  public async findById(userId: string, id: string): Promise<DocTheme> {
    const theme = await prisma.docTheme.findFirst({ where: { id, userId } });
    if (!theme) throw { status: 404, message: "Doc theme not found" };
    return theme;
  }

  public async update(
    userId: string,
    id: string,
    input: Partial<CreateDocThemeInput>,
  ): Promise<DocTheme> {
    await this.findById(userId, id);
    return prisma.docTheme.update({ where: { id }, data: input });
  }

  public async delete(userId: string, id: string): Promise<void> {
    await this.findById(userId, id);
    await prisma.docTheme.delete({ where: { id } });
  }
}

export const docThemeService = new DocThemeService();
