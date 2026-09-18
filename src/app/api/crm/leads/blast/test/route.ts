/**
 * POST /api/crm/leads/blast/test — send ONE blast-path email to ONE address.
 *
 * The blast endpoint itself needs an admin session and mails a filtered set of
 * leads, which makes it a poor thing to poke at when you only want to see what
 * a blast actually looks like — or to check that the List-Unsubscribe headers
 * are really on the wire rather than only in the source.
 *
 * This sends through the same sender the real blast uses, with the same
 * unsubscribe footer and the same headers, to a single validated address. It
 * never reads the lead table for recipients and never accepts a list, so it
 * cannot turn into a second send tool.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendSequenceEmail } from "@/lib/email";
import { unsubscribeUrl } from "@/lib/unsubscribe-token";

async function authorised(req: NextRequest): Promise<boolean> {
  const key = req.nextUrl.searchParams.get("key");
  if (key && process.env.INTERNAL_API_SECRET && key === process.env.INTERNAL_API_SECRET) return true;
  const session = await getServerSession(authOptions);
  return (session?.user as { crmRole?: string } | undefined)?.crmRole === "ADMIN";
}

export async function POST(req: NextRequest) {
  if (!await authorised(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as
    { to?: string; subject?: string; body?: string; leadId?: string };

  const to = body.to?.trim();
  if (!to || !/^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/.test(to)) {
    return NextResponse.json(
      { error: "One valid email address is required" }, { status: 400 });
  }

  /**
   * The unsubscribe link has to be signed against a real lead or it is not a
   * real test. Defaults to the recipient's own lead when they have one, so
   * clicking through exercises the whole path end to end.
   */
  const lead = body.leadId
    ? await prisma.lead.findUnique({ where: { id: body.leadId }, select: { id: true, firstName: true } })
    : await prisma.lead.findFirst({
        where: { email: { equals: to, mode: "insensitive" } },
        select: { id: true, firstName: true },
      });
  if (!lead) {
    return NextResponse.json({
      error: `No lead found for ${to}. Pass leadId to sign the unsubscribe link against a specific lead.`,
    }, { status: 404 });
  }

  const unsubUrl = unsubscribeUrl(lead.id);
  const unsubHtml = `<p style="margin:24px 0 0;font-size:12px;color:#94a3b8;text-align:center;">You're receiving this because you expressed interest in Vantage Career Accelerator. <a href="${unsubUrl}" style="color:#94a3b8;">Unsubscribe</a></p>`;

  const result = await sendSequenceEmail({
    to,
    subject: body.subject?.trim() || "Blast test — checking the unsubscribe headers",
    body: body.body?.trim()
      || `Hi {{firstName}},\n\nThis is a test of the blast send path — same sender, same unsubscribe footer, same headers as a real blast.\n\nOpen this in Gmail, then ⋮ → Show original, and look for List-Unsubscribe near the top. Gmail should also show an Unsubscribe link next to the sender name.\n\nNothing was sent to anyone else.`,
    leadName: lead.firstName ?? "there",
    unsubHtml,
    unsubUrl,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Send failed" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    to,
    signedAgainstLead: lead.id,
    headersSet: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}
