import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const events = await prisma.event.findMany({
    orderBy: { startsAt: "desc" },
    include: {
      _count: { select: { registrations: true } },
      registrations: {
        select: { attendedAt: true, leadId: true, contactType: true },
      },
    },
  });

  // Enrich each event with funnel counts
  const enriched = await Promise.all(events.map(async (e) => {
    const leadIds = e.registrations.map(r => r.leadId).filter(Boolean) as string[];
    let applied = 0, enrolled = 0;
    if (leadIds.length > 0) {
      const leads = await prisma.lead.findMany({
        where: { id: { in: leadIds }, stage: { in: ["APPLIED", "ENROLLED"] } },
        select: { id: true, stage: true },
      });
      applied  = leads.length;
      enrolled = leads.filter(l => l.stage === "ENROLLED").length;
    }
    const attended = e.registrations.filter(r => r.attendedAt).length;
    const parents  = e.registrations.filter(r => r.contactType === "PARENT").length;
    return {
      ...e,
      registrations: undefined,
      _count: { registrations: e.registrations.length },
      funnel: { registered: e.registrations.length, attended, applied, enrolled, parents },
    };
  }));

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const {
    title, slug, description, eventType, speakerName, speakerBio, speakerTitle,
    speakerImageUrl, location, venueAddress, meetingUrl,
    startsAt, endsAt, timezone, maxCapacity, visibility, confirmationMessage,
  } = body;

  if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 });
  if (!slug?.trim())  return NextResponse.json({ error: "Slug required" }, { status: 400 });
  if (!startsAt)      return NextResponse.json({ error: "Start time required" }, { status: 400 });

  const normalizedSlug = (slug as string).trim().toLowerCase()
    .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  try {
    const event = await prisma.event.create({
      data: {
        title:               title.trim(),
        slug:                normalizedSlug,
        description:         description?.trim() || null,
        eventType:           eventType === "ZOOM" ? "ZOOM" : "IN_PERSON",
        speakerName:         speakerName?.trim() || null,
        speakerBio:          speakerBio?.trim() || null,
        speakerTitle:        speakerTitle?.trim() || null,
        speakerImageUrl:     speakerImageUrl?.trim() || null,
        location:            location?.trim() || null,
        venueAddress:        venueAddress?.trim() || null,
        meetingUrl:          meetingUrl?.trim() || null,
        startsAt:            new Date(startsAt),
        endsAt:              endsAt ? new Date(endsAt) : null,
        timezone:            timezone || "America/New_York",
        maxCapacity:         maxCapacity ? Number(maxCapacity) : null,
        visibility:          visibility || "PUBLIC",
        confirmationMessage: confirmationMessage?.trim() || null,
      },
    });
    return NextResponse.json(event, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
    throw e;
  }
}
