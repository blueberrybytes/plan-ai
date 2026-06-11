import { Post, Path, Request, Route, Security, Tags, Body } from "tsoa";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import prisma from "../prisma/prismaClient";
import type { ApiResponse } from "./controllerTypes";
import { IntegrationProvider } from "@prisma/client";
import { jiraIntegrationService } from "../services/jiraIntegrationService";
import { linearIntegrationService } from "../services/linearIntegrationService";
import { trelloIntegrationService } from "../services/trelloIntegrationService";
import { notionIntegrationService } from "../services/notionIntegrationService";
import { asanaIntegrationService } from "../services/asanaIntegrationService";
import type { TaskMetadata } from "../services/taskMetadataTypes";
import type {
  JiraIntegrationMetadata,
  LinearIntegrationMetadata,
  TrelloIntegrationMetadata,
  NotionIntegrationMetadata,
  AsanaIntegrationMetadata,
} from "../services/integrationMetadataTypes";

interface SyncTaskRequest {
  targetTeamId?: string; // Optional if fallback configured
}

interface SyncTaskResponse {
  success: boolean;
  externalIssueId: string;
  externalIssueKey: string;
  url: string;
}

@Route("api/tasks")
@Tags("Task Integrations")
export class TaskIntegrationController extends BaseWorkspaceController {
  /**
   * Dummy endpoint to export TaskMetadata types to the OpenAPI spec for frontend strong typing
   */
  @Post("metadata-types")
  public async getMetadataTypes(): Promise<ApiResponse<TaskMetadata>> {
    return { status: 200, data: {} as TaskMetadata };
  }

  @Post("{taskId}/sync/{provider}")
  @Security("ClientLevel")
  public async syncTask(
    @Request() request: AuthenticatedRequest,
    @Path() taskId: string,
    @Path() provider: string,
    @Body() body: SyncTaskRequest,
  ): Promise<ApiResponse<SyncTaskResponse>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    // Convert to uppercase enum checking
    const providerEnum = this.parseProvider(provider);
    if (
      !providerEnum ||
      (providerEnum !== IntegrationProvider.JIRA &&
        providerEnum !== IntegrationProvider.LINEAR &&
        providerEnum !== IntegrationProvider.TRELLO &&
        providerEnum !== IntegrationProvider.NOTION &&
        providerEnum !== IntegrationProvider.ASANA)
    ) {
      this.setStatus(400);
      throw { status: 400, message: "Invalid provider for task synchronization" };
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId, project: { userId: user.id, workspaceId } },
    });

    if (!task) {
      this.setStatus(404);
      throw { status: 404, message: "Task not found" };
    }

    // Initialize/merge metadata locally
    const existingMetadata = (task.metadata as unknown as TaskMetadata) || {};

    let responseData: SyncTaskResponse | null = null;

    if (providerEnum === IntegrationProvider.JIRA) {
      const wsIntegration = await prisma.workspaceIntegration.findUnique({
        where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.JIRA } },
      });
      const meta = wsIntegration?.metadata as JiraIntegrationMetadata | null;
      const targetId = body.targetTeamId || meta?.defaultProjectId;

      if (!targetId) {
        this.setStatus(400);
        throw {
          status: 400,
          message: "Target Project/Team ID is required for Jira sync (no default configured)",
        };
      }

      const jiraResult = await jiraIntegrationService.createJiraIssue(
        workspaceId,
        taskId,
        targetId,
      );
      existingMetadata.jira = {
        issueId: jiraResult.issueId,
        issueKey: jiraResult.issueKey,
        url: jiraResult.url,
      };
      responseData = {
        success: true,
        externalIssueId: jiraResult.issueId,
        externalIssueKey: jiraResult.issueKey,
        url: jiraResult.url,
      };
    } else if (providerEnum === IntegrationProvider.LINEAR) {
      const wsIntegration = await prisma.workspaceIntegration.findUnique({
        where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.LINEAR } },
      });
      const meta = wsIntegration?.metadata as LinearIntegrationMetadata | null;
      const targetId = body.targetTeamId || meta?.defaultTeamId;

      if (!targetId) {
        this.setStatus(400);
        throw {
          status: 400,
          message: "Target Team ID is required for Linear sync (no default configured)",
        };
      }

      const linearResult = await linearIntegrationService.createLinearIssue(
        workspaceId,
        taskId,
        targetId,
      );
      existingMetadata.linear = {
        issueId: linearResult.issueId,
        identifier: linearResult.identifier,
        url: linearResult.url,
      };
      responseData = {
        success: true,
        externalIssueId: linearResult.issueId,
        externalIssueKey: linearResult.identifier,
        url: linearResult.url,
      };
    } else if (providerEnum === IntegrationProvider.TRELLO) {
      const wsIntegration = await prisma.workspaceIntegration.findUnique({
        where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.TRELLO } },
      });
      const meta = wsIntegration?.metadata as TrelloIntegrationMetadata | null;
      const targetBoard = body.targetTeamId || meta?.defaultBoardId;
      const targetList = meta?.defaultListId;

      if (!targetBoard || !targetList) {
        this.setStatus(400);
        throw {
          status: 400,
          message: "Target Board and List are required for Trello sync (no default configured)",
        };
      }

      const trelloResult = await trelloIntegrationService.createTrelloCard(
        workspaceId,
        taskId,
        targetBoard,
        targetList,
      );
      existingMetadata.trello = {
        cardId: trelloResult.cardId,
        shortLink: trelloResult.shortLink,
        url: trelloResult.url,
      };
      responseData = {
        success: true,
        externalIssueId: trelloResult.cardId,
        externalIssueKey: trelloResult.shortLink,
        url: trelloResult.url,
      };
    } else if (providerEnum === IntegrationProvider.NOTION) {
      const wsIntegration = await prisma.workspaceIntegration.findUnique({
        where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.NOTION } },
      });
      const meta = wsIntegration?.metadata as NotionIntegrationMetadata | null;
      const targetDatabaseId = body.targetTeamId || meta?.defaultDatabaseId || undefined;

      const notionResult = await notionIntegrationService.createNotionPage(
        workspaceId,
        taskId,
        targetDatabaseId, // optional — falls back to standalone page
      );

      existingMetadata.notion = {
        pageId: notionResult.pageId,
        url: notionResult.url,
      };

      responseData = {
        success: true,
        externalIssueId: notionResult.pageId,
        externalIssueKey: notionResult.pageId,
        url: notionResult.url,
      };
    } else if (providerEnum === IntegrationProvider.ASANA) {
      const wsIntegration = await prisma.workspaceIntegration.findUnique({
        where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.ASANA } },
      });
      const meta = wsIntegration?.metadata as AsanaIntegrationMetadata | null;
      const targetProjectGid = body.targetTeamId || meta?.defaultProjectGid || undefined;

      if (!targetProjectGid) {
        this.setStatus(400);
        throw {
          status: 400,
          message: "Target Project GID is required for Asana sync (no default configured)",
        };
      }

      const asanaResult = await asanaIntegrationService.createAsanaTask(
        workspaceId,
        taskId,
        targetProjectGid,
      );
      existingMetadata.asana = {
        taskGid: asanaResult.taskGid,
        url: asanaResult.url,
      };
      responseData = {
        success: true,
        externalIssueId: asanaResult.taskGid,
        externalIssueKey: asanaResult.taskGid,
        url: asanaResult.url,
      };
    }

    if (!responseData) {
      this.setStatus(500);
      throw { status: 500, message: "Sync provider not implemented" };
    }

    // Lock local metadata
    await prisma.task.update({
      where: { id: taskId },
      data: {
        metadata: existingMetadata as unknown as import("@prisma/client").Prisma.InputJsonObject,
      },
    });

    return {
      status: 200,
      message: `Successfully synchronized task to ${providerEnum}`,
      data: responseData,
    };
  }

  @Post("auto-sync-transcript/{transcriptId}")
  @Security("ClientLevel")
  public async autoSyncTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() transcriptId: string,
  ): Promise<ApiResponse<{ pushed: number; skipped: number; errors: string[] }>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const transcript = await prisma.transcript.findFirst({
      where: { id: transcriptId, userId: user.id, workspaceId },
    });

    if (!transcript) {
      this.setStatus(404);
      throw { status: 404, message: "Transcript not found" };
    }

    // Tasks generated from this transcript are tagged in their metadata
    const tasks = await prisma.task.findMany({
      where: {
        project: { userId: user.id, workspaceId },
        metadata: {
          path: ["generatedFromTranscriptId"],
          equals: transcriptId,
        },
      },
    });

    const jiraIntegration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.JIRA } },
    });
    const linearIntegration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.LINEAR } },
    });
    const trelloIntegration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.TRELLO } },
    });
    const notionIntegration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.NOTION } },
    });
    const asanaIntegration = await prisma.workspaceIntegration.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.ASANA } },
    });

    const jiraMeta = jiraIntegration?.metadata as JiraIntegrationMetadata | null;
    const linearMeta = linearIntegration?.metadata as LinearIntegrationMetadata | null;
    const trelloMeta = trelloIntegration?.metadata as TrelloIntegrationMetadata | null;
    const asanaMeta = asanaIntegration?.metadata as AsanaIntegrationMetadata | null;

    const jiraDefaultProjectId = jiraMeta?.defaultProjectId;
    const linearDefaultTeamId = linearMeta?.defaultTeamId;
    const trelloDefaultBoardId = trelloMeta?.defaultBoardId;
    const trelloDefaultListId = trelloMeta?.defaultListId;
    const asanaDefaultProjectGid = asanaMeta?.defaultProjectGid;

    let pushed = 0;
    let skipped = 0;
    const errors: string[] = [];

    let notionSyncResult: { pageId: string; url: string } | null = null;
    if (notionIntegration?.status === "CONNECTED") {
      try {
        notionSyncResult = await notionIntegrationService.exportTranscriptToNotion(
          workspaceId,
          transcript,
          tasks,
        );
      } catch (err) {
        errors.push(
          `Notion transcript export: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }

    await Promise.all(
      tasks.map(async (task) => {
        const taskMeta: TaskMetadata = (task.metadata as unknown as TaskMetadata) || {};

        if (notionSyncResult) {
          taskMeta.notion = {
            pageId: notionSyncResult.pageId,
            url: notionSyncResult.url,
          };
          pushed++;
        }

        if (
          !jiraDefaultProjectId &&
          !linearDefaultTeamId &&
          !trelloDefaultListId &&
          !asanaDefaultProjectGid &&
          !notionSyncResult
        ) {
          skipped++;
          return;
        }

        if (jiraIntegration?.status === "CONNECTED" && jiraDefaultProjectId) {
          try {
            const result = await jiraIntegrationService.createJiraIssue(
              workspaceId,
              task.id,
              jiraDefaultProjectId,
            );
            taskMeta.jira = { issueId: result.issueId, issueKey: result.issueKey, url: result.url };
            pushed++;
          } catch (err) {
            errors.push(
              `Jira task ${task.id}: ${err instanceof Error ? err.message : "Unknown error"}`,
            );
          }
        }

        if (linearIntegration?.status === "CONNECTED" && linearDefaultTeamId) {
          try {
            const result = await linearIntegrationService.createLinearIssue(
              workspaceId,
              task.id,
              linearDefaultTeamId,
            );
            taskMeta.linear = {
              issueId: result.issueId,
              identifier: result.identifier,
              url: result.url,
            };
            pushed++;
          } catch (err) {
            errors.push(
              `Linear task ${task.id}: ${err instanceof Error ? err.message : "Unknown error"}`,
            );
          }
        }

        if (
          trelloIntegration?.status === "CONNECTED" &&
          trelloDefaultBoardId &&
          trelloDefaultListId
        ) {
          try {
            const result = await trelloIntegrationService.createTrelloCard(
              workspaceId,
              task.id,
              trelloDefaultBoardId,
              trelloDefaultListId,
            );
            taskMeta.trello = {
              cardId: result.cardId,
              shortLink: result.shortLink,
              url: result.url,
            };
            pushed++;
          } catch (err) {
            errors.push(
              `Trello task ${task.id}: ${err instanceof Error ? err.message : "Unknown error"}`,
            );
          }
        }

        if (asanaIntegration?.status === "CONNECTED" && asanaDefaultProjectGid) {
          try {
            const result = await asanaIntegrationService.createAsanaTask(
              workspaceId,
              task.id,
              asanaDefaultProjectGid,
            );
            taskMeta.asana = {
              taskGid: result.taskGid,
              url: result.url,
            };
            pushed++;
          } catch (err) {
            errors.push(
              `Asana task ${task.id}: ${err instanceof Error ? err.message : "Unknown error"}`,
            );
          }
        }

        await prisma.task.update({
          where: { id: task.id },
          data: {
            metadata: taskMeta as unknown as import("@prisma/client").Prisma.InputJsonObject,
          },
        });
      }),
    );

    return {
      status: 200,
      data: { pushed, skipped, errors },
    };
  }

  private parseProvider(value: string): IntegrationProvider | null {
    const upperCased = value.toUpperCase();
    if (upperCased in IntegrationProvider) {
      return IntegrationProvider[upperCased as keyof typeof IntegrationProvider];
    }
    return null;
  }
}
