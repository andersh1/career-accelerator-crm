import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requireAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return !session || (session as { user?: { role?: string } }).user?.role !== "ADMIN";
}

// GET /api/crm/leads
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const stage  = searchParams.get("stage");
  const source = searchParams.get("source");
  const q      = searchParams.get("q");
  const tag    = searchParams.get("tag");

  const leads = await prisma.lead.findMany({
    where: {
      ...(stage  ? { stage }  : {}),
      ...(source ? { source } : {}),
      ...(q ? {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName:  { contains: q, mode: "insensitive" } },
          { email:     { contains: q, mode: "insensitive" } },
          { company:   { contains: q, mode: "insensitive" } },
        ],
      } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
    },
    include: {
      _count: { select: { activities: true } },
      enrolledUser: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(leads);
}

// POST /api/crm/leads
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { firstName, lastName, email, phone, company, jobTitle, linkedinUrl,
          stage, source, priority, tags, notes } = body;

  if (!firstName || !lastName || !email) {
    return NextResponse.json({ error: "First name, last name and email are required" }, { status: 400 });
  }

  const lead = await prisma.lead.create({
    data: {
      firstName, lastName, email: email.toLowerCase().trim(),
      phone:       phone       || null,
      company:     company     || null,
      jobTitle:    jobTitle    || null,
      linkedinUrl: linkedinUrl || null,
      stage:    stage    || "LEAD",
      source:   source   || null,
      priority: priority || "NORMAL",
      tags:     Array.isArray(tags) ? tags : [],
      notes:    notes || null,
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId:    lead.id,
      type:      "CREATED",
      content:   "Lead added to CRM",
      createdBy: (session as { user: { id: string } }).user.id,
    },
  });

  return NextResponse.json(lead, { status: 201 });
}
