import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeScore } from "@/lib/scoring";
import { fireWebhook } from "@/lib/webhooks";

function requireAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return !session || (session as { user?: { role?: string } }).user?.role !== "ADMIN";
}

// GET /api/crm/leads
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const stage      = searchParams.get("stage");
  const source     = searchParams.get("source");
  const subSource  = searchParams.get("subSource");
  const priority   = searchParams.get("priority");
  const q          = searchParams.get("q");
  const tag        = searchParams.get("tag");
  const assignedTo = searchParams.get("assignedTo");
  const leadType   = searchParams.get("leadType");
  const excludeStages = searchParams.getAll("excludeStage");
  const all        = searchParams.get("all") === "true";
  const page       = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize   = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10)));

  const where = {
    deletedAt: null as null,
    // Merge stage equality + exclusion so they don't overwrite each other
    ...(stage || excludeStages.length ? {
      stage: {
        ...(stage ? { equals: stage } : {}),
        ...(excludeStages.length ? { notIn: excludeStages } : {}),
      },
    } : {}),
    ...(source     ? { source }     : {}),
    ...(subSource  ? { subSource }  : {}),
    ...(priority   ? { priority }   : {}),
    ...(assignedTo ? { assignedTo } : {}),
    // When no leadType filter is set, exclude CONTACT — they live in Partnerships → Contacts
    // "ALL" is a special sentinel meaning no filter (used by deal participant search)
    ...(leadType === "ALL" ? {} : leadType ? { leadType } : { leadType: { not: "CONTACT" } }),
    ...(q ? {
      OR: [
        { firstName: { contains: q, mode: "insensitive" as const } },
        { lastName:  { contains: q, mode: "insensitive" as const } },
        { email:     { contains: q, mode: "insensitive" as const } },
        { company:   { contains: q, mode: "insensitive" as const } },
      ],
    } : {}),
    ...(tag ? { tags: { has: tag } } : {}),
  };

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        _count: { select: { activities: true } },
        enrolledUser: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      ...(all ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
    }),
    prisma.lead.count({ where }),
  ]);

  // Attach computed score to each lead
  const withScores = leads.map(lead => ({
    ...lead,
    score: computeScore({
      stage:         lead.stage,
      updatedAt:     lead.updatedAt,
      priority:      lead.priority,
      dealValue:     lead.dealValue ?? 0,
      phone:         lead.phone,
      company:       lead.company,
      linkedinUrl:   lead.linkedinUrl,
      activityCount: lead._count.activities,
    }),
  }));

  if (all) {
    return NextResponse.json(withScores);
  }

  return NextResponse.json({
    leads: withScores,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

// POST /api/crm/leads
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { firstName, lastName, email, phone, company, jobTitle, linkedinUrl,
          stage, source, leadType, priority, paymentStatus, dealValue, assignedTo, tags, notes } = body;

  if (!firstName || !lastName || !email) {
    return NextResponse.json({ error: "First name, last name and email are required" }, { status: 400 });
  }

  const lead = await prisma.lead.create({
    data: {
      firstName, lastName, email: email.toLowerCase().trim(),
      phone:         phone         || null,
      company:       company       || null,
      jobTitle:      jobTitle      || null,
      linkedinUrl:   linkedinUrl   || null,
      stage:         stage         || "LEAD",
      source:        source        || null,
      leadType:      leadType      || "WAITLIST",
      priority:      priority      || "NORMAL",
      paymentStatus: paymentStatus || "UNPAID",
      dealValue:     typeof dealValue === "number" ? dealValue : 0,
      assignedTo:    assignedTo    || null,
      tags:          Array.isArray(tags) ? tags : [],
      notes:         notes || null,
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

  // Webhook: new lead created (fire-and-forget)
  fireWebhook("lead.created", {
    leadId:    lead.id,
    firstName: lead.firstName,
    lastName:  lead.lastName,
    email:     lead.email,
    source:    lead.source,
    stage:     lead.stage,
  }).catch(() => {});

  return NextResponse.json(lead, { status: 201 });
}
