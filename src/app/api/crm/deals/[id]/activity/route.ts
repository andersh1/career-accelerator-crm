import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type TypedSession = { user?: { crmRole?: string; email?: string } } | null;

// POST /api/crm/deals/[id]/activity — add a DealActivity
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions) as TypedSession;
  const role = session?.user?.crmRole;
  if (!session || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { type, content } = body;

  const allowed = ["NOTE", "CALL", "MEETING", "EMAIL", "STATUS_CHANGE"];
  if (!type || !allowed.includes(type)) {
    return NextResponse.json({ error: "Valid type required: NOTE, CALL, MEETING, EMAIL" }, { status: 400 });
  }

  const deal = await prisma.deal.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const userEmail = session?.user?.email ?? null;

  const activity = await prisma.dealActivity.create({
    data: {
      dealId: params.id,
      type,
      content: content ?? null,
      createdBy: userEmail,
    },
  });

  return NextResponse.json(activity, { status: 201 });
}
