import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM   = process.env.EMAIL_FROM ?? "10x Career Accelerator <onboarding@resend.dev>";
const BASE   = process.env.NEXTAUTH_URL ?? "https://career-accelerator-crm.vercel.app";

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
        role:     "ADMIN",     // LMS role — needed for NextAuth credentials flow
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

  if (resend) {
    const roleBadgeColor  = assignedCrmRole === "ADMIN" ? "#7c3aed" : "#2563eb";
    const roleLabel       = assignedCrmRole === "ADMIN" ? "Admin" : "Member";
    const credentialsHtml = isNew && tempPassword
      ? `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:24px 0;">
          <p style="margin:0 0 8px;font-size:13px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Your login details</p>
          <p style="margin:0 0 6px;font-size:15px;color:#1e293b;"><strong>URL:</strong> <a href="${BASE}/login" style="color:#2563eb;">${BASE}/login</a></p>
          <p style="margin:0 0 6px;font-size:15px;color:#1e293b;"><strong>Email:</strong> ${email}</p>
          <p style="margin:0;font-size:15px;color:#1e293b;"><strong>Temporary password:</strong> <code style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:6px;font-size:14px;">${tempPassword}</code></p>
        </div>
        <p style="margin:0 0 16px;color:#64748b;font-size:14px;line-height:1.7;">
          Please change your password after your first login by going to <strong>Settings → Change Password</strong>.
        </p>`
      : `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:24px 0;">
          <p style="margin:0 0 8px;font-size:13px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Login</p>
          <p style="margin:0 0 6px;font-size:15px;color:#1e293b;"><strong>URL:</strong> <a href="${BASE}/login" style="color:#2563eb;">${BASE}/login</a></p>
          <p style="margin:0;font-size:15px;color:#1e293b;">Use your existing password to sign in.</p>
        </div>`;

    const { error: sendError } = await resend.emails.send({
      from:    FROM,
      to:      email,
      subject: "You've been invited to 10x Career Accelerator CRM",
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f0f4ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:linear-gradient(135deg,#0a1628,#1e3a8a);padding:28px 32px;">
        <p style="margin:0;color:#93c5fd;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">10x Career Accelerator</p>
        <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:800;">You're invited to the CRM</h1>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">Hi ${name},</p>
        <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">
          You've been added to the <strong>10x Career Accelerator CRM</strong> as a
          <span style="display:inline-block;background:${roleBadgeColor};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;vertical-align:middle;margin-left:4px;">${roleLabel}</span>.
        </p>
        ${credentialsHtml}
        <a href="${BASE}/login" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:12px;">Log in to CRM →</a>
      </td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #f1f5f9;background:#f8fafc;">
        <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">10x Career Accelerator Program</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
    });
    if (sendError) {
      emailError = sendError.message;
    } else {
      emailSent = true;
    }
  }

  return NextResponse.json({
    user: returnUser,
    isNew,
    tempPassword,   // null for existing users
    emailSent,
    emailError,
  });
}
