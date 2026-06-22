import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = (session as { user: { id: string } }).user.id;
  const body = await req.json() as { name?: string; currentPassword?: string; newPassword?: string };

  // ── Password change ───────────────────────────────────────────────────────
  if (body.currentPassword !== undefined || body.newPassword !== undefined) {
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Both current and new password are required" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    }

    const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
    const valid  = dbUser?.password ? await bcrypt.compare(currentPassword, dbUser.password) : false;
    if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

    await prisma.user.update({
      where: { id: userId },
      data:  { password: await bcrypt.hash(newPassword, 12) },
    });
    return NextResponse.json({ ok: true });
  }

  // ── Name change ────────────────────────────────────────────────────────────
  const { name } = body;
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const user = await prisma.user.update({
    where: { id: userId },
    data:  { name: name.trim() },
    select: { id: true, name: true, email: true },
  });

  return NextResponse.json(user);
}
