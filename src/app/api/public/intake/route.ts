/**
 * POST /api/public/intake — fully public, no auth required.
 * Accepts lead capture form submissions from the embeddable public form.
 *
 * Rate limited: rejects if the same email was submitted in the last 24 hours.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mergeIntoExistingLead } from "@/lib/intake-merge";
import { rateLimit } from "@/lib/rate-limit";
import { routeLead, ownerName } from "@/lib/lead-routing";
import { onboardPartnerEnquiry } from "@/lib/partner-onramp";
import {
  sendAdminApplicationAlert,
  sendLeadAlert,
  sendPartnerAlert,
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
              phone: true, school: true, academicYear: true, jobTitle: true, zip: true,
              priority: true, company: true },
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

    /**
     * A campus partner enquiry is not a step on the student funnel, so it has
     * no place in the ranking above: PARTNER scored 0 there and could never
     * win, which is how one got absorbed into a consultation lead and left no
     * sign that a college had been in touch.
     *
     * Lead.email is unique, so one person is one lead and a second record is
     * not an option. Instead the enquiry never changes the existing lead type
     * (a prospective student stays a prospective student) but it is always
     * recorded and always alerted, so it cannot pass silently again.
     */
    const isPartnerEnquiry = incomingType === "PARTNER";
    const upgradeType = (INTENT[incomingType] ?? 0) > (INTENT[existing.leadType ?? ""] ?? 0);

    /**
     * Stages a form may move someone between, ranked. A form only ever moves a
     * lead FORWARD: the first version of this let a keep-in-touch submission
     * drag a Consultation back to Lead, which is the same class of silent
     * damage this branch exists to stop. Anything decided (enrolled, withdrawn,
     * denied, unsubscribed) or past application is absent, so it never moves.
     */
    // Non-application resubmissions (e.g. a keep-in-touch form) only move a lead
    // forward within the ranked pipeline, never backward.
    const STAGE_RANK: Record<string, number> = Object.fromEntries(
      ["WAITLIST", "COLD", "KEEP_IN_TOUCH", "LEAD", "CONTACTED", "WAITING_TO_MEET",
       "APPLIED", "STRATEGY_CALL", "ADMITTED", "OFFER_SENT", "ENROLLED", "COMPLETED", "GRADUATED"]
        .map((s, i) => [s, i]),
    );
    // An APPLICATION must never be stranded in an earlier column. It moves the
    // lead to APPLIED from ANY stage except one already at/past the application
    // or decided — so even a stage we never anticipated still advances. A lead at
    // a decided stage stays put, but the admin alert + notification below still
    // fire, so a re-application is never silently lost.
    const AT_OR_PAST_APPLICATION = new Set([
      "APPLIED", "STRATEGY_CALL", "ADMITTED", "OFFER_SENT", "ENROLLED", "COMPLETED",
      "GRADUATED", "DECLINED", "DENIED", "WITHDRAWN", "LOST", "UNSUBSCRIBED",
    ]);
    const incomingStage = stage?.trim();
    const moveStage = isApp
      ? !AT_OR_PAST_APPLICATION.has(existing.stage ?? "")
      : (!!incomingStage
          && (existing.stage ?? "") in STAGE_RANK
          && incomingStage in STAGE_RANK
          && STAGE_RANK[incomingStage] > STAGE_RANK[existing.stage!]);
    const targetStage = isApp ? "APPLIED" : incomingStage;

    // Owner follows what the lead IS after this submission, not what the latest
    // form said — a Consultation that also ticks keep-in-touch is still Dan's.
    const resultingType = upgradeType ? incomingType : (existing.leadType ?? incomingType);
    const owner = existing.assignedTo ?? routeLead(resultingType);

    await mergeIntoExistingLead({
      leadId: existing.id,
      current: {
        phone: existing.phone, school: existing.school, academicYear: existing.academicYear,
        jobTitle: existing.jobTitle, zip: existing.zip, company: existing.company,
      },
      // company was missing here, so a partner's institution was silently
      // dropped on the merge path while their job title came through.
      submitted: { phone, school, academicYear, jobTitle, zip, company },
      changes: {
        ...(upgradeType ? { leadType: incomingType } : {}),
        ...(moveStage ? { stage: targetStage } : {}),
        ...(isApp ? { priority: "HIGH" } : {}),
        ...(owner && !existing.assignedTo ? { assignedTo: owner } : {}),
      },
      headline: isApp
        ? "📝 Submitted an application via the web form"
        : isPartnerEnquiry
          ? "🤝 Campus partner enquiry via the web form"
          : `Re-submitted via web form (${incomingType.toLowerCase()})`,
      details: [
        upgradeType ? `Lead type ${existing.leadType} → ${incomingType}` : null,
        moveStage ? `Stage ${existing.stage} → ${targetStage}` : null,
        (isApp && !moveStage) ? `Application received while at ${existing.stage} (a decided stage) — left for review` : null,
      ],
      body: notes,
    });

    /**
     * A partner enquiry on an existing lead raised nothing: it logged an
     * activity on a record nobody was looking at, and the CRM looked empty.
     * That is how Caleb filled the form in and saw no sign of it. A college
     * getting in touch is worth a notification whether or not that address is
     * already in the CRM.
     */
    if (isPartnerEnquiry) {
      try {
        await sendPartnerAlert({
          firstName: firstName.trim(), lastName: lastName.trim(), email: normalizedEmail,
          company: company?.trim() || existing.company || null,
          jobTitle: jobTitle?.trim() || existing.jobTitle || null,
          leadId: existing.id, landingPage: landingPage?.trim() || null,
        });
      } catch (err) {
        console.error("[intake] partner alert failed:", err);
      }
      /**
       * The person's lead type is deliberately left alone a few lines above — a
       * prospective student stays a prospective student. The ACCOUNT is opened
       * regardless, which is what puts the college on Dan's board rather than
       * leaving it buried in the student funnel.
       */
      const ramp = await onboardPartnerEnquiry({
        leadId: existing.id,
        company: company?.trim() || existing.company,
        contactName: `${firstName.trim()} ${lastName.trim()}`,
      });

      try {
        await prisma.cRMNotification.create({
          data: {
            type:   "NEW_INTAKE",
            title:  `Campus partner enquiry: ${firstName.trim()} ${lastName.trim()}`,
            body:   [company?.trim(), jobTitle?.trim()].filter(Boolean).join(" · ")
                      || "Submitted through Partner with Us.",
            leadId: existing.id,
            // Straight to the deal, because the deal is the thing to work.
            href:   ramp ? `/partnerships/deals/${ramp.dealId}` : `/leads/${existing.id}`,
          },
        });
      } catch (err) {
        console.error("[intake] partner notification failed:", err);
      }
    }

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
          body:   moveStage
            ? `Already in the CRM as ${(existing.leadType ?? "a lead").toLowerCase().replace(/_/g, " ")} — moved to Application.`
            : `⚠️ Applied while at ${(existing.stage ?? "a decided stage").toLowerCase().replace(/_/g, " ")} (a decided stage). Left as-is — review and move manually if this should re-open.`,
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
    await prisma.promoCode.updateMany({
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

  // A college writing in for the first time. Alerted like any other lead, so
  // "Partner with Us" is never the one form nobody hears about.
  let partnerRamp: Awaited<ReturnType<typeof onboardPartnerEnquiry>> = null;
  if (leadType?.trim() === "PARTNER") {
    try {
      await sendPartnerAlert({
        firstName: firstName.trim(), lastName: lastName.trim(), email: normalizedEmail,
        company: company?.trim() || null, jobTitle: jobTitle?.trim() || null,
        leadId: lead.id, landingPage: landingPage?.trim() || null,
      });
    } catch (err) {
      console.error("[intake] partner alert failed for new lead:", err);
    }
    // Open the account and the deal, so the enquiry lands on the partnerships
    // board rather than only in the student funnel.
    partnerRamp = await onboardPartnerEnquiry({
      leadId: lead.id,
      company: company?.trim() || null,
      contactName: `${firstName.trim()} ${lastName.trim()}`,
    });
  }

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
      // A campus partner enquiry said "New lead", which is indistinguishable
      // from a student at a glance. Caleb filled the form in, saw a generic
      // notification, and reasonably concluded nothing had come through.
      title:  isApplication
        ? `New application: ${firstName.trim()} ${lastName.trim()}`
        : leadType?.trim() === "PARTNER"
          ? `Campus partner enquiry: ${firstName.trim()} ${lastName.trim()}`
          : `New lead: ${firstName.trim()} ${lastName.trim()}`,
      body:   leadType?.trim() === "PARTNER"
        ? [company?.trim(), jobTitle?.trim()].filter(Boolean).join(" · ") || normalizedEmail
        : company?.trim() ? `from ${company.trim()}` : normalizedEmail,
      leadId: lead.id,
      // A partner enquiry opens straight on its deal; everyone else on the lead.
      href:   partnerRamp ? `/partnerships/deals/${partnerRamp.dealId}` : `/leads/${lead.id}`,
    },
  }).catch(() => {});

  return NextResponse.json({ success: true, leadId: lead.id }, { status: 200, headers: CORS_HEADERS });
}
