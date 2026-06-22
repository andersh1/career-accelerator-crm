import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail, CRM_URL } from "@/lib/email";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email?.trim()) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, name: true, email: true, role: true },
  });

  // Always return success to avoid leaking whether an email exists
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ ok: true });
  }

  // Invalidate old tokens
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  });

  const resetUrl = `${CRM_URL}/reset-password?token=${token}`;
  await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });

  return NextResponse.json({ ok: true });
}
