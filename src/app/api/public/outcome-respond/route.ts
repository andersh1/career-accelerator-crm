import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/public/outcome-respond?token=xxx — validate token and return first name
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ ok: false, error: "No token" }, { status: 400 });

  const lead = await prisma.lead.findUnique({
    where: { outcomeToken: token },
    select: { firstName: true, deletedAt: true },
  });

  if (!lead || lead.deletedAt) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 404 });
  return NextResponse.json({ ok: true, firstName: lead.firstName });
}

// POST /api/public/outcome-respond — submit outcome from the form link
export async function POST(req: NextRequest) {
  let body: {
    token?: string; status?: string; company?: string; role?: string;
    salary?: number | null; startDate?: string | null;
    quote?: string | null; consent?: boolean | null; consentScopes?: string[] | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, status, company, role, salary, startDate, quote, consent, consentScopes } = body;
  if (!token || !status) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const ALLOWED_STATUSES = new Set(["PLACED", "STILL_SEARCHING", "NOT_LOOKING"]);
  if (!ALLOWED_STATUSES.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const lead = await prisma.lead.findUnique({
    where: { outcomeToken: token },
    select: { id: true, deletedAt: true, firstName: true, lastName: true, enrolledUserId: true, enrolledUser: { select: { cohort: true } } },
  });

  if (!lead || lead.deletedAt) return NextResponse.json({ error: "Invalid token" }, { status: 404 });

  /**
   * The release is recorded here, by the Fellow, rather than typed in later by
   * a coach.
   *
   * This is the only place in the system where permission comes from the
   * person it belongs to, at the moment they are already telling us where they
   * landed. Everything else is somebody remembering a conversation. Scopes are
   * filtered against the allowlist because this endpoint is public and
   * unauthenticated: the form is the only intended caller, but it is not the
   * only possible one.
   */
  const ALLOWED_SCOPES = new Set(["NAME", "QUOTE_ANON", "EMPLOYER", "PHOTO"]);
  const scopes = consent
    ? (consentScopes ?? []).filter(s => ALLOWED_SCOPES.has(s))
    : [];

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      outcomeStatus:    status,
      outcomeCompany:   company   ?? null,
      outcomeRole:      role      ?? null,
      outcomeSalary:    salary    ?? null,
      outcomeStartDate: startDate ? new Date(startDate) : null,
      outcomeUpdatedAt: new Date(),
      // Only written when they answered the consent question either way, so a
      // Fellow who skips it is left untouched rather than recorded as a no.
      ...(consent === true || consent === false
        ? {
            marketingConsent:       consent ? "GRANTED" : "DECLINED",
            marketingConsentScopes: scopes,
            marketingConsentAt:     new Date(),
            marketingConsentNote:   "Given by the Fellow on the outcome form",
          }
        : {}),
    },
  });

  /**
   * A quote they volunteered here still goes through review like every other
   * one. Consent is theirs to give; approving the wording is Dan's.
   *
   * Keyed on the lead so re-submitting the form replaces their own earlier
   * words rather than stacking up near-duplicates for somebody to pick
   * between. A re-submission resets it to DRAFT on purpose: the text changed,
   * so a previous approval no longer applies to it.
   */
  const text = quote?.trim();
  if (text && text.length >= 12) {
    const sourceRef = `outcome:${lead.id}`;
    await prisma.testimonial.upsert({
      where:  { sourceRef },
      update: { quote: text, status: "DRAFT", approvedBy: null, approvedAt: null, editedQuote: null },
      create: {
        sourceRef,
        leadId:      lead.id,
        userId:      lead.enrolledUserId,
        studentName: `${lead.firstName} ${lead.lastName}`,
        cohort:      lead.enrolledUser?.cohort ?? null,
        kind:        "MANUAL",
        source:      "OUTCOME_FORM",
        quote:       text,
        status:      "DRAFT",
      },
    });
  }

  return NextResponse.json({ ok: true });
}
