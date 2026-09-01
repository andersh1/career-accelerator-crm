import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendStudentInviteEmail } from "@/lib/email";
import crypto from "crypto";

const LMS_URL = process.env.LMS_URL ?? "https://lms.vantagecareer.co";

// POST /api/crm/cohorts/[id]/publish
// Publishes all unpublished students in the cohort to the LMS:
//   - New students (no onboardedAt): creates a PasswordResetToken + sends invite email
//   - Returning students (already onboarded): marks published without re-emailing
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cohort = await prisma.cohort.findUnique({
    where: { id: params.id },
    include: {
      users: {
        where: { role: "STUDENT" },
        select: {
          id: true, name: true, email: true,
          onboardedAt: true,
        },
      },
    },
  });

  if (!cohort) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const toPublish = cohort.users;

  let invitesSent = 0;
  const errors: string[] = [];

  for (const student of toPublish) {
    try {
      const isNewStudent = !student.onboardedAt;

      if (isNewStudent) {
        const token = crypto.randomBytes(32).toString("hex");
        await prisma.passwordResetToken.create({
          data: {
            userId: student.id,
            token,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
        const resetUrl = `${LMS_URL}/reset-password?token=${token}`;
        await sendStudentInviteEmail({
          to: student.email,
          studentName: student.name,
          resetUrl,
          cohort: cohort.name,
        });
        // Record that we invited them. Distinct from onboardedAt, which only
        // gets set once the student has actually been through the welcome flow.
        await prisma.user.update({ where: { id: student.id }, data: { invitedAt: new Date() } });
        invitesSent++;
      }

      // Deliberately NOT setting onboardedAt here. Publishing invites a student;
      // it does not mean they have been through onboarding. Stamping it on
      // publish made every fellow skip the welcome sequence — including the
      // Slack step — because the LMS treats a set onboardedAt as "already done".
      // It is set when the student actually finishes the modal.
      if (student.onboardedAt) {
        await prisma.user.update({
          where: { id: student.id },
          data: { onboardedAt: student.onboardedAt },
        });
      }
    } catch (err) {
      errors.push(`${student.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (toPublish.length > 0) {
    await prisma.cRMNotification.create({
      data: {
        type: "LEAD_ENROLLED",
        title: `${toPublish.length} student${toPublish.length !== 1 ? "s" : ""} published to LMS`,
        body: `${invitesSent} invite${invitesSent !== 1 ? "s" : ""} sent · ${cohort.name}`,
        href: "/cohorts",
      },
    });
  }

  // Record the publish itself so the cohort card can show it happened.
  await prisma.cohort.update({
    where: { id: params.id },
    data: { publishedAt: cohort.publishedAt ?? new Date(), invitesSent: { increment: invitesSent } },
  }).catch(() => {});

  return NextResponse.json({
    published: toPublish.length,
    invitesSent,
    errors,
  });
}
