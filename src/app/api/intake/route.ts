/**
 * POST /api/intake — public endpoint
 * Accepts form submissions from your website and creates CRM leads automatically.
 *
 * Protect with INTAKE_API_KEY env var (optional but recommended).
 * Set INTAKE_API_KEY in Vercel env vars and include it as `Authorization: Bearer <key>` header,
 * OR just use it as an open endpoint if you trust your traffic.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  // Optional API key check
  const apiKey = process.env.INTAKE_API_KEY;
  if (apiKey) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${apiKey}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const {
    firstName, lastName, email, phone,
    company, jobTitle, linkedinUrl,
    source = "WEBSITE",
    notes,
    tags,
  } = body;

  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  // Derive name parts from a single `name` field if firstName/lastName not provided
  let first = firstName ?? "";
  let last  = lastName  ?? "";
  if (!first && !last && body.name) {
    const parts = String(body.name).trim().split(" ");
    first = parts[0] ?? "";
    last  = parts.slice(1).join(" ") || "-";
  }
  if (!first) return NextResponse.json({ error: "name or firstName required" }, { status: 400 });

  // Deduplicate — if lead with this email already exists, just update it
  const existing = await prisma.lead.findFirst({ where: { email: email.toLowerCase().trim() } });

  if (existing) {
    // Don't overwrite data — just log an activity so you know they came back
    await prisma.leadActivity.create({
      data: {
        leadId:  existing.id,
        type:    "NOTE",
        content: `Re-submitted interest form (source: ${source})`,
      },
    });
    return NextResponse.json({ id: existing.id, created: false }, { status: 200 });
  }

  const lead = await prisma.lead.create({
    data: {
      firstName: first,
      lastName:  last,
      email:     email.toLowerCase().trim(),
      phone:     phone     || null,
      company:   company   || null,
      jobTitle:  jobTitle  || null,
      linkedinUrl: linkedinUrl || null,
      stage:   "LEAD",
      source:  source || "WEBSITE",
      priority:"NORMAL",
      tags:    Array.isArray(tags) ? tags : [],
      notes:   notes || null,
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId:  lead.id,
      type:    "CREATED",
      content: `Submitted interest form (source: ${source})`,
    },
  });

  return NextResponse.json({ id: lead.id, created: true }, { status: 201 });
}

// Allow your website to hit this from a different domain
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
