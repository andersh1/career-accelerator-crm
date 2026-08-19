import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type TypedSession = { user?: { crmRole?: string; email?: string } } | null;

function getCrmRole(session: TypedSession): string | undefined {
  return session?.user?.crmRole;
}

// GET /api/crm/deals/[id] — single deal with full details
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions) as TypedSession;
  const role = getCrmRole(session);
  if (!session || (role !== "ADMIN" && role !== "MEMBER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: {
      contactLead: {
        select: { id: true, firstName: true, lastName: true, email: true, company: true },
      },
      participants: {
        select: { id: true, firstName: true, lastName: true, email: true, stage: true, leadType: true },
      },
      activities: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(deal);
}

// PATCH /api/crm/deals/[id] — update any field
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions) as TypedSession;
  const role = getCrmRole(session);
  if (!session || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deal = await prisma.deal.findUnique({ where: { id: params.id }, select: { id: true, status: true } });
  if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const {
    title, orgName, status, contactLeadId, seats, pricePerSeat, totalValue,
    paymentType, assignedTo, notes, proposalSentAt, signedAt, startDate,
  } = body;

  const updated = await prisma.deal.update({
    where: { id: params.id },
    data: {
      ...(title        !== undefined && { title }),
      ...(orgName      !== undefined && { orgName }),
      ...(status       !== undefined && { status }),
      ...(contactLeadId !== undefined && { contactLeadId: contactLeadId || null }),
      ...(seats        !== undefined && { seats: seats ?? null }),
      ...(pricePerSeat !== undefined && { pricePerSeat: pricePerSeat ?? null }),
      ...(totalValue   !== undefined && { totalValue: totalValue ?? null }),
      ...(paymentType  !== undefined && { paymentType }),
      ...(assignedTo   !== undefined && { assignedTo: assignedTo || null }),
      ...(notes        !== undefined && { notes: notes || null }),
      ...(proposalSentAt !== undefined && { proposalSentAt: proposalSentAt ? new Date(proposalSentAt) : null }),
      ...(signedAt     !== undefined && { signedAt: signedAt ? new Date(signedAt) : null }),
      ...(startDate    !== undefined && { startDate: startDate ? new Date(startDate) : null }),
    },
  });

  // Auto-create STATUS_CHANGE activity when status changes
  if (status !== undefined && status !== deal.status) {
    const userEmail = session?.user?.email ?? null;
    await prisma.dealActivity.create({
      data: {
        dealId: params.id,
        type: "STATUS_CHANGE",
        content: `Status changed from ${deal.status} to ${status}`,
        createdBy: userEmail,
      },
    });
  }

  return NextResponse.json(updated);
}

// DELETE /api/crm/deals/[id] — delete deal
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions) as TypedSession;
  const role = getCrmRole(session);
  if (!session || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.deal.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
