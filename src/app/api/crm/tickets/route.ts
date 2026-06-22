import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/crm/tickets — admin ticket queue with filters
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status   = searchParams.get("status")   || "";
  const priority = searchParams.get("priority") || "";
  const category = searchParams.get("category") || "";
  const search   = searchParams.get("search")   || "";
  const page     = parseInt(searchParams.get("page") || "1");
  const limit    = 25;

  const where: Record<string, unknown> = {};
  if (status)   where.status   = status;
  if (priority) where.priority = priority;
  if (category) where.category = category;
  if (search)   where.subject  = { contains: search, mode: "insensitive" };

  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: {
        user:     { select: { id: true, name: true, email: true, cohort: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { lastActivityAt: "desc" },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    prisma.supportTicket.count({ where }),
  ]);

  // Stats (always unfiltered)
  const [open, inProgress, waiting, resolved, urgent] = await Promise.all([
    prisma.supportTicket.count({ where: { status: "OPEN" } }),
    prisma.supportTicket.count({ where: { status: "IN_PROGRESS" } }),
    prisma.supportTicket.count({ where: { status: "WAITING" } }),
    prisma.supportTicket.count({ where: { status: { in: ["RESOLVED", "CLOSED"] } } }),
    prisma.supportTicket.count({ where: { priority: "URGENT", status: { notIn: ["RESOLVED", "CLOSED"] } } }),
  ]);

  return NextResponse.json({
    tickets,
    total,
    pages: Math.ceil(total / limit),
    page,
    stats: { open, inProgress, waiting, resolved, urgent },
  });
}
