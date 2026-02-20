import { Prisma, Task, TaskPriority, TaskStatus } from "@prisma/client";
import prisma from "../prisma/prismaClient";

export interface TaskListOptions {
  projectId?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  page?: number;
  pageSize?: number;
}

export interface TaskWithRelations extends Task {
  dependants: { dependsOnTaskId: string }[];
  dependencies: { taskId: string }[];
}

export interface TaskListResult {
  tasks: TaskWithRelations[];
  total: number;
}

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string | null;
  summary?: string | null;
  acceptanceCriteria?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
  dependencyTaskIds?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  summary?: string | null;
  acceptanceCriteria?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
  dependencyTaskIds?: string[];
}

export class TaskCrudService {
  private readonly defaultTaskInclude = {
    dependants: {
      select: {
        dependsOnTaskId: true,
      },
    },
    dependencies: {
      select: {
        taskId: true,
      },
    },
  } as const;

  public async listTasksForUser(userId: string, options: TaskListOptions): Promise<TaskListResult> {
    const page = Math.max(options.page ?? 1, 1);
    const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.TaskWhereInput = {
      project: { userId },
      ...(options.projectId ? { projectId: options.projectId } : {}),
      ...(options.status ? { status: options.status } : {}),
      ...(options.priority ? { priority: options.priority } : {}),
    };

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: this.defaultTaskInclude,
      }),
      prisma.task.count({ where }),
    ]);

    return { tasks: tasks as TaskWithRelations[], total };
  }

  public async getTaskForUser(userId: string, taskId: string): Promise<TaskWithRelations> {
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        project: { userId },
      },
      include: this.defaultTaskInclude,
    });

    if (!task) {
      throw { status: 404, message: "Task not found" };
    }

    return task as TaskWithRelations;
  }

  public async createTaskForUser(
    userId: string,
    input: CreateTaskInput,
  ): Promise<TaskWithRelations> {
    await this.assertProjectBelongsToUser(userId, input.projectId);

    const task = await prisma.task.create({
      data: {
        projectId: input.projectId,
        title: input.title,
        description: input.description ?? null,
        summary: input.summary ?? null,
        acceptanceCriteria: input.acceptanceCriteria ?? null,
        status: input.status ?? TaskStatus.BACKLOG,
        priority: input.priority ?? TaskPriority.MEDIUM,
        dueDate: input.dueDate ?? null,
        metadata:
          typeof input.metadata === "undefined"
            ? undefined
            : input.metadata === null
              ? Prisma.JsonNull
              : input.metadata,
      },
    });

    if (Array.isArray(input.dependencyTaskIds)) {
      await this.replaceDependencies(task.id, input.dependencyTaskIds);
    }

    return this.getTaskByIdWithRelations(task.id);
  }

  public async updateTaskForUser(
    userId: string,
    taskId: string,
    data: UpdateTaskInput,
  ): Promise<TaskWithRelations> {
    await this.getTaskForUser(userId, taskId);

    const updateData: Prisma.TaskUpdateInput = {};

    if (typeof data.title !== "undefined") {
      updateData.title = data.title;
    }

    if (typeof data.description !== "undefined") {
      updateData.description = data.description;
    }

    if (typeof data.summary !== "undefined") {
      updateData.summary = data.summary;
    }

    if (typeof data.acceptanceCriteria !== "undefined") {
      updateData.acceptanceCriteria = data.acceptanceCriteria;
    }

    if (typeof data.status !== "undefined") {
      updateData.status = data.status;
    }

    if (typeof data.priority !== "undefined") {
      updateData.priority = data.priority;
    }

    if (typeof data.dueDate !== "undefined") {
      updateData.dueDate = data.dueDate ?? null;
    }

    if (typeof data.metadata !== "undefined") {
      updateData.metadata = data.metadata === null ? Prisma.JsonNull : data.metadata;
    }

    await prisma.task.update({
      where: { id: taskId },
      data: updateData,
    });

    if (Array.isArray(data.dependencyTaskIds)) {
      await this.replaceDependencies(taskId, data.dependencyTaskIds);
    }

    return this.getTaskByIdWithRelations(taskId);
  }

  public async deleteTaskForUser(userId: string, taskId: string): Promise<void> {
    await this.getTaskForUser(userId, taskId);
    await prisma.task.delete({ where: { id: taskId } });
  }

  private async assertProjectBelongsToUser(userId: string, projectId: string) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });

    if (!project) {
      throw { status: 404, message: "Project not found" };
    }
  }

  private async getTaskByIdWithRelations(taskId: string): Promise<TaskWithRelations> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: this.defaultTaskInclude,
    });

    if (!task) {
      throw { status: 404, message: "Task not found" };
    }

    return task;
  }

  private async replaceDependencies(taskId: string, dependsOnTaskIds: string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(dependsOnTaskIds.filter((id) => id && id !== taskId)));

    await prisma.taskDependency.deleteMany({ where: { taskId } });

    if (uniqueIds.length === 0) {
      return;
    }

    await prisma.taskDependency.createMany({
      data: uniqueIds.map((dependsOnTaskId) => ({
        taskId,
        dependsOnTaskId,
      })),
      skipDuplicates: true,
    });
  }
}

export const taskCrudService = new TaskCrudService();
