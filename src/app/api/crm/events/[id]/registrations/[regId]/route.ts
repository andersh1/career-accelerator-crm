import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; regId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("attended" in body) {
    data.attendedAt = body.attended ? new Date() : null;
  }

  const reg = await prisma.eventRegistration.update({
    where: { id: params.regId },
    data,
  });
  return NextResponse.json(reg);
}
