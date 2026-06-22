import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [allTime, last30, clicksAllTime, clicksLast30] = await Promise.all([
    prisma.leadActivity.findMany({
      where: { type: "EMAIL" },
      select: { id: true, openedAt: true, source: true, createdAt: true, subject: true, leadId: true },
    }),
    prisma.leadActivity.findMany({
      where: { type: "EMAIL", createdAt: { gte: thirtyDaysAgo } },
      select: { id: true, openedAt: true, source: true, createdAt: true },
    }),
    prisma.leadActivity.count({ where: { type: "EMAIL_CLICK" } }),
    prisma.leadActivity.count({ where: { type: "EMAIL_CLICK", createdAt: { gte: thirtyDaysAgo } } }),
  ]);

  function stats(rows: { openedAt: Date | null }[]) {
    const sent   = rows.length;
    const opened = rows.filter(r => r.openedAt).length;
    return { sent, opened, rate: sent > 0 ? Math.round((opened / sent) * 100) : 0 };
  }

  // By source breakdown (all time)
  const sourceMap = new Map<string, { sent: number; opened: number }>();
  for (const r of allTime) {
    const key = r.source ?? "UNKNOWN";
    if (!sourceMap.has(key)) sourceMap.set(key, { sent: 0, opened: 0 });
    const s = sourceMap.get(key)!;
    s.sent++;
    if (r.openedAt) s.opened++;
  }
  const bySource = Array.from(sourceMap.entries())
    .map(([source, s]) => ({ source, ...s, rate: s.sent > 0 ? Math.round((s.opened / s.sent) * 100) : 0 }))
    .sort((a, b) => b.sent - a.sent);

  // Monthly breakdown (last 6 months)
  const monthMap = new Map<string, { sent: number; opened: number }>();
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  for (const r of allTime.filter(r => r.createdAt >= sixMonthsAgo)) {
    const key = r.createdAt.toISOString().slice(0, 7); // YYYY-MM
    if (!monthMap.has(key)) monthMap.set(key, { sent: 0, opened: 0 });
    const m = monthMap.get(key)!;
    m.sent++;
    if (r.openedAt) m.opened++;
  }
  const byMonth = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, m]) => ({
      month,
      label: new Date(month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      ...m,
      rate: m.sent > 0 ? Math.round((m.opened / m.sent) * 100) : 0,
    }));

  return NextResponse.json({
    allTime: stats(allTime),
    last30:  stats(last30),
    bySource,
    byMonth,
    clicks: {
      allTime: { total: clicksAllTime },
      last30:  { total: clicksLast30 },
    },
  });
}
