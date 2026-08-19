import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { sequenceId, attendedOnly } = await req.json().catch(() => ({}));

  if (!sequenceId) return NextResponse.json({ error: "sequenceId required" }, { status: 400 });

  // Get registrants with a linked lead
  const registrations = await prisma.eventRegistration.findMany({
    where: {
      eventId: params.id,
      leadId:  { not: null },
      ...(attendedOnly ? { attendedAt: { not: null } } : {}),
    },
    select: { leadId: true },
  });

  const leadIds = Array.from(new Set(registrations.map(r => r.leadId).filter((id): id is string => !!id)));
  if (!leadIds.length) return NextResponse.json({ enrolled: 0, skipped: 0 });

  // Find leads not already enrolled in this sequence
  const existing = await prisma.emailSequenceEnrollment.findMany({
    where: { sequenceId, leadId: { in: leadIds } },
    select: { leadId: true },
  });
  const alreadyEnrolled = new Set(existing.map(e => e.leadId));
  const toEnroll = leadIds.filter(id => !alreadyEnrolled.has(id));

  if (toEnroll.length > 0) {
    // Get sequence first step to set nextSendAt
    const firstStep = await prisma.emailSequenceStep.findFirst({
      where: { sequenceId, stepNumber: 1 },
      select: { delayDays: true },
    });
    const nextSendAt = firstStep
      ? new Date(Date.now() + (firstStep.delayDays ?? 0) * 86400000)
      : new Date();

    await prisma.emailSequenceEnrollment.createMany({
      data: toEnroll.map(leadId => ({
        leadId, sequenceId, currentStep: 1, status: "ACTIVE", nextSendAt,
      })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ enrolled: toEnroll.length, skipped: alreadyEnrolled.size });
}
