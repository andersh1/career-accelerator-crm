import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendGraduationEmail } from "@/lib/email";

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
        select: { id: true, name: true, email: true, certificateIssuedAt: true },
      },
    },
  });
  if (!cohort) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  let emailsSent = 0;
  let certsIssued = 0;
  const errors: string[] = [];

  for (const student of cohort.users) {
    try {
      const isNewGrad = !student.certificateIssuedAt;
      if (isNewGrad) {
        await prisma.user.update({ where: { id: student.id }, data: { certificateIssuedAt: now } });
        certsIssued++;
        await sendGraduationEmail({ to: student.email, studentName: student.name, cohortName: cohort.name });
        await prisma.notification.create({
          data: {
            userId: student.id,
            type:   "APPROVED",
            title:  "🎓 Congratulations, Graduate!",
            body:   `You've completed the ${cohort.name} cohort.`,
            href:   "/certificate",
          },
        });
        emailsSent++;
      }
    } catch (err) {
      errors.push(`${student.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await prisma.cohort.update({ where: { id: params.id }, data: { isActive: false } });

  return NextResponse.json({ ok: true, emailsSent, certsIssued, errors });
}
