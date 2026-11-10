import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * The proof library.
 *
 * Returns each quote with the consent recorded against the Fellow, because a
 * quote is only usable when both are true and reading them separately is how
 * mistakes happen. The clearance line is computed in the UI from these two
 * fields rather than stored, so it can never go stale.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { crmRole?: string } }).user?.crmRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // DRAFT | APPROVED | PUBLISHED | ARCHIVED
  const cohort = searchParams.get("cohort");

  const rows = await prisma.testimonial.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(cohort ? { cohort } : {}),
    },
    select: {
      id: true, studentName: true, cohort: true, kind: true, source: true,
      quote: true, editedQuote: true, nps: true,
      status: true, approvedBy: true, approvedAt: true, usedIn: true,
      createdAt: true, updatedAt: true,
      leadId: true,
      lead: {
        select: {
          id: true, firstName: true, lastName: true,
          marketingConsent: true, marketingConsentScopes: true,
          marketingConsentAt: true, marketingConsentNote: true,
          outcomeStatus: true, outcomeCompany: true, outcomeRole: true,
        },
      },
    },
    /**
     * Needs-review first, then newest. The page exists to get quotes through
     * approval, so the queue leads rather than the archive.
     */
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const stats = {
    total:     rows.length,
    draft:     rows.filter(r => r.status === "DRAFT").length,
    approved:  rows.filter(r => r.status === "APPROVED").length,
    published: rows.filter(r => r.status === "PUBLISHED").length,
    /** Approved wording the Fellow has not cleared: the real blocked count. */
    awaitingConsent: rows.filter(r =>
      (r.status === "APPROVED" || r.status === "PUBLISHED") &&
      r.lead?.marketingConsent !== "GRANTED").length,
    fellows: new Set(rows.map(r => r.leadId ?? r.studentName)).size,
  };

  const cohorts = Array.from(new Set(rows.map(r => r.cohort).filter((c): c is string => !!c)));

  return NextResponse.json({ testimonials: rows, stats, cohorts });
}

/**
 * Add a quote by hand, for the ones that arrive in a Slack message or get said
 * on a call rather than typed into the finale survey.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { crmRole?: string } }).user?.crmRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { leadId, quote, kind = "MANUAL", studentName, cohort } = await req.json();
  if (!quote?.trim()) return NextResponse.json({ error: "A quote is required" }, { status: 400 });

  let name = studentName?.trim();
  let lead = null;
  if (leadId) {
    lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, firstName: true, lastName: true, enrolledUserId: true, enrolledUser: { select: { cohort: true } } },
    });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    name = name || `${lead.firstName} ${lead.lastName}`;
  }
  if (!name) return NextResponse.json({ error: "A lead or a name is required" }, { status: 400 });

  const created = await prisma.testimonial.create({
    data: {
      leadId:      lead?.id ?? null,
      userId:      lead?.enrolledUserId ?? null,
      studentName: name,
      cohort:      cohort ?? lead?.enrolledUser?.cohort ?? null,
      kind,
      source:      "MANUAL",
      quote:       quote.trim(),
      // Hand-added quotes start in the queue like every other one. Typing it in
      // is not the same as Dan clearing it.
      status:      "DRAFT",
    },
  });

  return NextResponse.json({ testimonial: created });
}
