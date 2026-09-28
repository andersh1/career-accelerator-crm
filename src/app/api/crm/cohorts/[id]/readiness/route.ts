/**
 * GET /api/crm/cohorts/[id]/readiness
 *
 * What is left to do before this cohort can run. Fetches; the checklist itself
 * is built by src/lib/cohort-readiness.ts, which is pure so it can be exercised
 * against a real cohort without standing up a request.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildReadiness } from "@/lib/cohort-readiness";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || (role !== "ADMIN" && role !== "MEMBER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cohort = await prisma.cohort.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, track: true, capacity: true, publishedAt: true,
      orientationDate: true, orientationZoomLink: true,
    },
  });
  if (!cohort) return NextResponse.json({ error: "No such cohort" }, { status: 404 });

  const [moduleCount, schedules, students, liveSessions, templates] = await Promise.all([
    prisma.module.count(),
    prisma.cohortSchedule.findMany({
      where: { cohortId: params.id },
      select: { startDate: true, sessionDate: true, assignmentDue: true, preworkDue: true,
                preambleDate: true, sessionZoomLink: true, module: { select: { number: true } } },
    }),
    prisma.user.findMany({
      where: { cohortId: params.id, role: "STUDENT", withdrawnAt: null },
      select: { onboardedAt: true, invitedAt: true },
    }),
    prisma.liveSession.findMany({
      where: { cohortId: params.id },
      select: { published: true, zoomLink: true },
    }),
    prisma.emailTemplate.findMany({
      where: { key: { startsWith: "module-preamble-" } },
      select: { key: true, enabled: true },
    }),
  ]);

  const result = buildReadiness({
    cohort, moduleCount, schedules, students, liveSessions, templates,
    lmsUrl: process.env.LMS_URL ?? "https://lms.vantagecareer.co",
  });

  return NextResponse.json({
    cohort: { id: cohort.id, name: cohort.name, track: cohort.track },
    ...result,
  });
}
