import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildBoard, type BoardCard } from "@/lib/cohort-board";

/**
 * GET /api/crm/cohorts/board
 *
 * Every cohort, in the column that matches what is actually true of it, with
 * the one thing that needs doing next. The columns and the steps are computed
 * by src/lib/cohort-board.ts, which is pure; this fetches.
 *
 * Archived cohorts are left out unless ?archived=1, so a finished cohort does
 * not sit in a column accumulating complaints nobody is going to act on.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || (role !== "ADMIN" && role !== "MEMBER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const includeArchived = req.nextUrl.searchParams.get("archived") === "1";

  const cohorts = await prisma.cohort.findMany({
    where: includeArchived ? {} : { isActive: true },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, name: true, track: true, isActive: true, capacity: true, startDate: true,
      publishedAt: true, orientationDate: true, orientationZoomLink: true, orientationDeckUrl: true,
      orientationEmailSentAt: true, slackInviteUrl: true, contentVersionId: true,
      contentVersion: { select: { name: true, status: true } },
    },
  });
  if (cohorts.length === 0) return NextResponse.json({ cards: [] });

  const ids = cohorts.map(c => c.id);
  const [moduleCount, schedules, students, liveSessions, recordings, sharedSlack] = await Promise.all([
    prisma.module.count(),
    prisma.cohortSchedule.findMany({
      where: { cohortId: { in: ids } },
      select: { cohortId: true, startDate: true, sessionDate: true, assignmentDue: true,
                preworkDue: true, preambleDate: true, preambleSentAt: true, preambleSkipped: true,
                sessionZoomLink: true, module: { select: { number: true, id: true } } },
    }),
    prisma.user.findMany({
      where: { cohortId: { in: ids }, role: "STUDENT", withdrawnAt: null },
      select: { cohortId: true, onboardedAt: true, invitedAt: true },
    }),
    prisma.liveSession.findMany({
      where: { cohortId: { in: ids } },
      select: { cohortId: true, published: true, zoomLink: true, startsAt: true },
    }),
    // A recording is a VIDEO resource on a module's RECORDING section, tagged
    // to the cohort. Which module it belongs to comes through the section.
    prisma.resource.findMany({
      where: { cohortId: { in: ids }, type: "VIDEO", section: { type: "RECORDING" } },
      select: { cohortId: true, section: { select: { module: { select: { number: true } } } } },
    }),
    prisma.appSetting.findUnique({ where: { key: "slack_invite_url" } }).catch(() => null),
  ]);

  const by = <T extends { cohortId: string | null }>(rows: T[], id: string) => rows.filter(r => r.cohortId === id);
  const now = new Date();

  const cards: BoardCard[] = cohorts.map(c => buildBoard({
    cohort: {
      id: c.id, name: c.name, track: c.track, isActive: c.isActive, capacity: c.capacity,
      startDate: c.startDate, publishedAt: c.publishedAt,
      orientationDate: c.orientationDate, orientationZoomLink: c.orientationZoomLink,
      orientationDeckUrl: c.orientationDeckUrl, orientationEmailSentAt: c.orientationEmailSentAt,
      slackInviteUrl: c.slackInviteUrl,
      contentVersionId: c.contentVersionId,
      contentVersionName: c.contentVersion?.name ?? null,
      contentVersionStatus: c.contentVersion?.status ?? null,
    },
    moduleCount,
    schedules: by(schedules, c.id),
    students: by(students, c.id),
    liveSessions: by(liveSessions, c.id),
    modulesWithRecording: by(recordings, c.id)
      .map(r => r.section?.module?.number)
      .filter((n): n is number => typeof n === "number"),
    sharedSlackSet: !!sharedSlack?.value?.trim(),
    now,
  }));

  return NextResponse.json({ cards });
}
