import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// POST /api/crm/tickets/[id]/messages — admin reply or internal note
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const adminSession = session as { user?: { id?: string; name?: string; role?: string } } | null;
  if (!adminSession?.user || adminSession.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ticket = await prisma.supportTicket.findUnique({
    where:   { id: params.id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { content, isInternal } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 });

  const internal = isInternal === true;

  const [message] = await prisma.$transaction([
    prisma.ticketMessage.create({
      data: {
        ticketId:   params.id,
        authorId:   adminSession.user.id!,
        authorName: adminSession.user.name ?? "Support",
        authorRole: "ADMIN",
        content:    content.trim(),
        isInternal: internal,
      },
    }),
    prisma.supportTicket.update({
      where: { id: params.id },
      data:  {
        status:         internal ? ticket.status : "WAITING", // set to WAITING = awaiting student reply
        lastActivityAt: new Date(),
        updatedAt:      new Date(),
      },
    }),
  ]);

  // Always send in-app notification for non-internal replies
  if (!internal) {
    await prisma.notification.create({
      data: {
        userId: ticket.user.id,
        type:   "SUPPORT",
        title:  `Reply on ticket #${ticket.ticketNumber}`,
        body:   content.slice(0, 100),
        href:   `/support/${ticket.id}`,
      },
    }).catch(() => {});
  }

  // Email student if NOT an internal note and Resend is configured
  if (!internal && ticket.user.email && resend) {
    const lmsUrl = process.env.LMS_URL ?? "https://lms.vantagecareer.co";
    await resend.emails.send({
      from:    "Vantage Career Accelerator Support <noreply@career-accelerator.app>",
      to:      ticket.user.email,
      subject: `Re: [Ticket #${ticket.ticketNumber}] ${ticket.subject}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#0d1b3e;padding:20px 24px;border-radius:12px 12px 0 0">
            <h2 style="color:white;margin:0;font-size:18px">Support Reply — Ticket #${ticket.ticketNumber}</h2>
          </div>
          <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
            <p style="margin:0 0 8px">Hi ${ticket.user.name},</p>
            <p style="margin:0 0 16px">Our support team has replied to your ticket:</p>
            <div style="background:white;border-left:4px solid #2563eb;padding:16px;border-radius:0 8px 8px 0;white-space:pre-wrap;margin-bottom:16px">${content}</div>
            <a href="${lmsUrl}/support/${ticket.id}"
               style="display:inline-block;background:#2563eb;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">
              View & Reply →
            </a>
            <p style="margin-top:20px;font-size:12px;color:#94a3b8">
              This is an automated message from Vantage Career Accelerator Support.<br/>
              To reply, visit your support portal — do not reply to this email.
            </p>
          </div>
        </div>
      `,
    }).catch(() => {});
  }

  return NextResponse.json(message, { status: 201 });
}
