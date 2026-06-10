import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requireAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return !session || (session as { user?: { role?: string } }).user?.role !== "ADMIN";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sequences = await prisma.emailSequence.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
      _count: { select: { enrollments: true } },
    },
  });

  const active = await prisma.emailSequenceEnrollment.groupBy({
    by: ["sequenceId"],
    where: { status: "ACTIVE" },
    _count: true,
  });
  const activeMap = Object.fromEntries(active.map(a => [a.sequenceId, a._count]));

  return NextResponse.json(sequences.map(s => ({
    ...s,
    totalEnrollments: s._count.enrollments,
    activeEnrollments: activeMap[s.id] ?? 0,
  })));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, description } = await req.json() as { name: string; description?: string };
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const seq = await prisma.emailSequence.create({ data: { name: name.trim(), description: description ?? null } });
  return NextResponse.json(seq, { status: 201 });
}
