import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/crm/students — all LMS students with cohort info + LMS status
export async function GET() {
  const session = await getServerSession(authOptions);
  const crmRole = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || (crmRole !== "ADMIN" && crmRole !== "MEMBER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    select: {
      id: true, name: true, email: true,
      cohort: true, cohortId: true,
      createdAt: true,
      onboardedAt: true,
      certificateIssuedAt: true,
      _count: { select: { progress: true } },
      progress: {
        select: { completedAt: true },
        orderBy: { completedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  // Care flags name a student as struggling, so they're admin-only — deliberately
  // stricter than this endpoint's own gate. A MEMBER sees progress, not distress.
  const flagsByUser = new Map<string, { kind: string; owner: string; detail: string; dueBy: Date }[]>();
  if (crmRole === "ADMIN") {
    const flags = await prisma.interventionFlag.findMany({
      where: { resolvedAt: null, userId: { in: students.map(s => s.id) } },
      orderBy: { dueBy: "asc" },
      select: { userId: true, kind: true, owner: true, detail: true, dueBy: true },
    });
    for (const f of flags) {
      const list = flagsByUser.get(f.userId) ?? [];
      list.push({ kind: f.kind, owner: f.owner, detail: f.detail, dueBy: f.dueBy });
      flagsByUser.set(f.userId, list);
    }
  }

  const now = Date.now();

  return NextResponse.json(students.map(s => ({
    id: s.id,
    name: s.name,
    email: s.email,
    cohort: s.cohort,
    cohortId: s.cohortId,
    createdAt: s.createdAt,
    onboardedAt: s.onboardedAt,
    certificateIssuedAt: s.certificateIssuedAt,
    sectionsCompleted: s._count.progress,
    lastActiveAt: s.progress[0]?.completedAt ?? null,
    openFlags: (flagsByUser.get(s.id) ?? []).map(f => ({
      kind: f.kind, owner: f.owner, detail: f.detail,
      dueBy: f.dueBy, overdue: f.dueBy.getTime() < now,
    })),
  })));
}
