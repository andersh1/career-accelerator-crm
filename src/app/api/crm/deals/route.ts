import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type TypedSession = { user?: { crmRole?: string; email?: string } } | null;

function getCrmRole(session: TypedSession): string | undefined {
  return (session as TypedSession)?.user?.crmRole;
}

// GET /api/crm/deals — list all deals
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions) as TypedSession;
  const role = getCrmRole(session);
  if (!session || (role !== "ADMIN" && role !== "MEMBER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const deals = await prisma.deal.findMany({
    where: status ? { status } : undefined,
    select: {
      id: true,
      title: true,
      orgName: true,
      status: true,
      seats: true,
      pricePerSeat: true,
      totalValue: true,
      paymentType: true,
      assignedTo: true,
      notes: true,
      proposalSentAt: true,
      signedAt: true,
      startDate: true,
      createdAt: true,
      contactLead: {
        select: { id: true, firstName: true, lastName: true, company: true, email: true },
      },
      _count: { select: { participants: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(deals);
}

// POST /api/crm/deals — create a deal
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as TypedSession;
  const role = getCrmRole(session);
  if (!session || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { title, orgName, status, contactLeadId, seats, pricePerSeat, totalValue, paymentType, assignedTo, notes, proposalSentAt, signedAt, startDate } = body;

  if (!title || !orgName) {
    return NextResponse.json({ error: "title and orgName are required" }, { status: 400 });
  }

  const deal = await prisma.deal.create({
    data: {
      title,
      orgName,
      status: status ?? "PROSPECTING",
      contactLeadId: contactLeadId ?? null,
      seats: seats ?? null,
      pricePerSeat: pricePerSeat ?? null,
      totalValue: totalValue ?? null,
      paymentType: paymentType ?? "ORG_INVOICE",
      assignedTo: assignedTo ?? null,
      notes: notes ?? null,
      proposalSentAt: proposalSentAt ? new Date(proposalSentAt) : null,
      signedAt: signedAt ? new Date(signedAt) : null,
      startDate: startDate ? new Date(startDate) : null,
    },
  });

  return NextResponse.json(deal, { status: 201 });
}
