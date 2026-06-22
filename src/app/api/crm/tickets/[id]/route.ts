import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/crm/tickets/[id] — full ticket with thread + student lead
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ticket = await prisma.supportTicket.findUnique({
    where:   { id: params.id },
    include: {
      user:     { select: { id: true, name: true, email: true, cohort: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Also fetch the CRM lead if enrolled
  const lead = await prisma.lead.findFirst({
    where:  { enrolledUserId: ticket.userId },
    select: { id: true, firstName: true, lastName: true },
  });

  return NextResponse.json({ ...ticket, lead });
}

// PATCH /api/crm/tickets/[id] — update status / priority / assignee
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = { updatedAt: new Date() };

  const VALID_STATUSES   = ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"];
  const VALID_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

  if (body.status    && VALID_STATUSES.includes(body.status))     data.status    = body.status;
  if (body.priority  && VALID_PRIORITIES.includes(body.priority)) data.priority  = body.priority;
  if ("assigneeId"   in body)                                      data.assigneeId = body.assigneeId;

  if (body.status === "RESOLVED" || body.status === "CLOSED") {
    data.closedAt = new Date();
  }

  const ticket = await prisma.supportTicket.update({ where: { id: params.id }, data });
  return NextResponse.json(ticket);
}
