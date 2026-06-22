import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions);
  const u = (session?.user as { crmRole?: string } | undefined);
  if (!u || u.crmRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as { password?: string; crmRole?: string };

  // Case 1: change crmRole
  if (body.crmRole !== undefined) {
    const newCrmRole: "ADMIN" | "MEMBER" | null =
      body.crmRole === "ADMIN" ? "ADMIN" :
      body.crmRole === "MEMBER" ? "MEMBER" : null;

    const target = await prisma.user.findUnique({ where: { id: params.userId }, select: { id: true } });
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const updated = await prisma.user.update({
      where:  { id: params.userId },
      data:   { crmRole: newCrmRole },
      select: { id: true, name: true, email: true, crmRole: true },
    });
    return NextResponse.json({ ok: true, user: updated });
  }

  // Case 2: reset password
  if (body.password !== undefined) {
    if (!body.password || body.password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    const target = await prisma.user.findUnique({ where: { id: params.userId }, select: { id: true } });
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const hash = await bcrypt.hash(body.password, 10);
    await prisma.user.update({ where: { id: params.userId }, data: { password: hash } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions);
  const u = (session?.user as { crmRole?: string; id?: string } | undefined);
  if (!u || u.crmRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentUserId = (session as { user: { id: string } }).user.id;
  if (params.userId === currentUserId) {
    return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where:  { id: params.userId },
    select: { id: true, crmRole: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Set crmRole to null — do NOT delete the user (they may still be an LMS student)
  await prisma.user.update({
    where: { id: params.userId },
    data:  { crmRole: null },
  });

  return NextResponse.json({ ok: true });
}
