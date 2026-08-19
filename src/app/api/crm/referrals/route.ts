import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Group leads by referralCode, count referrals and enrollments
  const groups = await prisma.lead.groupBy({
    by: ["referralCode"],
    where: { referralCode: { not: null } },
    _count: { referralCode: true },
  });

  const enrolledGroups = await prisma.lead.groupBy({
    by: ["referralCode"],
    where: { referralCode: { not: null }, stage: "ENROLLED" },
    _count: { referralCode: true },
  });

  const enrolledMap = new Map(enrolledGroups.map(g => [g.referralCode, g._count.referralCode]));

  // Look up which student owns each code
  const codes = groups.map(g => g.referralCode).filter(Boolean) as string[];
  const users = await prisma.user.findMany({
    where: { referralCode: { in: codes } },
    select: { id: true, name: true, email: true, referralCode: true, cohort: true },
  });
  const userMap = new Map(users.map(u => [u.referralCode, u]));

  const rows = groups.map(g => ({
    code:       g.referralCode!,
    total:      g._count.referralCode,
    enrolled:   enrolledMap.get(g.referralCode) ?? 0,
    student:    userMap.get(g.referralCode!) ?? null,
  })).sort((a, b) => b.total - a.total);

  return NextResponse.json(rows);
}
