/**
 * Cron: generate proactive CRM notifications
 * Schedule: every day at 8 AM UTC  ("0 8 * * *")
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function authOk(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now          = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const yesterday    = new Date(now.getTime() - 86400000);
  let created = 0;

  // 1. Overdue tasks — only notify once per task per day
  const overdueTasks = await prisma.task.findMany({
    where: { completedAt: null, dueAt: { lt: yesterday } },
    include: { lead: { select: { id: true, firstName: true, lastName: true } } },
    take: 20,
  });

  for (const task of overdueTasks) {
    // Check if we already notified about this task today
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const existing   = await prisma.cRMNotification.findFirst({
      where: {
        type:      "TASK_OVERDUE",
        leadId:    task.leadId,
        title:     { contains: task.title },
        createdAt: { gte: todayStart },
      },
    });
    if (existing) continue;

    await prisma.cRMNotification.create({
      data: {
        type:   "TASK_OVERDUE",
        title:  `Overdue: "${task.title}"`,
        body:   `${task.lead.firstName} ${task.lead.lastName} — due ${task.dueAt?.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        leadId: task.leadId,
        href:   `/leads/${task.leadId}`,
      },
    });
    created++;
  }

  // 2. High-score leads gone cold (not touched in 7+ days, stage != ENROLLED/LOST)
  const coldLeads = await prisma.lead.findMany({
    where: {
      stage:     { notIn: ["ENROLLED", "LOST"] },
      updatedAt: { lt: sevenDaysAgo },
      priority:  { in: ["HIGH", "URGENT"] },
    },
    select: { id: true, firstName: true, lastName: true, stage: true, updatedAt: true },
    take: 10,
  });

  for (const lead of coldLeads) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const existing   = await prisma.cRMNotification.findFirst({
      where: { type: "LEAD_COLD", leadId: lead.id, createdAt: { gte: todayStart } },
    });
    if (existing) continue;

    const daysStale = Math.floor((now.getTime() - lead.updatedAt.getTime()) / 86400000);
    await prisma.cRMNotification.create({
      data: {
        type:   "LEAD_COLD",
        title:  `${lead.firstName} ${lead.lastName} hasn't been touched in ${daysStale} days`,
        body:   `High-priority lead — consider a follow-up`,
        leadId: lead.id,
        href:   `/leads/${lead.id}`,
      },
    });
    created++;
  }

  return NextResponse.json({ created });
}
