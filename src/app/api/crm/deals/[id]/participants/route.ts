import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type TypedSession = { user?: { crmRole?: string } } | null;

// POST /api/crm/deals/[id]/participants — link a lead to a deal
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions) as TypedSession;
  const role = session?.user?.crmRole;
  if (!session || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { leadId } = await req.json();
  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  await prisma.lead.update({
    where: { id: leadId },
    data: { dealId: params.id },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/crm/deals/[id]/participants — unlink a lead from a deal
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions) as TypedSession;
  const role = session?.user?.crmRole;
  if (!session || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { leadId } = await req.json();
  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

  // Only unlink if currently linked to this deal
  await prisma.lead.updateMany({
    where: { id: leadId, dealId: params.id },
    data: { dealId: null },
  });

  return NextResponse.json({ ok: true });
}
