import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { sendStudentInviteEmail } from "@/lib/email";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { cohortId, cohortName, sendInvite = true } = await req.json();

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead)               return NextResponse.json({ error: "Lead not found" },    { status: 404 });
  if (lead.enrolledUserId) return NextResponse.json({ error: "Already enrolled" }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email: lead.email } });
  if (existing) {
    await prisma.lead.update({
      where: { id: params.id },
      data: { stage: "ENROLLED", enrolledUserId: existing.id, updatedAt: new Date() },
    });
    await prisma.leadActivity.create({
      data: {
        leadId:    params.id,
        type:      "ENROLLED",
        content:   `Linked to existing student account: ${existing.email}`,
        createdBy: (session as { user: { id: string } }).user.id,
      },
    });
    return NextResponse.json({ user: existing, alreadyExisted: true });
  }

  const tempPassword = randomBytes(12).toString("hex");
  const hashed       = await bcrypt.hash(tempPassword, 12);

  const cohort = cohortId
    ? await prisma.cohort.findUnique({ where: { id: cohortId }, select: { name: true } })
    : null;

  const user = await prisma.user.create({
    data: {
      name:     `${lead.firstName} ${lead.lastName}`,
      email:    lead.email,
      password: hashed,
      role:     "STUDENT",
      cohort:   cohortName ?? cohort?.name ?? null,
      cohortId: cohortId ?? null,
    },
  });

  const resetToken = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId:    user.id,
      token:     resetToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.lead.update({
    where: { id: params.id },
    data: { stage: "ENROLLED", enrolledUserId: user.id, updatedAt: new Date() },
  });

  await prisma.leadActivity.create({
    data: {
      leadId:    params.id,
      type:      "ENROLLED",
      content:   `Converted to student.${cohort?.name ? ` Cohort: ${cohort.name}.` : ""} Invite ${sendInvite ? "sent" : "skipped"}.`,
      createdBy: (session as { user: { id: string } }).user.id,
    },
  });

  if (sendInvite) {
    const lmsUrl   = process.env.LMS_URL ?? "https://career-accelerator-lms.vercel.app";
    const resetUrl = `${lmsUrl}/reset-password?token=${resetToken}`;
    await sendStudentInviteEmail({
      to:          user.email,
      studentName: user.name,
      resetUrl,
      cohort:      cohort?.name ?? cohortName ?? undefined,
    }).catch(() => {});
  }

  return NextResponse.json({ user, alreadyExisted: false });
}
