import { Get, Route, Tags, Request, Security, Query } from "tsoa";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import prisma from "../prisma/prismaClient";
import { ApiResponse } from "./controllerTypes";

export interface DashboardAnalytics {
  period: { start: string; end: string };
  meetings: {
    total: number;
    totalHours: number;
    avgDurationMinutes: number;
    avgParticipants: number;
    byWeek: { week: string; count: number; totalMinutes: number }[];
    bySource: { source: string; count: number }[];
  };
  tasks: {
    totalGenerated: number;
    tasksPerMeeting: number;
    completionRate: number;
    byStatus: { status: string; count: number }[];
    byPriority: { priority: string; count: number }[];
    completionTrend: { week: string; completed: number; created: number }[];
  };
  sentiment: {
    distribution: { sentiment: string; count: number }[];
    trend: { week: string; positive: number; neutral: number; negative: number }[];
  };
  aiUsage: {
    totalTokens: number;
    totalCost: number;
    byFeature: { feature: string; tokens: number; cost: number }[];
    trend: { week: string; tokens: number; cost: number }[];
  };
}

@Route("api/analytics")
@Tags("Analytics")
export class AnalyticsController extends BaseWorkspaceController {
  @Get("dashboard")
  @Security("ClientLevel")
  public async getDashboardAnalytics(
    @Request() request: AuthenticatedRequest,
    @Query() period: "7d" | "30d" | "90d" | "all" = "30d",
  ): Promise<ApiResponse<DashboardAnalytics>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const now = new Date();
    let startDate = new Date(0); // For "all"

    if (period === "7d") {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === "30d") {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (period === "90d") {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }

    // 1. Transcript / Meeting Metrics
    const transcripts = await prisma.transcript.findMany({
      where: {
        workspaceId,
        recordedAt: { gte: startDate },
      },
      select: {
        id: true,
        durationSeconds: true,
        speakerCount: true,
        sentiment: true,
        source: true,
        recordedAt: true,
      },
    });

    const totalMeetings = transcripts.length;
    const totalSeconds = transcripts.reduce((sum, t) => sum + (t.durationSeconds || 0), 0);
    const avgDurationMinutes = totalMeetings ? totalSeconds / 60 / totalMeetings : 0;
    const avgParticipants = totalMeetings
      ? transcripts.reduce((sum, t) => sum + (t.speakerCount || 0), 0) / totalMeetings
      : 0;

    // Grouping for Meetings by Week
    const meetingsByWeekMap = new Map<string, { count: number; totalMinutes: number }>();
    const sentimentByWeekMap = new Map<
      string,
      { positive: number; neutral: number; negative: number }
    >();
    const sentimentDistribution = { positive: 0, neutral: 0, negative: 0, unknown: 0 };
    const sourceDistribution = new Map<string, number>();

    transcripts.forEach((t) => {
      // Source
      const src = t.source || "UNKNOWN";
      sourceDistribution.set(src, (sourceDistribution.get(src) || 0) + 1);

      // Sentiment
      const sent = t.sentiment || "UNKNOWN";
      if (sent === "POSITIVE") sentimentDistribution.positive++;
      else if (sent === "NEUTRAL") sentimentDistribution.neutral++;
      else if (sent === "NEGATIVE") sentimentDistribution.negative++;
      else sentimentDistribution.unknown++;

      if (t.recordedAt) {
        const d = new Date(t.recordedAt);
        // Simple week grouping: Sunday as start of week. Format: "YYYY-Wxx"
        // For simplicity in SQL-less grouping, let's group by start of the week date string (YYYY-MM-DD)
        const dayOfWeek = d.getUTCDay();
        const startOfWeek = new Date(d);
        startOfWeek.setUTCDate(d.getUTCDate() - dayOfWeek);
        startOfWeek.setUTCHours(0, 0, 0, 0);

        const weekKey = startOfWeek.toISOString().split("T")[0];

        // Meeting
        const existingWeek = meetingsByWeekMap.get(weekKey) || { count: 0, totalMinutes: 0 };
        existingWeek.count++;
        existingWeek.totalMinutes += (t.durationSeconds || 0) / 60;
        meetingsByWeekMap.set(weekKey, existingWeek);

        // Sentiment
        const existingSentWeek = sentimentByWeekMap.get(weekKey) || {
          positive: 0,
          neutral: 0,
          negative: 0,
        };
        if (sent === "POSITIVE") existingSentWeek.positive++;
        else if (sent === "NEUTRAL") existingSentWeek.neutral++;
        else if (sent === "NEGATIVE") existingSentWeek.negative++;
        sentimentByWeekMap.set(weekKey, existingSentWeek);
      }
    });

    const byWeek = Array.from(meetingsByWeekMap.entries())
      .map(([week, data]) => ({ week, count: data.count, totalMinutes: data.totalMinutes }))
      .sort((a, b) => a.week.localeCompare(b.week));

    const sentimentTrend = Array.from(sentimentByWeekMap.entries())
      .map(([week, data]) => ({
        week,
        positive: data.positive,
        neutral: data.neutral,
        negative: data.negative,
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    const bySource = Array.from(sourceDistribution.entries()).map(([source, count]) => ({
      source,
      count,
    }));

    // 2. Task Metrics
    // We need to find tasks associated with this workspace. Tasks are tied to Projects.
    // Transcripts are also tied to projects. But tasks can exist without transcripts.
    // Let's get all projects in the workspace first.
    const projects = await prisma.project.findMany({
      where: { workspaceId },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);

    const tasks = await prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        createdAt: { gte: startDate },
      },
      select: {
        id: true,
        status: true,
        priority: true,
        createdAt: true,
        completedAt: true,
      },
    });

    const totalGenerated = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === "COMPLETED").length;
    const completionRate = totalGenerated ? (completedTasks / totalGenerated) * 100 : 0;

    // Average tasks per meeting: (Total tasks generated from transcripts) / (Total transcripts)
    // We can approximate by getting TaskTranscriptLinks for the transcripts in this period
    const transcriptIds = transcripts.map((t) => t.id);
    const taskLinks = await prisma.taskTranscriptLink.count({
      where: { transcriptId: { in: transcriptIds } },
    });
    const tasksPerMeeting = totalMeetings ? taskLinks / totalMeetings : 0;

    const taskStatusDist = new Map<string, number>();
    const taskPriorityDist = new Map<string, number>();
    const taskCompletionTrendMap = new Map<string, { created: number; completed: number }>();

    tasks.forEach((t) => {
      taskStatusDist.set(t.status, (taskStatusDist.get(t.status) || 0) + 1);

      const prio = t.priority || "NONE";
      taskPriorityDist.set(prio, (taskPriorityDist.get(prio) || 0) + 1);

      const d = new Date(t.createdAt);
      const dayOfWeek = d.getUTCDay();
      const startOfWeek = new Date(d);
      startOfWeek.setUTCDate(d.getUTCDate() - dayOfWeek);
      startOfWeek.setUTCHours(0, 0, 0, 0);
      const weekKey = startOfWeek.toISOString().split("T")[0];

      const existingTrend = taskCompletionTrendMap.get(weekKey) || { created: 0, completed: 0 };
      existingTrend.created++;
      taskCompletionTrendMap.set(weekKey, existingTrend);

      if (t.completedAt) {
        const cd = new Date(t.completedAt);
        const cDayOfWeek = cd.getUTCDay();
        const cStartOfWeek = new Date(cd);
        cStartOfWeek.setUTCDate(cd.getUTCDate() - cDayOfWeek);
        cStartOfWeek.setUTCHours(0, 0, 0, 0);
        const cWeekKey = cStartOfWeek.toISOString().split("T")[0];

        const existingCompTrend = taskCompletionTrendMap.get(cWeekKey) || {
          created: 0,
          completed: 0,
        };
        existingCompTrend.completed++;
        taskCompletionTrendMap.set(cWeekKey, existingCompTrend);
      }
    });

    const byStatus = Array.from(taskStatusDist.entries()).map(([status, count]) => ({
      status,
      count,
    }));
    const byPriority = Array.from(taskPriorityDist.entries()).map(([priority, count]) => ({
      priority,
      count,
    }));
    const completionTrend = Array.from(taskCompletionTrendMap.entries())
      .map(([week, data]) => ({ week, created: data.created, completed: data.completed }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // 3. AI Usage Metrics
    const aiUsageLogs = await prisma.aiUsageLog.findMany({
      where: {
        workspaceId,
        createdAt: { gte: startDate },
      },
      select: {
        totalTokens: true,
        estimatedCost: true,
        feature: true,
        createdAt: true,
      },
    });

    let totalTokens = 0;
    let totalCost = 0;
    const aiFeatureDist = new Map<string, { tokens: number; cost: number }>();
    const aiTrendMap = new Map<string, { tokens: number; cost: number }>();

    aiUsageLogs.forEach((log) => {
      totalTokens += log.totalTokens || 0;
      totalCost += Number(log.estimatedCost) || 0;

      const feature = log.feature || "UNKNOWN";
      const existingFeat = aiFeatureDist.get(feature) || { tokens: 0, cost: 0 };
      existingFeat.tokens += log.totalTokens || 0;
      existingFeat.cost += Number(log.estimatedCost) || 0;
      aiFeatureDist.set(feature, existingFeat);

      const d = new Date(log.createdAt);
      const dayOfWeek = d.getUTCDay();
      const startOfWeek = new Date(d);
      startOfWeek.setUTCDate(d.getUTCDate() - dayOfWeek);
      startOfWeek.setUTCHours(0, 0, 0, 0);
      const weekKey = startOfWeek.toISOString().split("T")[0];

      const existingTrend = aiTrendMap.get(weekKey) || { tokens: 0, cost: 0 };
      existingTrend.tokens += log.totalTokens || 0;
      existingTrend.cost += Number(log.estimatedCost) || 0;
      aiTrendMap.set(weekKey, existingTrend);
    });

    const byFeature = Array.from(aiFeatureDist.entries()).map(([feature, data]) => ({
      feature,
      tokens: data.tokens,
      cost: data.cost,
    }));
    const aiTrend = Array.from(aiTrendMap.entries())
      .map(([week, data]) => ({ week, tokens: data.tokens, cost: data.cost }))
      .sort((a, b) => a.week.localeCompare(b.week));

    return {
      status: 200,
      data: {
        period: {
          start: startDate.toISOString(),
          end: now.toISOString(),
        },
        meetings: {
          total: totalMeetings,
          totalHours: totalSeconds / 3600,
          avgDurationMinutes,
          avgParticipants,
          byWeek,
          bySource,
        },
        tasks: {
          totalGenerated,
          tasksPerMeeting,
          completionRate,
          byStatus,
          byPriority,
          completionTrend,
        },
        sentiment: {
          distribution: [
            { sentiment: "POSITIVE", count: sentimentDistribution.positive },
            { sentiment: "NEUTRAL", count: sentimentDistribution.neutral },
            { sentiment: "NEGATIVE", count: sentimentDistribution.negative },
            { sentiment: "UNKNOWN", count: sentimentDistribution.unknown },
          ].filter((d) => d.count > 0),
          trend: sentimentTrend,
        },
        aiUsage: {
          totalTokens,
          totalCost,
          byFeature,
          trend: aiTrend,
        },
      },
    };
  }
}
