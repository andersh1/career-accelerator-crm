import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { crmRole?: string } }).user?.crmRole !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const startDateParam = searchParams.get("startDate");
  const startDate = startDateParam ? new Date(startDateParam) : null;

  const now  = new Date();
  const som  = new Date(now.getFullYear(), now.getMonth(), 1);         // start of this month
  const solm = new Date(now.getFullYear(), now.getMonth() - 1, 1);    // start of last month

  // ── Lead data ────────────────────────────────────────────────────────────────
  const leads = await prisma.lead.findMany({
    where: {
      deletedAt: null,
      ...(startDate ? { createdAt: { gte: startDate } } : {}),
    },
    select: {
      id: true, stage: true, source: true, subSource: true, priority: true,
      createdAt: true, dealValue: true, paymentStatus: true, assignedTo: true,
      lostReason: true,
    },
  });

  // ── Admin users (for per-rep analytics) ───────────────────────────────────
  const adminUsers = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, name: true, email: true },
  });

  // ── Stage-change activities (for time-in-stage AND enrollment tracking) ──
  const stageActivities = await prisma.leadActivity.findMany({
    where: {
      type: "STAGE_CHANGE",
      ...(startDate ? { createdAt: { gte: startDate } } : {}),
    },
    select: { leadId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  // Reuse stageActivities for enrollment counts — no second query needed
  const enrolledActivities = stageActivities;

  // ── Cohorts ───────────────────────────────────────────────────────────────
  const cohorts = await prisma.cohort.findMany({
    select: {
      id: true, name: true, isActive: true, capacity: true,
      _count: { select: { users: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // KPIs
  // ─────────────────────────────────────────────────────────────────────────
  const total    = leads.length;
  const enrolled = leads.filter(l => l.stage === "ENROLLED").length;
  const lost     = leads.filter(l => l.stage === "LOST").length;
  const active   = total - enrolled - lost;
  const winRate  = total > 0 ? Math.round((enrolled / total) * 100) : 0;

  const pipelineLeads = leads.filter(l => l.stage !== "LOST");
  const pipelineValue = pipelineLeads.reduce((s, l) => s + (l.dealValue ?? 0), 0);
  const avgDeal       = enrolled > 0
    ? Math.round(leads.filter(l => l.stage === "ENROLLED").reduce((s, l) => s + (l.dealValue ?? 0), 0) / enrolled)
    : 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Month-over-month
  // ─────────────────────────────────────────────────────────────────────────
  const newThisMonth = leads.filter(l => l.createdAt >= som).length;
  const newLastMonth = leads.filter(l => l.createdAt >= solm && l.createdAt < som).length;
  const newMoM       = newLastMonth > 0 ? Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 100) : null;

  // enrolledActivities already set above — reused from stageActivities
  function countEnrolledIn(from: Date, to: Date) {
    return enrolledActivities.filter(a => {
      if (a.createdAt < from || a.createdAt >= to) return false;
      try {
        const m = JSON.parse(a.metadata ?? "{}") as { to?: string };
        return m.to === "ENROLLED";
      } catch { return false; }
    }).length;
  }
  const enrolledThisMonth = countEnrolledIn(som, now);
  const enrolledLastMonth = countEnrolledIn(solm, som);
  const enrolledMoM       = enrolledLastMonth > 0
    ? Math.round(((enrolledThisMonth - enrolledLastMonth) / enrolledLastMonth) * 100)
    : null;

  // ─────────────────────────────────────────────────────────────────────────
  // Funnel
  // ─────────────────────────────────────────────────────────────────────────
  const FUNNEL_STAGES = ["LEAD", "CONTACTED", "STRATEGY_CALL", "OFFER_SENT", "ENROLLED"];
  const funnel = FUNNEL_STAGES.map(stage => ({
    stage,
    count: leads.filter(l => l.stage === stage).length,
    value: leads.filter(l => l.stage === stage).reduce((s, l) => s + (l.dealValue ?? 0), 0),
  }));

  // ─────────────────────────────────────────────────────────────────────────
  // Source breakdown
  // ─────────────────────────────────────────────────────────────────────────
  const sourceMap: Record<string, { count: number; value: number }> = {};
  for (const l of leads) {
    const src = l.source ?? "UNKNOWN";
    if (!sourceMap[src]) sourceMap[src] = { count: 0, value: 0 };
    sourceMap[src].count++;
    sourceMap[src].value += l.dealValue ?? 0;
  }
  const sources = Object.entries(sourceMap)
    .map(([key, data]) => ({ key, ...data }))
    .sort((a, b) => b.count - a.count);

  // 3i NextGen sub-source breakdown (member vs non-member referral)
  const nextgenLeads = leads.filter(l => l.source === "3I_NEXTGEN");
  const nextgenBreakdown = {
    total:     nextgenLeads.length,
    member:    nextgenLeads.filter(l => l.subSource === "MEMBER").length,
    referral:  nextgenLeads.filter(l => l.subSource === "NON_MEMBER_REFERRAL").length,
    untagged:  nextgenLeads.filter(l => !l.subSource).length,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Monthly volume (last 6 months) — single groupBy instead of 6 queries
  // ─────────────────────────────────────────────────────────────────────────
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const paymentRows = await prisma.paymentRecord.findMany({
    where: { paidAt: { gte: sixMonthsAgo } },
    select: { paidAt: true, amount: true },
  });
  const revenueByMonth: Record<string, number> = {};
  for (const row of paymentRows) {
    if (!row.paidAt) continue;
    const key = row.paidAt.toISOString().slice(0, 7);
    revenueByMonth[key] = (revenueByMonth[key] ?? 0) + (row.amount ?? 0);
  }

  const monthly: { month: string; label: string; leads: number; enrolled: number; revenue: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const key = d.toISOString().slice(0, 7);
    const lbl = d.toLocaleDateString("en-US", { month: "short" });

    const monthLeads    = leads.filter(l => l.createdAt >= d && l.createdAt < end);
    const enrolledCount = enrolledActivities.filter(a => {
      if (a.createdAt < d || a.createdAt >= end) return false;
      try { return (JSON.parse(a.metadata ?? "{}") as { to?: string }).to === "ENROLLED"; }
      catch { return false; }
    }).length;

    monthly.push({ month: key, label: lbl, leads: monthLeads.length, enrolled: enrolledCount, revenue: revenueByMonth[key] ?? 0 });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Time-in-stage
  // ─────────────────────────────────────────────────────────────────────────
  // Group activities by lead
  const actsByLead: Record<string, { metadata: string | null; createdAt: Date }[]> = {};
  for (const a of stageActivities) {
    if (!actsByLead[a.leadId]) actsByLead[a.leadId] = [];
    actsByLead[a.leadId].push({ metadata: a.metadata, createdAt: a.createdAt });
  }

  // For each transition (from→to), record the duration in days
  const stageDurations: Record<string, number[]> = {};
  for (const lead of leads) {
    const acts = actsByLead[lead.id] ?? [];
    // Timeline: [createdAt as entering LEAD] + [each STAGE_CHANGE event]
    const timeline: { stage: string; at: Date }[] = [{ stage: "LEAD", at: lead.createdAt }];
    for (const a of acts) {
      try {
        const m = JSON.parse(a.metadata ?? "{}") as { to?: string };
        if (m.to) timeline.push({ stage: m.to, at: a.createdAt });
      } catch { /* skip */ }
    }

    // For consecutive pairs, record duration in "from" stage
    for (let i = 0; i < timeline.length - 1; i++) {
      const from = timeline[i].stage;
      const days = (timeline[i + 1].at.getTime() - timeline[i].at.getTime()) / 86400000;
      if (!stageDurations[from]) stageDurations[from] = [];
      if (days >= 0) stageDurations[from].push(days);
    }

    // For current stage (no next event yet), measure time until now
    if (timeline.length > 0) {
      const cur = timeline[timeline.length - 1];
      if (cur.stage !== "LOST") {
        const days = (now.getTime() - cur.at.getTime()) / 86400000;
        if (!stageDurations[`${cur.stage}_current`]) stageDurations[`${cur.stage}_current`] = [];
        stageDurations[`${cur.stage}_current`].push(days);
      }
    }
  }

  function avg(arr: number[]) {
    if (arr.length === 0) return 0;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  const timeInStage = FUNNEL_STAGES.map(stage => ({
    stage,
    avgDaysToNext:    avg(stageDurations[stage] ?? []),
    avgDaysCurrent:   avg(stageDurations[`${stage}_current`] ?? []),
    sampleSize:       (stageDurations[stage] ?? []).length,
  }));

  // ─────────────────────────────────────────────────────────────────────────
  // Cohort fill rates
  // ─────────────────────────────────────────────────────────────────────────
  const cohortData = cohorts.map(c => ({
    id:         c.id,
    name:       c.name,
    isActive:   c.isActive,
    capacity:   c.capacity,
    enrolled:   c._count.users,
    fillPct:    c.capacity ? Math.min(100, Math.round((c._count.users / c.capacity) * 100)) : null,
    spotsLeft:  c.capacity ? Math.max(0, c.capacity - c._count.users) : null,
  }));

  // ─────────────────────────────────────────────────────────────────────────
  // Weighted pipeline (close probability per stage)
  // ─────────────────────────────────────────────────────────────────────────
  const STAGE_PROB: Record<string, number> = {
    LEAD: 0.05, CONTACTED: 0.15, STRATEGY_CALL: 0.35, OFFER_SENT: 0.65, ENROLLED: 1, LOST: 0,
  };
  const weightedPipeline = leads
    .filter(l => l.stage !== "LOST")
    .reduce((sum, l) => sum + (l.dealValue ?? 0) * (STAGE_PROB[l.stage] ?? 0.05), 0);

  const funnelWeighted = funnel.map(f => ({
    ...f,
    probability: Math.round((STAGE_PROB[f.stage] ?? 0) * 100),
    weightedValue: Math.round(f.value * (STAGE_PROB[f.stage] ?? 0)),
  }));

  // ─────────────────────────────────────────────────────────────────────────
  // Per-rep analytics
  // ─────────────────────────────────────────────────────────────────────────
  const reps = adminUsers.map(u => {
    const repLeads    = leads.filter(l => l.assignedTo === u.email);
    const repEnrolled = repLeads.filter(l => l.stage === "ENROLLED");
    const repLost     = repLeads.filter(l => l.stage === "LOST");
    const repActive   = repLeads.filter(l => l.stage !== "ENROLLED" && l.stage !== "LOST");
    const pipeline    = repLeads.filter(l => l.stage !== "LOST").reduce((s, l) => s + (l.dealValue ?? 0), 0);
    const revenue     = repEnrolled.reduce((s, l) => s + (l.dealValue ?? 0), 0);
    const winRate     = repLeads.length > 0 ? Math.round((repEnrolled.length / repLeads.length) * 100) : 0;
    return {
      id:       u.id,
      name:     u.name ?? u.email,
      total:    repLeads.length,
      active:   repActive.length,
      enrolled: repEnrolled.length,
      lost:     repLost.length,
      pipeline,
      revenue,
      winRate,
    };
  }).filter(r => r.total > 0).sort((a, b) => b.total - a.total);

  // Unassigned
  const unassignedLeads    = leads.filter(l => !l.assignedTo);
  const unassignedEnrolled = unassignedLeads.filter(l => l.stage === "ENROLLED");
  if (unassignedLeads.length > 0) {
    reps.push({
      id:       "unassigned",
      name:     "Unassigned",
      total:    unassignedLeads.length,
      active:   unassignedLeads.filter(l => l.stage !== "ENROLLED" && l.stage !== "LOST").length,
      enrolled: unassignedEnrolled.length,
      lost:     unassignedLeads.filter(l => l.stage === "LOST").length,
      pipeline: unassignedLeads.filter(l => l.stage !== "LOST").reduce((s, l) => s + (l.dealValue ?? 0), 0),
      revenue:  unassignedEnrolled.reduce((s, l) => s + (l.dealValue ?? 0), 0),
      winRate:  unassignedLeads.length > 0 ? Math.round((unassignedEnrolled.length / unassignedLeads.length) * 100) : 0,
    });
  }

  // ── Lost reasons breakdown ────────────────────────────────────────────────
  const reasonMap: Record<string, number> = {};
  for (const l of leads.filter(l => l.stage === "LOST")) {
    const r = l.lostReason?.trim() || "Not specified";
    reasonMap[r] = (reasonMap[r] ?? 0) + 1;
  }
  const lostReasons = Object.entries(reasonMap)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count }));

  return NextResponse.json({
    kpis: { total, enrolled, lost, active, winRate, pipelineValue, avgDeal, weightedPipeline: Math.round(weightedPipeline) },
    mom:  { newThisMonth, newLastMonth, newMoM, enrolledThisMonth, enrolledLastMonth, enrolledMoM },
    funnel: funnelWeighted,
    sources,
    nextgenBreakdown,
    monthly,
    timeInStage,
    cohorts: cohortData,
    reps,
    lostReasons,
  });
}
