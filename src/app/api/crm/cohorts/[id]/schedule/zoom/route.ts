/**
 * POST /api/crm/cohorts/[id]/schedule/zoom   { zoomLink, overwrite? }
 *
 * Put one Zoom link on every module in this cohort.
 *
 * Most cohorts meet on a single recurring link, so the link is the same eight
 * times. The only bulk path before this was re-running the schedule generator,
 * which rewrites every date to add one field — and for a cohort with a break
 * week that is not a no-op, because the generator measures its offsets from
 * each session and a shifted session drags the opening date with it.
 *
 * Touches sessionZoomLink and nothing else. By default it fills in blanks only,
 * so a module deliberately given its own link keeps it; `overwrite` replaces
 * every module.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { zoomLink, overwrite } = await req.json() as { zoomLink?: string; overwrite?: boolean };
  const link = zoomLink?.trim();
  if (!link) return NextResponse.json({ error: "Paste a Zoom link first." }, { status: 400 });
  if (!/^https?:\/\//i.test(link)) {
    return NextResponse.json({ error: "That does not look like a link. It should start with https://" }, { status: 400 });
  }

  const rows = await prisma.cohortSchedule.findMany({
    where: { cohortId: params.id },
    select: { id: true, sessionZoomLink: true, module: { select: { number: true } } },
  });
  if (rows.length === 0) {
    return NextResponse.json({ error: "Set the schedule first. There are no modules to put a link on." }, { status: 400 });
  }

  const targets = overwrite ? rows : rows.filter(r => !r.sessionZoomLink);
  await prisma.cohortSchedule.updateMany({
    where: { id: { in: targets.map(r => r.id) } },
    data: { sessionZoomLink: link },
  });

  return NextResponse.json({
    ok: true,
    updated: targets.length,
    skipped: rows.length - targets.length,
    skippedModules: rows.filter(r => !targets.includes(r)).map(r => r.module.number).sort((a, b) => a - b),
  });
}
