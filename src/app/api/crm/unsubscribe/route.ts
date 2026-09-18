/**
 * Unsubscribe from Vantage marketing email.
 *
 * GET  — shows a confirmation page. Changes NOTHING.
 * POST — performs the unsubscribe.
 *
 * The split is the whole point. This used to unsubscribe on GET, and corporate
 * mail security (Outlook Safe Links, Proofpoint, Mimecast) prefetches every
 * link in an inbound message — so anyone at a company running one of those was
 * silently unsubscribed the moment our mail landed, without ever clicking.
 * Scanners do not POST, so a confirm step makes the link safe to prefetch.
 *
 * Links carry a signed token rather than the recipient's address, so one
 * person's link cannot be edited into someone else's, and no email address
 * travels in a URL. Old ?email= links from already-sent mail still work — they
 * go through the same confirm page, so they are safe now too.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token";

async function resolveLead(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  const leadId = verifyUnsubscribeToken(token);
  if (leadId) {
    return prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, firstName: true, email: true, unsubscribed: true },
    });
  }
  // Legacy links already sitting in people's inboxes.
  const email = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();
  if (!email) return null;
  return prisma.lead.findFirst({
    where: { email },
    select: { id: true, firstName: true, email: true, unsubscribed: true },
  });
}

export async function GET(req: NextRequest) {
  const lead = await resolveLead(req);
  const qs = req.nextUrl.search;

  if (lead?.unsubscribed) {
    return html(page({
      icon: "✅",
      title: "You're already unsubscribed",
      message: "You won't receive marketing email from Vantage Career. Nothing more to do.",
    }));
  }

  return html(page({
    icon: "✉️",
    title: "Unsubscribe from Vantage Career?",
    message: lead
      ? `We'll stop sending marketing email to ${lead.email}. You'll still get anything you've specifically asked us for.`
      : "We'll stop sending you marketing email.",
    form: qs,
  }));
}

export async function POST(req: NextRequest) {
  const lead = await resolveLead(req);

  // Never say "we couldn't find you" — that confirms to a stranger whether an
  // address is in our database. The outcome they want is the same either way.
  if (!lead) {
    return html(page({
      icon: "✅",
      title: "You've been unsubscribed",
      message: "You won't receive marketing email from Vantage Career.",
    }));
  }

  if (!lead.unsubscribed) {
    await prisma.lead.update({
      where: { id: lead.id },
      // The flag is what every send path checks; the stage is what the team
      // sees on the board. Set both, or the record and the behaviour diverge.
      data: { unsubscribed: true, stage: "UNSUBSCRIBED" },
    });
    await prisma.emailSequenceEnrollment.updateMany({
      where: { leadId: lead.id, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: "NOTE",
        content: "🚫 Unsubscribed via the link in an email — moved to Unsubscribed and all active sequences cancelled.",
        source: "UNSUBSCRIBE",
      },
    });
  }

  return html(page({
    icon: "✅",
    title: "You've been unsubscribed",
    message: `You won't receive marketing email from Vantage Career${lead.firstName ? `, ${lead.firstName}` : ""}. If this was a mistake, just reply to any email from us.`,
  }));
}

const html = (body: string) =>
  new NextResponse(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });

function page({ icon, title, message, form }: {
  icon: string; title: string; message: string; form?: string;
}) {
  const button = form !== undefined
    ? `<form method="POST" action="/api/crm/unsubscribe${form}" style="margin:24px 0 0;">
         <button type="submit" style="background:#086c64;color:#fff;border:0;border-radius:999px;
           padding:13px 30px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;">
           Yes, unsubscribe me
         </button>
       </form>
       <p style="margin:14px 0 0;font-size:13px;color:#949598;">If you landed here by accident, just close this page — nothing has changed.</p>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>${title}</title>
<style>
  body{font-family:'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
       background:#f1efe8;display:flex;align-items:center;justify-content:center;
       min-height:100vh;margin:0;padding:20px;}
  .card{background:#fff;border:1px solid #e4e0d6;border-radius:18px;padding:44px 40px;
        max-width:440px;text-align:center;box-shadow:0 2px 12px rgba(20,33,31,.06);}
  h1{color:#14211f;font-size:21px;font-weight:800;margin:0 0 12px;line-height:1.35;}
  p{color:#5a6663;margin:0;line-height:1.6;font-size:15px;}
</style></head><body>
<div class="card">
  <div style="font-size:38px;margin-bottom:14px;">${icon}</div>
  <h1>${title}</h1>
  <p>${message}</p>
  ${button}
</div></body></html>`;
}
