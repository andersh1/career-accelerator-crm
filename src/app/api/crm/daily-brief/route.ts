/**
 * AI daily brief for the Home dashboard.
 * GET  — return today's cached brief (or { brief: null } if not generated yet)
 * POST — (re)generate today's brief with Claude and cache it in AppSetting
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

const KEY = "daily-brief";

function etDateStr(d = new Date()) {
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

async function requireCrmUser() {
  const session = await getServerSession(authOptions);
  const crmRole = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || (crmRole !== "ADMIN" && crmRole !== "MEMBER")) return null;
  return session;
}

export async function GET() {
  if (!await requireCrmUser()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return NextResponse.json({ brief: null });
  try {
    const parsed = JSON.parse(row.value);
    if (parsed.date !== etDateStr()) return NextResponse.json({ brief: null });
    return NextResponse.json({ brief: parsed });
  } catch {
    return NextResponse.json({ brief: null });
  }
}

export async function POST() {
  const session = await requireCrmUser();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "notConfigured" }, { status: 503 });
  }

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 3600_000);

  const [tasks, pipeline, sessionsToday] = await Promise.all([
    prisma.task.findMany({
      where: { completedAt: null },
      include: { lead: { select: { id: true, firstName: true, lastName: true, stage: true } } },
      orderBy: { dueAt: "asc" },
      take: 40,
    }),
    prisma.lead.findMany({
      where: {
        deletedAt: null,
        stage: { notIn: ["ENROLLED", "GRADUATED", "LOST"] },
        NOT: { leadType: "STUDENT" },
      },
      select: {
        id: true, firstName: true, lastName: true, stage: true, priority: true,
        source: true, updatedAt: true, notes: true,
        activities: { orderBy: { createdAt: "desc" }, take: 2, select: { type: true, content: true, createdAt: true } },
      },
      take: 60,
    }),
    prisma.oneOnOneBooking.findMany({
      where: { status: "CONFIRMED", slot: { startTime: { gte: now, lte: in24h } } },
      include: {
        slot: { select: { startTime: true, admin: { select: { name: true } } } },
        student: { select: { name: true } },
        module: { select: { number: true } },
      },
    }),
  ]);

  const data = {
    todayET: etDateStr(),
    openTasks: tasks.map(t => ({
      title: t.title,
      due: t.dueAt ? t.dueAt.toISOString().slice(0, 10) : null,
      overdue: !!(t.dueAt && t.dueAt < now),
      lead: `${t.lead.firstName} ${t.lead.lastName}`,
      leadId: t.lead.id,
      leadStage: t.lead.stage,
    })),
    pipelineLeads: pipeline.map(l => ({
      name: `${l.firstName} ${l.lastName}`,
      id: l.id,
      stage: l.stage,
      priority: l.priority,
      source: l.source,
      daysSinceTouch: Math.floor((now.getTime() - l.updatedAt.getTime()) / 86_400_000),
      lastActivity: l.activities[0] ? `${l.activities[0].type}: ${(l.activities[0].content ?? "").slice(0, 140)}` : null,
    })),
    coachingSessionsNext24h: sessionsToday.map(s => ({
      student: s.student.name,
      coach: s.slot.admin?.name,
      module: s.module.number,
      at: s.slot.startTime.toISOString(),
    })),
  };

  const client = new Anthropic();
  const resp = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1500,
    thinking: { type: "adaptive" },
    system: `You are the daily operations brief for the Vantage Career Accelerator's 2-person team (Caleb runs ops/enrollment, Dan coaches). Given today's CRM data, pick the 3-5 actions that genuinely matter TODAY, ranked by impact. Be concrete and specific — name people, say why now, keep each rationale to one sharp sentence in plain language. Do not pad; if only 2 things matter, return 2. Never invent data.

Return ONLY valid JSON, no markdown fences, shaped exactly:
{"headline": "<one energetic sentence summing up the day, max 15 words>", "items": [{"title": "<imperative action, max 12 words>", "why": "<one sentence>", "leadId": "<lead id if the action is about a specific lead, else null>", "urgency": "high" | "medium" | "low"}]}`,
    messages: [{ role: "user", content: JSON.stringify(data) }],
  });

  const text = resp.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
  let brief: { headline: string; items: unknown[] };
  try {
    brief = JSON.parse(text.trim().replace(/^```json?\s*|\s*```$/g, ""));
  } catch {
    return NextResponse.json({ error: "Could not parse brief" }, { status: 502 });
  }

  const payload = { ...brief, date: etDateStr(), generatedAt: now.toISOString() };
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(payload) },
    update: { value: JSON.stringify(payload) },
  });

  return NextResponse.json({ brief: payload });
}
