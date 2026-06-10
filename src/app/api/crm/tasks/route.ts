// GET /api/crm/tasks — all open tasks across all leads (for /tasks dashboard page)
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tasks = await prisma.task.findMany({
    where:   { completedAt: null },
    include: { lead: { select: { id: true, firstName: true, lastName: true, stage: true } } },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(tasks);
}
