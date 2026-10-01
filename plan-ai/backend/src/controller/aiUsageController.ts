import { BaseWorkspaceController } from "./BaseWorkspaceController";
import { Get, Route, Security, Request, Query } from "tsoa";
import prisma from "../prisma/prismaClient";
import { Prisma } from "@prisma/client";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import { ApiResponse } from "./controllerTypes";
import { pricingCacheService } from "../services/pricingCacheService";

export interface AiUsageMetricsResponse {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalEstimatedCost?: number;
  totalBlueberryTokens: number;
  usageByFeature: { feature: string; totalTokens: number }[];
  usageByFeatureCost: { feature: string; estimatedCost: number }[];
  logs: {
    id: string;
    feature: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost?: number;
    blueberryTokens: number;
    createdAt: Date;
  }[];
  totalCount: number;
}

export interface WorkspaceUserUsageSummary {
  userId: string;
  name: string | null;
  email: string;
  workspaceRole: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCost?: number;
  blueberryTokens: number;
}

/** One row of the platform-wide usage view (Plan AI admins only). */
export interface AdminUserUsageSummary {
  userId: string;
  name: string | null;
  email: string;
  /** Last AI call inside the period. */
  lastActivityAt: Date;
  requestCount: number;
  totalTokens: number;
  estimatedCost: number;
  blueberryTokens: number;
}

/**
 * Turns the `period` query value into a createdAt filter.
 * "2026-09" is that calendar month (UTC), "30d" is the last 30 days, and an
 * empty value means all time. Anything else is a 400, so a typo never shows
 * all-time numbers under a month label.
 */
export function usagePeriodFilter(period?: string): Prisma.DateTimeFilter | undefined {
  if (!period) return undefined;

  const month = /^(\d{4})-(\d{2})$/.exec(period);
  if (month) {
    const year = Number(month[1]);
    const monthIndex = Number(month[2]) - 1;
    if (monthIndex >= 0 && monthIndex <= 11) {
      return {
        gte: new Date(Date.UTC(year, monthIndex, 1)),
        lt: new Date(Date.UTC(year, monthIndex + 1, 1)),
      };
    }
  }

  const days = /^(\d{1,3})d$/.exec(period);
  if (days && Number(days[1]) > 0) {
    return { gte: new Date(Date.now() - Number(days[1]) * 24 * 60 * 60 * 1000) };
  }

  throw { status: 400, message: 'Invalid period. Use "YYYY-MM" or a number of days like "30d".' };
}

@Route("api/ai-usage")
export class AiUsageController extends BaseWorkspaceController {
  @Get()
  @Security("ClientLevel")
  public async getUsageMetrics(
    @Request() request: AuthenticatedRequest,
    @Query() page = 1,
    @Query() limit = 50,
    @Query() feature?: string,
    @Query() provider?: string,
    @Query() model?: string,
    @Query() targetUserId?: string,
    @Query() currentMonthOnly?: boolean,
    /** "YYYY-MM" for one month, "30d" for the last 30 days. Empty means all time. */
    @Query() period?: string,
  ): Promise<ApiResponse<AiUsageMetricsResponse>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    let finalUserId = user.id;

    if (targetUserId) {
      let isAllowed = false;
      if (user.role === "ADMIN") {
        isAllowed = true;
      } else {
        const callerMembership = await prisma.workspaceMember.findFirst({
          where: { userId: user.id, workspaceId, role: { in: ["OWNER", "ADMIN"] } },
        });
        if (callerMembership) {
          isAllowed = true;
        }
      }

      if (!isAllowed) {
        this.setStatus(403);
        throw {
          status: 403,
          message:
            "Forbidden: Only workspace owners/admins or global admins can view specific user usage.",
        };
      }

      const targetUserRecord = await prisma.user.findFirst({
        where: {
          OR: [{ id: targetUserId }, { firebaseUid: targetUserId }],
        },
      });

      finalUserId = targetUserRecord ? targetUserRecord.id : targetUserId;
    }

    const take = limit;
    const skip = (page - 1) * limit;

    const isAdminOrOwner = user.role === "ADMIN" || !!targetUserId;

    // When a global admin is viewing a specific user's history, do NOT filter by the
    // admin's active workspace — the target user's logs belong to their own workspaces.
    const isGlobalAdminViewingTarget = user.role === "ADMIN" && !!targetUserId;

    const where: Prisma.AiUsageLogWhereInput = isGlobalAdminViewingTarget
      ? { userId: finalUserId }
      : { userId: finalUserId, workspaceId };
    if (feature) where.feature = feature;
    if (isAdminOrOwner) {
      if (provider) where.provider = provider;
      if (model) where.model = { contains: model, mode: "insensitive" };
    }

    if (currentMonthOnly) {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      where.createdAt = { gte: firstDay };
    }

    const periodFilter = usagePeriodFilter(period);
    if (periodFilter) where.createdAt = periodFilter;

    const [logs, totalCount] = await Promise.all([
      prisma.aiUsageLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
        select: {
          id: true,
          feature: true,
          provider: true,
          model: true,
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
          estimatedCost: true,
          blueberryTokens: true,
          createdAt: true,
        },
      }),
      prisma.aiUsageLog.count({ where }),
    ]);

    // Aggregate statistics
    const aggregates = await prisma.aiUsageLog.groupBy({
      by: ["feature"],
      where,
      _sum: {
        totalTokens: true,
      },
    });

    const costByFeature = await prisma.aiUsageLog.groupBy({
      by: ["feature"],
      where,
      _sum: {
        estimatedCost: true,
      },
    });

    const totalInputAggregate = await prisma.aiUsageLog.aggregate({
      where,
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        estimatedCost: true,
        blueberryTokens: true,
      },
    });

    const enrichedLogs = logs.map((log) => ({
      ...log,
      provider: isAdminOrOwner ? log.provider : "-",
      model: isAdminOrOwner ? log.model : "-",
      estimatedCost: log.estimatedCost,
      blueberryTokens: log.blueberryTokens,
    }));

    return {
      status: 200,
      message: "AI Usage Metrics retrieved successfully",
      data: {
        totalInputTokens: totalInputAggregate._sum.inputTokens || 0,
        totalOutputTokens: totalInputAggregate._sum.outputTokens || 0,
        totalTokens: totalInputAggregate._sum.totalTokens || 0,
        totalEstimatedCost: totalInputAggregate._sum.estimatedCost || 0,
        totalBlueberryTokens: totalInputAggregate._sum.blueberryTokens || 0,
        usageByFeature: aggregates.map((agg) => ({
          feature: agg.feature,
          totalTokens: agg._sum.totalTokens || 0,
        })),
        usageByFeatureCost: costByFeature.map((agg) => ({
          feature: agg.feature,
          estimatedCost: agg._sum.estimatedCost || 0,
        })),
        logs: enrichedLogs,
        totalCount,
      },
    };
  }

  @Get("workspace-summary")
  @Security("ClientLevel")
  public async getWorkspaceSummary(
    @Request() request: AuthenticatedRequest,
    /** "YYYY-MM" for one month, "30d" for the last 30 days. Empty means all time. */
    @Query() period?: string,
  ): Promise<ApiResponse<WorkspaceUserUsageSummary[]>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    // Role check: Only OWNER or ADMIN of workspace (or global ADMIN)
    let isAllowed = false;
    if (user.role === "ADMIN") {
      isAllowed = true;
    } else {
      const callerMembership = await prisma.workspaceMember.findFirst({
        where: { userId: user.id, workspaceId, role: { in: ["OWNER", "ADMIN"] } },
      });
      if (callerMembership) isAllowed = true;
    }

    if (!isAllowed) {
      this.setStatus(403);
      throw {
        status: 403,
        message: "Forbidden: Only workspace owners and admins can view team usage summary.",
      };
    }

    const periodFilter = usagePeriodFilter(period);

    // 1. Get all members in the workspace
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: true },
    });

    // 2. Get aggregate usage by user & model for cost calc
    const modelAggregates = await prisma.aiUsageLog.groupBy({
      by: ["userId", "model", "provider"],
      where: { workspaceId, ...(periodFilter ? { createdAt: periodFilter } : {}) },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        estimatedCost: true,
        blueberryTokens: true,
      },
    });

    // 4. Transform aggregates into per-user structure
    const userSummaryMap = new Map<string, WorkspaceUserUsageSummary>();

    for (const member of members) {
      userSummaryMap.set(member.userId, {
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        workspaceRole: member.role,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        blueberryTokens: 0,
      });
    }

    // Assign sums and costs
    for (const agg of modelAggregates) {
      const summary = userSummaryMap.get(agg.userId);
      if (!summary) continue;

      const inTokens = agg._sum.inputTokens || 0;
      const outTokens = agg._sum.outputTokens || 0;
      const total = agg._sum.totalTokens || 0;

      summary.totalInputTokens += inTokens;
      summary.totalOutputTokens += outTokens;
      summary.totalTokens += total;
      summary.estimatedCost = (summary.estimatedCost || 0) + (agg._sum.estimatedCost || 0);
      summary.blueberryTokens += agg._sum.blueberryTokens || 0;
    }

    const summaries = Array.from(userSummaryMap.values());

    return {
      status: 200,
      data: summaries,
    };
  }

  /**
   * Who used the platform in a period and what it cost, across every
   * workspace. Most recent activity first. "Activity" is an AI call, so an
   * account that only signs in and reads does not show up here.
   */
  @Get("admin/recent")
  @Security("AdminOnly")
  public async getAdminRecentUsage(
    /** "YYYY-MM" for one month, "30d" for the last 30 days. Empty means all time. */
    @Query() period?: string,
  ): Promise<ApiResponse<AdminUserUsageSummary[]>> {
    const periodFilter = usagePeriodFilter(period);

    const perUser = await prisma.aiUsageLog.groupBy({
      by: ["userId"],
      where: periodFilter ? { createdAt: periodFilter } : {},
      _sum: { totalTokens: true, estimatedCost: true, blueberryTokens: true },
      _count: { _all: true },
      _max: { createdAt: true },
    });

    const users = await prisma.user.findMany({
      where: { id: { in: perUser.map((row) => row.userId) } },
      select: { id: true, name: true, email: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const rows: AdminUserUsageSummary[] = [];
    for (const row of perUser) {
      const user = userById.get(row.userId);
      if (!user || !row._max.createdAt) continue;
      rows.push({
        userId: user.id,
        name: user.name,
        email: user.email,
        lastActivityAt: row._max.createdAt,
        requestCount: row._count._all,
        totalTokens: row._sum.totalTokens || 0,
        estimatedCost: row._sum.estimatedCost || 0,
        blueberryTokens: row._sum.blueberryTokens || 0,
      });
    }
    rows.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());

    return { status: 200, data: rows };
  }

  @Get("pricing")
  @Security("AdminOnly")
  public async getPricingMap(): Promise<
    ApiResponse<{
      models: {
        id: string;
        promptPrice: number;
        completionPrice: number;
        maxTokens: number | null;
      }[];
    }>
  > {
    const pricingMap = pricingCacheService.getAllPricing();

    const models = Object.keys(pricingMap).map((id) => ({
      id,
      promptPrice: pricingMap[id].prompt,
      completionPrice: pricingMap[id].completion,
      maxTokens: pricingMap[id].maxTokens || null,
    }));

    return {
      status: 200,
      message: "AI Pricing Data retrieved successfully",
      data: { models },
    };
  }
}
