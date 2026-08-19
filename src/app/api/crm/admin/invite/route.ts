import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { sendCrmInviteEmail } from "@/lib/email";

const BASE = process.env.NEXTAUTH_URL ?? "https://career-accelerator-crm.vercel.app";

function generateTempPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  let pw = "";
  for (let i = 0; i < 16; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const u = session?.user as { role?: string; crmRole?: string } | undefined;
  if (!u || u.crmRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as { name?: string; email?: string; role?: string; crmRole?: string };
  const name  = body.name?.trim();
  const email = body.email?.trim()?.toLowerCase();
  // Accept either `role` or `crmRole` field for flexibility
  const rawRole = body.role ?? body.crmRole;
  const assignedCrmRole: "ADMIN" | "MEMBER" = rawRole === "ADMIN" ? "ADMIN" : "MEMBER";

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  // Check if user already exists
  const existing = await prisma.user.findUnique({ where: { email } });

  let returnUser: { id: string; name: string | null; email: string; crmRole: string | null };
  let tempPassword: string | null = null;
  let isNew = false;

  if (existing) {
    // Update existing user's crmRole — don't delete or recreate them (they may be an LMS student)
    const updated = await prisma.user.update({
      where:  { id: existing.id },
      data:   { crmRole: assignedCrmRole },
      select: { id: true, name: true, email: true, crmRole: true },
    });
    returnUser = updated;
  } else {
    // New user: create with a temp password and LMS admin role (required for NextAuth)
    tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    const created = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role:     assignedCrmRole === "ADMIN" ? "ADMIN" : "MEMBER",
        crmRole:  assignedCrmRole,
      },
      select: { id: true, name: true, email: true, crmRole: true },
    });
    returnUser = created;
    isNew = true;
  }

  // Send invite email
  let emailSent  = false;
  let emailError: string | null = null;

  try {
    await sendCrmInviteEmail({
      to:           email,
      name:         name!,
      crmRole:      assignedCrmRole,
      isNew,
      tempPassword: tempPassword ?? undefined,
      loginUrl:     `${BASE}/login`,
    });
    emailSent = true;
  } catch (err) {
    emailError = err instanceof Error ? err.message : "Failed to send email";
  }

  return NextResponse.json({
    user: returnUser,
    isNew,
    tempPassword,   // null for existing users
    emailSent,
    emailError,
  });
}
