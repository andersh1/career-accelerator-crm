import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH /api/crm/students/[id]  { cohortId, cohort }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const crmRole = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || crmRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const updated = await prisma.user.update({
    where: { id: params.id },
    data: {
      ...(body.cohortId !== undefined && { cohortId: body.cohortId }),
      ...(body.cohort   !== undefined && { cohort:   body.cohort }),
    },
    select: { id: true, name: true, email: true, cohort: true, cohortId: true },
  });

  return NextResponse.json(updated);
}
