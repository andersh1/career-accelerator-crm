/**
 * POST /api/public/intake — fully public, no auth required.
 * Accepts lead capture form submissions from the embeddable public form.
 *
 * Rate limited: rejects if the same email was submitted in the last 24 hours.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { routeLead, ownerName } from "@/lib/lead-routing";
import {
  sendAdminApplicationAlert,
  sendLeadAlert,
  sendConsultationConfirmation,
  sendStayInTouchConfirmation,
} from "@/lib/email";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const { limited } = await rateLimit(`intake:${ip}`, 5, 60 * 60 * 1000);
  if (limited) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429, headers: CORS_HEADERS },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const {
    firstName,
    lastName,
    email,
    phone,
    company,
    jobTitle,
    source,
    notes,
    leadType,
    stage,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    utmTerm,
    landingPage,
    promoCode,
    referralCode,
    personaRole,
    zip,
    studentFirstName,
    studentLastName,
    studentEmail,
    studentPhone,
    academicYear,
    school,
  } = body as Record<string, string | undefined>;

  // Required field validation
  if (!firstName?.trim()) {
    return NextResponse.json({ error: "First name is required" }, { status: 400, headers: CORS_HEADERS });
  }
  if (!lastName?.trim()) {
    return NextResponse.json({ error: "Last name is required" }, { status: 400, headers: CORS_HEADERS });
  }
  if (!email?.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400, headers: CORS_HEADERS });
  }
  if (!email.includes("@")) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400, headers: CORS_HEADERS });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Rate limiting: reject if same email submitted in the last 24 hours
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // A repeat of the SAME kind of submission is throttled. A different kind is
  // an upgrade, not a duplicate: someone who books a consultation and applies
  // the same day was getting "already submitted recently" on their application,
  // because the booking had created the lead that morning.
  const recentSubmission = await prisma.lead.findFirst({
    where: {
      email:     normalizedEmail,
      createdAt: { gte: twentyFourHoursAgo },
      leadType:  leadType?.trim() ?? "WAITLIST",
    },
    select: { id: true },
  });
  if (recentSubmission) {
    return NextResponse.json(
      { error: "This email was already submitted recently. Please try again later." },
      { status: 429, headers: CORS_HEADERS },
    );
  }

  const existing = await prisma.lead.findFirst({
    where: { email: normalizedEmail },
    select: { id: true, stage: true, leadType: true, assignedTo: true,
              phone: true, school: true, academicYear: true, jobTitle: true, zip: true, priority: true },
  });

  /**
   * Someone already in the CRM submitting again.
   *
   * This used to log "Re-submitted via public intake form" and return success —
   * then discard everything that was sent. Nick Goldstein booked a consultation
   * on Sept 9 (which created his lead), had the call, then submitted a full
   * application on Sept 16. He was told it went through. His lead stayed a
   * Consultation, his answers were never stored, and nobody was alerted. Dan
   * found out because Nick told him.
   *
   * The dedupe was right that it should not create a second lead. It was wrong
   * that a second submission carries nothing. Consultation → application is the
   * most valuable path in the funnel and it was the one this broke.
   *
   * Now: never discard what was sent; move the lead FORWARD if this submission
   * shows more intent (never backwards, never out of a decided stage); fill only
   * fields that are empty; and alert exactly as a new application would.
   */
  if (existing) {
    const incomingType = leadType?.trim() ?? "WAITLIST";
    const isApp = incomingType === "APPLICATION";

    const INTENT: Record<string, number> = {
      WAITLIST: 1, CONTACT: 1, KEEP_IN_TOUCH: 2, PARENT: 2, CONSULTATION: 3, APPLICATION: 4,
    };
    const upgradeType = (INTENT[incomingType] ?? 0) > (INTENT[existing.leadType ?? ""] ?? 0);

    /**
     * Stages a form may move someone between, ranked. A form only ever moves a
     * lead FORWARD: the first version of this let a keep-in-touch submission
     * drag a Consultation back to Lead, which is the same class of silent
     * damage this branch exists to stop. Anything decided (enrolled, withdrawn,
     * denied, unsubscribed) or past application is absent, so it never moves.
     */
    const STAGE_RANK: Record<string, number> = {
      WAITLIST: 0, COLD: 0, LEAD: 1, KEEP_IN_TOUCH: 1, WAITING_TO_MEET: 2, APPLIED: 3,
    };
    const incomingStage = stage?.trim();
    const moveStage = !!incomingStage
      && existing.stage in STAGE_RANK
      && incomingStage in STAGE_RANK
      && STAGE_RANK[incomingStage] > STAGE_RANK[existing.stage];

    const fill = (cur: string | null, next: string | undefined) =>
      cur ? undefined : (next?.trim() || undefined);

    // Owner follows what the lead IS after this submission, not what the latest
    // form said — a Consultation that also ticks keep-in-touch is still Dan's.
    const resultingType = upgradeType ? incomingType : (existing.leadType ?? incomingType);
    const owner = existing.assignedTo ?? routeLead(resultingType);

    await prisma.lead.update({
      where: { id: existing.id },
      data: {
        ...(upgradeType ? { leadType: incomingType } : {}),
        ...(moveStage ? { stage: incomingStage } : {}),
        ...(isApp ? { priority: "HIGH" } : {}),
        ...(owner && !existing.assignedTo ? { assignedTo: owner } : {}),
        phone:        fill(existing.phone, phone),
        school:       fill(existing.school, school),
        academicYear: fill(existing.academicYear, academicYear),
        jobTitle:     fill(existing.jobTitle, jobTitle),
        zip:          fill(existing.zip, zip),
      },
    });

    // The submission itself, in full. Nothing a person typed is discarded.
    await prisma.leadActivity.create({
      data: {
        leadId:  existing.id,
        type:    "NOTE",
        content: [
          isApp ? "📝 Submitted an application via the web form" : `Re-submitted via web form (${incomingType.toLowerCase()})`,
          upgradeType ? `Lead type ${existing.leadType} → ${incomingType}` : null,
          moveStage ? `Stage ${existing.stage} → ${incomingStage}` : null,
          notes?.trim() ? `\n${notes.trim()}` : null,
        ].filter(Boolean).join("\n"),
      },
    });

    if (isApp) {
      try {
        await sendAdminApplicationAlert({
          firstName: firstName.trim(), lastName: lastName.trim(), email: normalizedEmail,
          phone: phone?.trim() || existing.phone || null, leadId: existing.id,
          notes: notes?.trim() || null,
        });
      } catch (err) {
        console.error("[intake] application alert failed for existing lead:", err);
      }
      await prisma.cRMNotification.create({
        data: {
          // Same type and title shape as a brand-new application, so it lands
          // in the same place in the feed rather than looking like a lesser event.
          type:   "NEW_INTAKE",
          title:  `New application: ${firstName.trim()} ${lastName.trim()}`,
          body:   `Already in the CRM as ${(existing.leadType ?? "a lead").toLowerCase().replace(/_/g, " ")} — moved to Application.`,
          leadId: existing.id,
          href:   `/leads/${existing.id}`,
        },
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, leadId: existing.id }, { status: 200, headers: CORS_HEADERS });
  }

  const isApplication = leadType?.trim() === "APPLICATION";

  // Append city/state from ZIP (best-effort, never blocks the intake)
  let city: string | null = null;
  let state: string | null = null;
  const cleanZip = zip?.trim().slice(0, 10) || null;
  if (cleanZip && /^\d{5}/.test(cleanZip)) {
    try {
      const geoRes = await fetch(`https://api.zippopotam.us/us/${cleanZip.slice(0, 5)}`, {
        signal: AbortSignal.timeout(2500),
      });
      if (geoRes.ok) {
        const geo = await geoRes.json();
        const place = geo?.places?.[0];
        city  = place?.["place name"] ?? null;
        state = place?.["state abbreviation"] ?? null;
      }
    } catch {
      // ZIP lookup unavailable — save the ZIP alone
    }
  }

  const normalizedRole = ["PARENT", "STUDENT"].includes(personaRole?.trim().toUpperCase() ?? "")
    ? personaRole!.trim().toUpperCase()
    : null;

  // Route to an owner on the way in — consultations to Dan, enquiries to David.
  const resolvedLeadType = leadType?.trim() ?? "WAITLIST";
  const owner = routeLead(resolvedLeadType);

  const lead = await prisma.lead.create({
    data: {
      assignedTo:  owner,
      firstName:   firstName.trim(),
      lastName:    lastName.trim(),
      email:       normalizedEmail,
      phone:       phone?.trim()    || null,
      company:     company?.trim()  || null,
      jobTitle:    jobTitle?.trim() || null,
      stage:       stage?.trim()    ?? "LEAD",
      source:      source?.trim()   ?? "WEBSITE",
      leadType:    resolvedLeadType,
      priority:    isApplication ? "HIGH" : "NORMAL",
      notes:       notes?.trim()    || null,
      utmSource:   utmSource?.trim()   || null,
      utmMedium:   utmMedium?.trim()   || null,
      utmCampaign: utmCampaign?.trim() || null,
      utmContent:  utmContent?.trim()  || null,
      utmTerm:     utmTerm?.trim()      || null,
      academicYear: academicYear?.trim() || null,
      school:       school?.trim() || null,
      landingPage: landingPage?.trim() || null,
      promoCode:    promoCode?.trim().toUpperCase()    || null,
      referralCode: referralCode?.trim().toUpperCase() || null,
      personaRole:  normalizedRole,
      zip:          cleanZip,
      city,
      state,
      studentFirstName: studentFirstName?.trim() || null,
      studentLastName:  studentLastName?.trim()  || null,
      studentEmail:     studentEmail?.trim().toLowerCase() || null,
      studentPhone:     studentPhone?.trim()     || null,
    },
  });

  // Increment promo code usage count (best-effort — never blocks the intake)
  if (promoCode?.trim()) {
    const normalized = promoCode.trim().toUpperCase();
    prisma.promoCode.updateMany({
      where: { code: normalized, active: true },
      data:  { usedCount: { increment: 1 } },
    }).catch(() => {});
  }

  await prisma.leadActivity.create({
    data: {
      leadId:  lead.id,
      type:    "CREATED",
      content: isApplication ? "Submitted application via web form" : "Submitted via web form",
    },
  });

  if (owner) {
    await prisma.leadActivity.create({
      data: {
        leadId:  lead.id,
        type:    "NOTE",
        content: `Auto-assigned to ${ownerName(owner)} (${resolvedLeadType.toLowerCase().replace(/_/g, " ")})`,
      },
    }).catch(() => {});
  }

  // Email Caleb + Dan for every new application, regardless of source
  if (isApplication) {
    try {
      await sendAdminApplicationAlert({
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        email:     normalizedEmail,
        phone:     phone?.trim() || null,
        leadId:    lead.id,
        notes:     notes?.trim() || null,
      });
    } catch (err) {
      console.error("[intake] Admin alert email failed:", err);
    }
  }

  // Website funnel emails — the CRM owns this copy (Automation → Email Playbook).
  // Never fail the request over email; the lead is already saved.
  const isConsultation = leadType?.trim() === "CONSULTATION";
  const isKeepInTouch  = leadType?.trim() === "KEEP_IN_TOUCH";
  if (isConsultation || isKeepInTouch) {
    const results = await Promise.allSettled([
      sendLeadAlert({
        firstName: firstName.trim(), lastName: lastName.trim(), email: normalizedEmail,
        phone: phone?.trim() || null, personaRole: normalizedRole,
        academicYear: academicYear?.trim() || null,
        school: school?.trim() || null,
        isSchedule: isConsultation, leadId: lead.id,
        landingPage: landingPage?.trim() || null,
      }),
      isConsultation
        ? sendConsultationConfirmation({
            to: normalizedEmail, firstName: firstName.trim(),
            isParent: normalizedRole === "PARENT",
          })
        : sendStayInTouchConfirmation({ to: normalizedEmail, firstName: firstName.trim() }),
    ]);
    for (const r of results) {
      if (r.status === "rejected") console.error("[intake] funnel email failed:", r.reason);
    }
  }

  // Fire a CRM notification — non-fatal
  await prisma.cRMNotification.create({
    data: {
      type:   "NEW_INTAKE",
      title:  isApplication ? `New application: ${firstName.trim()} ${lastName.trim()}` : `New lead: ${firstName.trim()} ${lastName.trim()}`,
      body:   company?.trim() ? `from ${company.trim()}` : normalizedEmail,
      leadId: lead.id,
      href:   `/leads/${lead.id}`,
    },
  }).catch(() => {});

  return NextResponse.json({ success: true, leadId: lead.id }, { status: 200, headers: CORS_HEADERS });
}
