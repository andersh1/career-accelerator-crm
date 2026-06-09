import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requireAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return !session || (session as { user?: { role?: string } }).user?.role !== "ADMIN";
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      activities: { orderBy: { createdAt: "desc" } },
      enrolledUser: { select: { id: true, name: true, email: true, cohort: true } },
    },
  });

  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(lead);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { stage: newStage, ...rest } = body;

  const existing = await prisma.lead.findUnique({ where: { id: params.id }, select: { stage: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = { ...rest };
  if (newStage) data.stage = newStage;

  const lead = await prisma.lead.update({ where: { id: params.id }, data });

  if (newStage && newStage !== existing.stage) {
    await prisma.leadActivity.create({
      data: {
        leadId:    params.id,
        type:      "STAGE_CHANGE",
        content:   `Moved from ${existing.stage} to ${newStage}`,
        metadata:  JSON.stringify({ from: existing.stage, to: newStage }),
        createdBy: (session as { user: { id: string } }).user.id,
      },
    });
  }

  return NextResponse.json(lead);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.lead.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
