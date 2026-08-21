import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await getServerSession(authOptions);
  const crmRole = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || (crmRole !== "ADMIN" && crmRole !== "MEMBER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const userId = (session as { user: { id: string } }).user.id;
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { calendlyUrl: true, officeHoursUrl: true },
  });
  return NextResponse.json({ calendlyUrl: me?.calendlyUrl ?? null, officeHoursUrl: me?.officeHoursUrl ?? null });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const crmRole = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || (crmRole !== "ADMIN" && crmRole !== "MEMBER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = (session as { user: { id: string } }).user.id;
  const body = await req.json() as {
    name?: string; currentPassword?: string; newPassword?: string;
    calendlyUrl?: string | null; officeHoursUrl?: string | null;
  };

  // ── Booking links (Calendly) ──────────────────────────────────────────────
  if (body.calendlyUrl !== undefined || body.officeHoursUrl !== undefined) {
    const clean = (v: string | null | undefined) => {
      const s = v?.trim() || null;
      if (s && !/^https:\/\/calendly\.com\//.test(s)) throw new Error("Must be a https://calendly.com/... link");
      return s;
    };
    try {
      const data: { calendlyUrl?: string | null; officeHoursUrl?: string | null } = {};
      if (body.calendlyUrl   !== undefined) data.calendlyUrl   = clean(body.calendlyUrl);
      if (body.officeHoursUrl !== undefined) data.officeHoursUrl = clean(body.officeHoursUrl);
      await prisma.user.update({ where: { id: userId }, data });
      return NextResponse.json({ ok: true, ...data });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid link" }, { status: 400 });
    }
  }

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
