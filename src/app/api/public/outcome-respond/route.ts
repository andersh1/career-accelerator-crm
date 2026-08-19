import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/public/outcome-respond?token=xxx — validate token and return first name
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ ok: false, error: "No token" }, { status: 400 });

  const lead = await prisma.lead.findUnique({
    where: { outcomeToken: token },
    select: { firstName: true, deletedAt: true },
  });

  if (!lead || lead.deletedAt) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 404 });
  return NextResponse.json({ ok: true, firstName: lead.firstName });
}

// POST /api/public/outcome-respond — submit outcome from the form link
export async function POST(req: NextRequest) {
  let body: { token?: string; status?: string; company?: string; role?: string; salary?: number | null; startDate?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, status, company, role, salary, startDate } = body;
  if (!token || !status) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const ALLOWED_STATUSES = new Set(["PLACED", "STILL_SEARCHING", "NOT_LOOKING"]);
  if (!ALLOWED_STATUSES.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const lead = await prisma.lead.findUnique({
    where: { outcomeToken: token },
    select: { id: true, deletedAt: true },
  });

  if (!lead || lead.deletedAt) return NextResponse.json({ error: "Invalid token" }, { status: 404 });

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      outcomeStatus:    status,
      outcomeCompany:   company   ?? null,
      outcomeRole:      role      ?? null,
      outcomeSalary:    salary    ?? null,
      outcomeStartDate: startDate ? new Date(startDate) : null,
      outcomeUpdatedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
