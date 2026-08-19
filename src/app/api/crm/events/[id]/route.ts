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

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      registrations: { orderBy: { createdAt: "desc" } },
      _count: { select: { registrations: true } },
    },
  });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Build funnel: registered → attended → applied → enrolled
  const leadIds = event.registrations.map(r => r.leadId).filter(Boolean) as string[];
  let applied = 0, enrolled = 0;
  if (leadIds.length > 0) {
    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds }, stage: { in: ["APPLIED", "ENROLLED"] } },
      select: { id: true, stage: true },
    });
    applied  = leads.length;
    enrolled = leads.filter(l => l.stage === "ENROLLED").length;
  }

  const attended = event.registrations.filter(r => r.attendedAt).length;
  const parents  = event.registrations.filter(r => r.contactType === "PARENT").length;

  return NextResponse.json({
    ...event,
    funnel: {
      registered: event._count.registrations,
      attended,
      applied,
      enrolled,
      parents,
      students: event._count.registrations - parents,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.title !== undefined)               data.title               = body.title?.trim() || undefined;
  if (body.description !== undefined)         data.description         = body.description?.trim() || null;
  if (body.eventType !== undefined)           data.eventType           = body.eventType;
  if (body.speakerName !== undefined)         data.speakerName         = body.speakerName?.trim() || null;
  if (body.speakerBio !== undefined)          data.speakerBio          = body.speakerBio?.trim() || null;
  if (body.speakerTitle !== undefined)        data.speakerTitle        = body.speakerTitle?.trim() || null;
  if (body.speakerImageUrl !== undefined)     data.speakerImageUrl     = body.speakerImageUrl?.trim() || null;
  if (body.location !== undefined)            data.location            = body.location?.trim() || null;
  if (body.venueAddress !== undefined)        data.venueAddress        = body.venueAddress?.trim() || null;
  if (body.meetingUrl !== undefined)          data.meetingUrl          = body.meetingUrl?.trim() || null;
  if (body.startsAt !== undefined)            data.startsAt            = new Date(body.startsAt);
  if (body.endsAt !== undefined)              data.endsAt              = body.endsAt ? new Date(body.endsAt) : null;
  if (body.timezone !== undefined)            data.timezone            = body.timezone;
  if (body.maxCapacity !== undefined)         data.maxCapacity         = body.maxCapacity ? Number(body.maxCapacity) : null;
  if (body.visibility !== undefined)          data.visibility          = body.visibility;
  if (body.active !== undefined)              data.active              = body.active;
  if (body.confirmationMessage !== undefined) data.confirmationMessage = body.confirmationMessage?.trim() || null;
  data.updatedAt = new Date();

  const event = await prisma.event.update({ where: { id: params.id }, data });
  return NextResponse.json(event);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.event.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
