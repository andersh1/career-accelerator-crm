/**
 * GET   /api/crm/cohorts/[id]/sessions
 * PATCH /api/crm/cohorts/[id]/sessions   { updates: [{ id, zoomLink?, published? }] }
 *
 * The cohort's working sessions, so links and publishing happen where the rest
 * of the cohort is set up.
 *
 * These were LMS-only, which meant the one screen used every week lived in the
 * other app: open the LMS, find the session among every cohort's, edit it. The
 * LMS admin page stays as the place to create sessions and write their
 * descriptions. This is deliberately only the two fields that get touched
 * repeatedly — the link, and whether Fellows can see it.
 *
 * Scoped to this cohort. Sessions with no cohort are shown to everyone, and
 * editing those from inside one cohort's card would change what every other
 * cohort sees.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  return session && role === "ADMIN" ? session : null;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sessions = await prisma.liveSession.findMany({
    where: { cohortId: params.id },
    orderBy: { startsAt: "asc" },
    select: {
      id: true, title: true, kind: true, startsAt: true,
      durationMins: true, zoomLink: true, published: true,
    },
  });
  return NextResponse.json(sessions);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { updates } = await req.json() as {
    updates?: { id: string; zoomLink?: string | null; published?: boolean }[];
  };
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }

  // Only rows belonging to this cohort. An id from elsewhere is ignored rather
  // than trusted, so a stale page cannot publish another cohort's session.
  const mine = new Set(
    (await prisma.liveSession.findMany({
      where: { cohortId: params.id },
      select: { id: true },
    })).map(s => s.id),
  );

  const bad = updates.filter(u => u.zoomLink && !/^https?:\/\//i.test(u.zoomLink.trim()));
  if (bad.length) {
    return NextResponse.json(
      { error: "A Zoom link should start with https://" }, { status: 400 },
    );
  }

  let saved = 0;
  for (const u of updates) {
    if (!mine.has(u.id)) continue;
    const data: Record<string, unknown> = {};
    if (u.zoomLink !== undefined) data.zoomLink = u.zoomLink?.trim() || null;
    if (u.published !== undefined) data.published = !!u.published;
    if (Object.keys(data).length === 0) continue;
    await prisma.liveSession.update({ where: { id: u.id }, data });
    saved++;
  }

  return NextResponse.json({ ok: true, saved, ignored: updates.length - saved });
}
