import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail, CRM_URL } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email?.trim()) return NextResponse.json({ error: "Email required" }, { status: 400 });

  // Rate limited on both the sender and the target. Unlimited, this route let
  // anyone send unlimited reset mail to any CRM account, which is Dan's inbox,
  // David's and Caleb's, from our own sending domain. No account is
  // compromised by that, but the mailbox is unusable and the domain takes the
  // deliverability hit. Found in the 2026-11-06 audit.
  //
  // The reply is the same 200 either way, for the same reason the "user not
  // found" branch below returns one: never tell a stranger whether an address
  // is in our database, and never tell them they have hit a limit.
  const addr = email.trim().toLowerCase();
  const ip   = req.headers.get("x-forwarded-for") ?? "unknown";
  const [byIp, byEmail] = await Promise.all([
    rateLimit(`forgot:ip:${ip}`, 10, 60 * 60 * 1000),
    rateLimit(`forgot:email:${addr}`, 3, 60 * 60 * 1000),
  ]);
  if (byIp.limited || byEmail.limited) {
    return NextResponse.json({ ok: true });
  }

  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, name: true, email: true, crmRole: true },
  });

  // Always return success to avoid leaking whether an email exists
  if (!user) {
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
  await sendPasswordResetEmail({ to: user.email, name: user.name ?? "there", resetUrl });

  return NextResponse.json({ ok: true });
}
