import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requireAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return !session || (session as { user?: { role?: string } }).user?.role !== "ADMIN";
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const seq = await prisma.emailSequence.findUnique({
    where: { id: params.id },
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
      enrollments: {
        include: { lead: { select: { id: true, firstName: true, lastName: true, email: true, stage: true } } },
        orderBy: { startedAt: "desc" },
        take: 50,
      },
    },
  });
  if (!seq) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(seq);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { name?: string; description?: string; isActive?: boolean };
  const seq  = await prisma.emailSequence.update({ where: { id: params.id }, data: body });
  return NextResponse.json(seq);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.emailSequence.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
