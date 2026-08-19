/**
 * GET /api/crm/home — aggregated data for the CRM home dashboard
 * Returns: today's tasks, hot leads, stale leads, pipeline snapshot, recent activity
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STALE_DAYS = 14;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now       = new Date();
  const todayEnd  = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const staleDate = new Date(now.getTime() - STALE_DAYS * 86400000);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [tasks, newApplications, hotLeads, staleLeads, recentActivity, pipelineLeads, cohorts, lostLeads,
    recentCompletions, enrolledUsers, recentSurveys] = await Promise.all([
    // Today's tasks (due today or overdue, not completed, not from soft-deleted leads)
    prisma.task.findMany({
      where: {
        completedAt: null,
        dueAt: { lte: todayEnd },
        lead: { deletedAt: null },
      },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, stage: true, email: true } },
      },
      orderBy: { dueAt: "asc" },
      take: 20,
    }),

    // New applications: came in via form, not yet reached out to (no email/call/meeting activity)
    prisma.lead.findMany({
      where: {
        deletedAt: null,
        stage: "LEAD",
        leadType: { not: "CONTACT" },
        NOT: {
          activities: { some: { type: { in: ["EMAIL", "CALL", "MEETING"] } } },
        },
      },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        stage: true, priority: true, source: true, leadType: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),

    // Hot leads: score-related — OFFER_SENT or STRATEGY_CALL, updated in last 30 days, not lost
    prisma.lead.findMany({
      where: {
        deletedAt: null,
        stage: { in: ["OFFER_SENT", "STRATEGY_CALL", "CONTACTED"] },
        leadType: { not: "CONTACT" },
        updatedAt: { gte: new Date(now.getTime() - 30 * 86400000) },
      },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        stage: true, priority: true, dealValue: true, updatedAt: true,
        _count: { select: { activities: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 8,
    }),

    // Stale leads: active but not touched in 14+ days
    prisma.lead.findMany({
      where: {
        deletedAt: null,
        stage: { notIn: ["ENROLLED", "LOST"] },
        leadType: { not: "CONTACT" },
        updatedAt: { lte: staleDate },
      },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        stage: true, priority: true, updatedAt: true,
      },
      orderBy: { updatedAt: "asc" },
      take: 10,
    }),

    // Recent activity across all leads
    prisma.leadActivity.findMany({
      where: {
        createdAt: { gte: new Date(now.getTime() - 7 * 86400000) },
      },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),

    // Pipeline snapshot — exclude contacts
    prisma.lead.findMany({
      where: { deletedAt: null, stage: { notIn: ["ENROLLED", "LOST"] }, leadType: { not: "CONTACT" } },
      select: { stage: true, dealValue: true },
    }),

    // Cohort fill rates
    prisma.cohort.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, capacity: true,
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),

    // Lost leads with reasons (for why-we-lose)
    prisma.lead.findMany({
      where: { deletedAt: null, stage: "LOST", lostReason: { not: null } },
      select: { lostReason: true },
    }),

    // Recent section completions (last 7 days)
    prisma.progress.findMany({
      where: { completedAt: { gte: sevenDaysAgo } },
      orderBy: { completedAt: "desc" },
      take: 20,
      select: {
        completedAt: true,
        userId: true,
        user: { select: { name: true, email: true } },
        section: { select: { title: true, module: { select: { number: true, title: true } } } },
      },
    }),

    // All enrolled students for at-risk check
    prisma.user.findMany({
      where: { role: "STUDENT", cohortId: { not: null } },
      select: {
        id: true, name: true, email: true, cohort: true,
        progress: { orderBy: { completedAt: "desc" }, take: 1, select: { completedAt: true } },
      },
    }),

    // Survey submissions this week
    prisma.surveyResponse.findMany({
      where: { submittedAt: { gte: sevenDaysAgo } },
      orderBy: { submittedAt: "desc" },
      take: 10,
      select: {
        submittedAt: true,
        overallRating: true,
        moduleId: true,
        user: { select: { name: true } },
      },
    }),
  ]);

  // Pipeline by stage
  const stageMap: Record<string, { count: number; value: number }> = {};
  for (const lead of pipelineLeads) {
    if (!stageMap[lead.stage]) stageMap[lead.stage] = { count: 0, value: 0 };
    stageMap[lead.stage].count++;
    stageMap[lead.stage].value += lead.dealValue ?? 0;
  }

  // Lost reason breakdown
  const reasonMap: Record<string, number> = {};
  for (const l of lostLeads) {
    const r = l.lostReason?.trim() || "Not specified";
    reasonMap[r] = (reasonMap[r] ?? 0) + 1;
  }
  const lostReasons = Object.entries(reasonMap)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count }));

  // Cohort fill
  const cohortFill = cohorts.map(c => ({
    id:       c.id,
    name:     c.name,
    capacity: c.capacity,
    enrolled: c._count.users,
    fillPct:  c.capacity ? Math.round((c._count.users / c.capacity) * 100) : null,
    spotsLeft: c.capacity ? Math.max(0, c.capacity - c._count.users) : null,
  }));

  // At-risk students: no LMS activity in last 7 days
  const atRiskStudents = enrolledUsers.filter(u => {
    const last = u.progress[0]?.completedAt;
    return !last || last < sevenDaysAgo;
  }).slice(0, 10);

  // Totals — all three must use deletedAt: null so active = allLeads - enrolled - lost is accurate
  const [allLeads, totalEnrolled, totalLost] = await Promise.all([
    prisma.lead.count({ where: { deletedAt: null, leadType: { not: "CONTACT" } } }),
    prisma.lead.count({ where: { deletedAt: null, stage: "ENROLLED", leadType: { not: "CONTACT" } } }),
    prisma.lead.count({ where: { deletedAt: null, stage: "LOST", leadType: { not: "CONTACT" } } }),
  ]);
  const overdueCount  = tasks.filter(t => t.dueAt && new Date(t.dueAt) < todayStart).length;
  const todayCount    = tasks.filter(t => {
    if (!t.dueAt) return false;
    const d = new Date(t.dueAt);
    return d >= todayStart && d <= todayEnd;
  }).length;

  return NextResponse.json({
    tasks,
    newApplications,
    hotLeads,
    staleLeads,
    recentActivity,
    pipeline: stageMap,
    cohortFill,
    lostReasons,
    lmsActivity: {
      recentCompletions,
      atRiskStudents,
      recentSurveys,
    },
    summary: {
      totalLeads: allLeads,
      enrolled: totalEnrolled,
      lost: totalLost,
      active: allLeads - totalEnrolled - totalLost,
      overdueCount,
      todayCount,
      staleCount: await prisma.lead.count({ where: { deletedAt: null, stage: { notIn: ["ENROLLED", "LOST"] }, leadType: { not: "CONTACT" }, updatedAt: { lte: staleDate } } }),
      hotCount: hotLeads.length,
    },
  });
}
