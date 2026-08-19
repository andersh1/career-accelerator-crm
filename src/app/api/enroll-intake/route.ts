/**
 * POST /api/enroll-intake — server-to-server enrollment bridge.
 *
 * Fired by a Supabase Database Webhook on the participant CRM (crm.vantagecareer.co)
 * when a new participant is added to its allowlist. Creates an ENROLLED / STUDENT
 * lead here so enrolled cohorts flow into the pipeline automatically.
 *
 * Safe by design: authenticated by a shared secret; only ever CREATES a net-new
 * lead. If a lead with that email already exists, it is left completely untouched.
 *
 * Accepts either a Supabase webhook payload ({ type, record }) or a direct body
 * ({ email, full_name, cohort, role }).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const INTAKE_SECRET = process.env.ENROLL_INTAKE_SECRET ?? "";

export async function POST(req: NextRequest) {
  if (!INTAKE_SECRET || req.headers.get("x-intake-secret") !== INTAKE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Supabase webhook shape: { type: 'INSERT', record: {...} }. Ignore non-inserts.
  const type = body.type as string | undefined;
  if (type && type !== "INSERT") {
    return NextResponse.json({ ok: true, skipped: "not an insert" });
  }
  const rec = (body.record as Record<string, unknown>) ?? body;

  const email = String(rec.email ?? "").toLowerCase().trim();
  const role = String(rec.role ?? "participant").toLowerCase();
  const cohort = String(rec.cohort ?? "").trim();
  const fullName = String(rec.full_name ?? rec.name ?? "").trim();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Missing/invalid email" }, { status: 400 });
  }
  // Only enroll participants — never sync admins/staff into the pipeline.
  if (role !== "participant") {
    return NextResponse.json({ ok: true, skipped: "not a participant" });
  }

  // Leave any existing lead completely untouched (per enrollment-sync decision).
  const existing = await prisma.lead.findFirst({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ ok: true, skipped: "existing lead", leadId: existing.id });
  }

  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || email.split("@")[0];
  const lastName = parts.slice(1).join(" ") || "";

  const lead = await prisma.lead.create({
    data: {
      firstName,
      lastName,
      email,
      stage: "ENROLLED",
      leadType: "STUDENT",
      source: "ENROLLMENT",
      priority: "NORMAL",
      tags: cohort ? [cohort] : [],
      notes: `Enrolled via Career Accelerator CRM${cohort ? ` — cohort: ${cohort}` : ""}.`,
    },
  });

  await prisma.leadActivity.create({
    data: { leadId: lead.id, type: "CREATED", content: `Enrolled participant synced from the CRM${cohort ? ` (${cohort})` : ""}.` },
  }).catch(() => {});

  await prisma.cRMNotification.create({
    data: {
      type: "NEW_INTAKE",
      title: `Enrolled: ${firstName} ${lastName}`.trim(),
      body: cohort ? `Cohort: ${cohort}` : email,
      leadId: lead.id,
      href: `/leads/${lead.id}`,
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, created: true, leadId: lead.id }, { status: 201 });
}
