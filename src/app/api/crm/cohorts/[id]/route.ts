import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH /api/crm/cohorts/[id]  { name?, isActive?, capacity? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const updated = await prisma.cohort.update({
    where: { id: params.id },
    data: {
      ...(body.name      !== undefined && { name:      body.name.trim() }),
      ...(body.isActive  !== undefined && { isActive:  body.isActive }),
      ...(body.founderMode !== undefined && { founderMode: !!body.founderMode }),
      ...(body.capacity  !== undefined && { capacity:  body.capacity ? parseInt(body.capacity) : null }),
      ...(body.startDate !== undefined && { startDate: body.startDate ? new Date(body.startDate + "T12:00:00.000Z") : null }),
    },
  });

  return NextResponse.json(updated);
}
