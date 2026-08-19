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
    deletedAt:    null,
    unsubscribed: false,
    stage:    { notIn: ["ENROLLED", "LOST"] },
    leadType: { notIn: ["CONTACT", "PARTNER"] },
  };
  if (body.stage) {
    if (["ENROLLED", "LOST"].includes(body.stage)) {
      return NextResponse.json({ error: "Cannot blast ENROLLED or LOST leads" }, { status: 400 });
    }
    where.stage = body.stage;
  }
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
      const unsubUrl = `${process.env.NEXTAUTH_URL ?? "https://crm.vantagecareer.co"}/api/crm/unsubscribe?email=${encodeURIComponent(lead.email)}`;
      const personalizedBody = body.body
        .replace(/\{\{firstName\}\}/gi,       lead.firstName)
        .replace(/\{\{lastName\}\}/gi,        lead.lastName)
        .replace(/\{\{fullName\}\}/gi,        `${lead.firstName} ${lead.lastName}`)
        .replace(/\{\{unsubscribeLink\}\}/gi, unsubUrl);

      // Create activity FIRST so we have its ID for open-rate tracking pixel
      const activity = await prisma.leadActivity.create({
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

      const unsubHtml = `<p style="margin:24px 0 0;font-size:12px;color:#94a3b8;text-align:center;">You're receiving this because you expressed interest in Vantage Career Accelerator. <a href="${unsubUrl}" style="color:#94a3b8;">Unsubscribe</a></p>`;
      const result = await sendSequenceEmail({
        to:         lead.email,
        subject:    body.subject,
        body:       personalizedBody,
        leadName:   `${lead.firstName} ${lead.lastName}`,
        activityId: activity.id,
        unsubHtml,
      });

      if (!result.ok) throw new Error(result.error ?? "Send failed");
      sent++;
    } catch (e) {
      console.error(`Blast email failed for ${lead.email}:`, e);
      failed++;
    }
  }

  return NextResponse.json({ sent, failed, total: leads.length });
}
