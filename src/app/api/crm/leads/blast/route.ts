/**
 * POST /api/crm/leads/blast — send a one-off email to a filtered segment of leads
 * Body: { subject, body, stage?, source?, priority?, tags?, testMode }
 * testMode=true → only returns the count, doesn't send
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendSequenceEmail } from "@/lib/email";

function requireCrmAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  const u = (session as { user?: { role?: string; crmRole?: string } }).user;
  return !session || u?.role !== "ADMIN" || u?.crmRole !== "ADMIN";
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (requireCrmAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    subject: string;
    body: string;
    stage?: string;
    source?: string;
    priority?: string;
    tags?: string[];
    testMode?: boolean;
  };

  if (!body.subject?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: "Subject and body are required" }, { status: 400 });
  }

  // Build filter
  const where: Record<string, unknown> = {
    deletedAt: null,
    stage: { notIn: ["ENROLLED", "LOST"] },
  };
  if (body.stage)    where.stage    = body.stage;
  if (body.source)   where.source   = body.source;
  if (body.priority) where.priority = body.priority;
  if (body.tags?.length) where.tags = { hasSome: body.tags };

  const leads = await prisma.lead.findMany({
    where,
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  if (body.testMode) {
    return NextResponse.json({ count: leads.length, preview: leads.slice(0, 5) });
  }

  if (leads.length === 0) {
    return NextResponse.json({ error: "No leads match the selected filters" }, { status: 400 });
  }

  const senderName = (session as { user?: { name?: string } }).user?.name ?? "Dan";
  let sent = 0;
  let failed = 0;

  for (const lead of leads) {
    try {
      // Personalize: replace {{firstName}} etc.
      const personalizedBody = body.body
        .replace(/\{\{firstName\}\}/gi, lead.firstName)
        .replace(/\{\{lastName\}\}/gi,  lead.lastName)
        .replace(/\{\{fullName\}\}/gi,  `${lead.firstName} ${lead.lastName}`);

      await sendSequenceEmail({
        to:       lead.email,
        subject:  body.subject,
        body:     personalizedBody + `\n\n---\nYou're receiving this because you expressed interest in 10x Career Accelerator. [Unsubscribe](${process.env.NEXTAUTH_URL ?? "https://career-accelerator-lms.vercel.app"}/api/crm/unsubscribe?email=${encodeURIComponent(lead.email)})`,
        leadName: `${lead.firstName} ${lead.lastName}`,
      });

      // Log as EMAIL activity
      await prisma.leadActivity.create({
        data: {
          leadId:    lead.id,
          type:      "EMAIL",
          subject:   body.subject,
          content:   personalizedBody.slice(0, 500),
          emailTo:   lead.email,
          source:    "BLAST",
          createdBy: (session as { user?: { email?: string } }).user?.email ?? undefined,
        },
      });

      sent++;
    } catch (e) {
      console.error(`Blast email failed for ${lead.email}:`, e);
      failed++;
    }
  }

  return NextResponse.json({ sent, failed, total: leads.length });
}
