import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requireAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return !session || (session as { user?: { role?: string } }).user?.role !== "ADMIN";
}

// POST — add a step to a sequence
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { subject: string; body: string; delayDays: number };

  // Get next step number
  const last = await prisma.emailSequenceStep.findFirst({
    where: { sequenceId: params.id },
    orderBy: { stepNumber: "desc" },
  });
  const stepNumber = (last?.stepNumber ?? 0) + 1;

  const step = await prisma.emailSequenceStep.create({
    data: {
      sequenceId: params.id,
      stepNumber,
      subject:   body.subject,
      body:      body.body,
      delayDays: body.delayDays ?? 0,
    },
  });
  return NextResponse.json(step, { status: 201 });
}

// PATCH — update a step (by stepNumber passed in body)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { stepId: string; subject?: string; body?: string; delayDays?: number };
  const step = await prisma.emailSequenceStep.update({
    where: { id: body.stepId },
    data: {
      ...(body.subject   !== undefined ? { subject:   body.subject   } : {}),
      ...(body.body      !== undefined ? { body:      body.body      } : {}),
      ...(body.delayDays !== undefined ? { delayDays: body.delayDays } : {}),
    },
  });
  return NextResponse.json(step);
}

// DELETE — remove a step
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { stepId } = await req.json() as { stepId: string };
  await prisma.emailSequenceStep.delete({ where: { id: stepId } });

  // Re-number remaining steps
  const remaining = await prisma.emailSequenceStep.findMany({
    where: { sequenceId: params.id },
    orderBy: { stepNumber: "asc" },
  });
  await Promise.all(remaining.map((s, i) =>
    prisma.emailSequenceStep.update({ where: { id: s.id }, data: { stepNumber: i + 1 } })
  ));

  return NextResponse.json({ ok: true });
}
