import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requireAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return !session || (session as { user?: { role?: string } }).user?.role !== "ADMIN";
}

// GET — enrollments for a lead
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const enrollments = await prisma.emailSequenceEnrollment.findMany({
    where: { leadId: params.id },
    include: {
      sequence: { include: { steps: { orderBy: { stepNumber: "asc" } } } },
    },
    orderBy: { startedAt: "desc" },
  });
  return NextResponse.json(enrollments);
}

// POST — enroll lead in a sequence
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { sequenceId } = await req.json() as { sequenceId: string };

  // Check sequence exists and has steps
  const seq = await prisma.emailSequence.findUnique({
    where: { id: sequenceId },
    include: { steps: { orderBy: { stepNumber: "asc" } } },
  });
  if (!seq) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  if (seq.steps.length === 0) return NextResponse.json({ error: "Sequence has no steps" }, { status: 400 });

  // Upsert enrollment
  const firstStep = seq.steps[0];
  const nextSendAt = new Date(Date.now() + firstStep.delayDays * 86400000);

  const enrollment = await prisma.emailSequenceEnrollment.upsert({
    where: { leadId_sequenceId: { leadId: params.id, sequenceId } },
    create: {
      leadId: params.id, sequenceId,
      currentStep: 1, status: "ACTIVE", nextSendAt,
    },
    update: {
      currentStep: 1, status: "ACTIVE",
      nextSendAt, completedAt: null,
    },
  });

  // Log activity
  await prisma.leadActivity.create({
    data: {
      leadId: params.id, type: "NOTE",
      content: `Enrolled in sequence: "${seq.name}"`,
      createdBy: (session as { user: { id: string } }).user.id,
    },
  });

  // Create notification
  const lead = await prisma.lead.findUnique({ where: { id: params.id }, select: { firstName: true, lastName: true } });
  await prisma.cRMNotification.create({
    data: {
      type: "SEQUENCE_SENT",
      title: `${lead?.firstName} ${lead?.lastName} enrolled in "${seq.name}"`,
      body:  `Step 1 will send ${firstStep.delayDays === 0 ? "today" : `in ${firstStep.delayDays} day${firstStep.delayDays !== 1 ? "s" : ""}`}`,
      leadId: params.id,
      href:  `/leads/${params.id}`,
    },
  });

  return NextResponse.json(enrollment, { status: 201 });
}
