import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requireAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return !session || (session as { user?: { role?: string } }).user?.role !== "ADMIN";
}

export async function PATCH(req: NextRequest, { params }: { params: { enrollmentId: string } }) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { status } = await req.json() as { status: string };
  const VALID_STATUSES = ["ACTIVE", "PAUSED", "CANCELLED"];
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const enrollment = await prisma.emailSequenceEnrollment.update({
    where: { id: params.enrollmentId },
    data: {
      status,
      ...(status === "CANCELLED" ? { completedAt: new Date() } : {}),
    },
  });
  return NextResponse.json(enrollment);
}
