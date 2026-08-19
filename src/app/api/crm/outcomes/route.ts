import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { crmRole?: string } }).user?.crmRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status  = searchParams.get("status");   // PENDING | PLACED | STILL_SEARCHING | NOT_LOOKING | UNLOGGED
  const cohort  = searchParams.get("cohort");   // cohort name string

  const leads = await prisma.lead.findMany({
    where: {
      deletedAt: null,
      stage: "ENROLLED",
      ...(status === "UNLOGGED"
        ? { outcomeStatus: null }
        : status
        ? { outcomeStatus: status }
        : {}),
    },
    select: {
      id: true, firstName: true, lastName: true, email: true,
      company: true, jobTitle: true,
      tags: true, cohortPartner: true,
      outcomeStatus: true, outcomeCompany: true, outcomeRole: true,
      outcomeSalary: true, outcomeStartDate: true, outcomeNotes: true, outcomeUpdatedAt: true,
      outcomeEmailSentAt: true,
      enrolledUser: { select: { cohort: true, createdAt: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Filter by cohort (stored on enrolledUser.cohort)
  const filtered = cohort
    ? leads.filter(l => l.enrolledUser?.cohort === cohort)
    : leads;

  // Summary stats
  const total          = filtered.length;
  const placed         = filtered.filter(l => l.outcomeStatus === "PLACED").length;
  const stillSearching = filtered.filter(l => l.outcomeStatus === "STILL_SEARCHING").length;
  const notLooking     = filtered.filter(l => l.outcomeStatus === "NOT_LOOKING").length;
  const unlogged       = filtered.filter(l => !l.outcomeStatus || l.outcomeStatus === "PENDING").length;
  const salaries       = filtered.filter(l => l.outcomeSalary).map(l => l.outcomeSalary as number);
  const avgSalary      = salaries.length ? Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length) : null;

  // Unique cohorts for filter dropdown
  const cohortSet = new Set(leads.map(l => l.enrolledUser?.cohort).filter((c): c is string => !!c));
  const cohorts = Array.from(cohortSet);

  return NextResponse.json({ leads: filtered, stats: { total, placed, stillSearching, notLooking, unlogged, avgSalary }, cohorts });
}
