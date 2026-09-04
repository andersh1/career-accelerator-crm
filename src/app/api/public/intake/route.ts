/**
 * POST /api/public/intake — fully public, no auth required.
 * Accepts lead capture form submissions from the embeddable public form.
 *
 * Rate limited: rejects if the same email was submitted in the last 24 hours.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
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
  const recentSubmission = await prisma.lead.findFirst({
    where: {
      email:     normalizedEmail,
      createdAt: { gte: twentyFourHoursAgo },
    },
    select: { id: true },
  });
  if (recentSubmission) {
    return NextResponse.json(
      { error: "This email was already submitted recently. Please try again later." },
      { status: 429, headers: CORS_HEADERS },
    );
  }

  // Check if a lead already exists (outside 24h window) — still accept, just don't duplicate
  const existing = await prisma.lead.findFirst({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (existing) {
    // Log re-engagement but don't create a duplicate lead
    await prisma.leadActivity.create({
      data: {
        leadId:  existing.id,
        type:    "NOTE",
        content: `Re-submitted via public intake form (source: ${source ?? "WEBSITE"})`,
      },
    });
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

  const lead = await prisma.lead.create({
    data: {
      firstName:   firstName.trim(),
      lastName:    lastName.trim(),
      email:       normalizedEmail,
      phone:       phone?.trim()    || null,
      company:     company?.trim()  || null,
      jobTitle:    jobTitle?.trim() || null,
      stage:       stage?.trim()    ?? "LEAD",
      source:      source?.trim()   ?? "WEBSITE",
      leadType:    leadType?.trim() ?? "WAITLIST",
      priority:    isApplication ? "HIGH" : "NORMAL",
      notes:       notes?.trim()    || null,
      utmSource:   utmSource?.trim()   || null,
      utmMedium:   utmMedium?.trim()   || null,
      utmCampaign: utmCampaign?.trim() || null,
      utmContent:  utmContent?.trim()  || null,
      utmTerm:     utmTerm?.trim()      || null,
      academicYear: academicYear?.trim() || null,
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
