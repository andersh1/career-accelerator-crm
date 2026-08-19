import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { attended, registrationIds } = await req.json().catch(() => ({}));

  const now = attended !== false ? new Date() : null;

  const where = registrationIds?.length
    ? { eventId: params.id, id: { in: registrationIds } }
    : { eventId: params.id };

  const result = await prisma.eventRegistration.updateMany({
    where,
    data: { attendedAt: now },
  });

  return NextResponse.json({ updated: result.count });
}
