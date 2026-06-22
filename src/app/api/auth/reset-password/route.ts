import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const { token, password } = await req.json();
  if (!token || !password) return NextResponse.json({ error: "Token and password required" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

  const record = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: { select: { id: true, role: true } } },
  });

  if (!record) return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
  if (record.usedAt) return NextResponse.json({ error: "This link has already been used" }, { status: 400 });
  if (record.expiresAt < new Date()) return NextResponse.json({ error: "This link has expired. Request a new one." }, { status: 400 });

  const hash = await bcrypt.hash(password, 10);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { password: hash } }),
    prisma.passwordResetToken.update({ where: { token }, data: { usedAt: new Date() } }),
  ]);

  return NextResponse.json({ ok: true });
}
