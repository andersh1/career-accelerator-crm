import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { candidatesFrom, type ImportCandidate } from "@/lib/testimonials";

/**
 * Gather the quotable finale answers into the proof library.
 *
 * Reads GrowthBattery rows at point FINALE, which is where the Module 8 survey
 * already stores the pitch line, the parent answer, the arc and the caveat.
 * Nothing is sent to anybody and nothing is published: every quote arrives as
 * DRAFT and waits for Dan.
 *
 * Idempotent. Each quote carries a sourceRef of `finale:<rowId>:<answerKey>`,
 * so re-running after a new Fellow finishes the survey adds only what is new.
 * An existing row's wording is refreshed from the survey but its status,
 * approval stamp and trimmed version are left alone, so a re-import can never
 * un-approve or overwrite someone's editing work.
 *
 * GET reports what an import would do without writing, so the page can show a
 * count before anyone presses the button.
 */

async function collect(): Promise<{ candidates: ImportCandidate[]; finaleRows: number }> {
  const rows = await prisma.growthBattery.findMany({
    where: { point: "FINALE" },
    select: {
      id: true, userId: true, answers: true,
      user: { select: { name: true, cohort: true } },
    },
  });

  /**
   * Match each Fellow back to their CRM lead in one query rather than per row.
   * A Fellow without a lead still gets their quote: leadId stays null, the name
   * is denormalized onto the row, and consent has to be recorded by hand. That
   * is better than dropping the quote because the CRM link is missing.
   */
  const userIds = rows.map(r => r.userId);
  const leads = userIds.length
    ? await prisma.lead.findMany({
        where: { enrolledUserId: { in: userIds }, deletedAt: null },
        select: { id: true, enrolledUserId: true },
      })
    : [];
  const leadByUser = new Map(leads.map(l => [l.enrolledUserId as string, l.id]));

  const candidates = rows.flatMap(r =>
    candidatesFrom({ ...r, leadId: leadByUser.get(r.userId) ?? null }),
  );

  return { candidates, finaleRows: rows.length };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { crmRole?: string } }).user?.crmRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { candidates, finaleRows } = await collect();
  const refs = candidates.map(c => c.sourceRef);
  const known = refs.length
    ? await prisma.testimonial.findMany({ where: { sourceRef: { in: refs } }, select: { sourceRef: true } })
    : [];
  const knownSet = new Set(known.map(k => k.sourceRef));

  return NextResponse.json({
    finaleRows,
    available: candidates.length,
    newQuotes: candidates.filter(c => !knownSet.has(c.sourceRef)).length,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { crmRole?: string } }).user?.crmRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { candidates, finaleRows } = await collect();

  let created = 0;
  let refreshed = 0;

  for (const c of candidates) {
    const existing = await prisma.testimonial.findUnique({
      where:  { sourceRef: c.sourceRef },
      select: { id: true, quote: true },
    });

    if (!existing) {
      await prisma.testimonial.create({
        data: {
          sourceRef:   c.sourceRef,
          leadId:      c.leadId,
          userId:      c.userId,
          studentName: c.studentName,
          cohort:      c.cohort,
          kind:        c.kind,
          source:      "FINALE",
          quote:       c.quote,
          nps:         c.nps,
          status:      "DRAFT",
        },
      });
      created += 1;
      continue;
    }

    /**
     * Only the Fellow's own words are refreshed, and only when they actually
     * changed. Status, approvedBy, approvedAt, editedQuote and usedIn are
     * never touched on an existing row.
     */
    if (existing.quote !== c.quote) {
      await prisma.testimonial.update({
        where: { id: existing.id },
        data:  { quote: c.quote, nps: c.nps, studentName: c.studentName, cohort: c.cohort },
      });
      refreshed += 1;
    }
  }

  return NextResponse.json({
    finaleRows,
    available: candidates.length,
    created,
    refreshed,
  });
}
