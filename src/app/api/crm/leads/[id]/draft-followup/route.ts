/**
 * POST /api/crm/leads/[id]/draft-followup
 * Claude reads the lead's recent timeline + stage and drafts a follow-up email.
 * Returns { subject, body } for prefilling the composer — nothing is sent.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const crmRole = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || (crmRole !== "ADMIN" && crmRole !== "MEMBER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "notConfigured" }, { status: 503 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    select: {
      firstName: true, lastName: true, stage: true, source: true, notes: true,
      company: true, jobTitle: true,
      activities: {
        orderBy: { createdAt: "desc" }, take: 8,
        select: { type: true, subject: true, content: true, createdAt: true },
      },
    },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const senderName = session.user?.name?.split(" ")[0] ?? "Caleb";
  const timeline = lead.activities
    .map(a => `${a.createdAt.toISOString().slice(0, 10)} [${a.type}]${a.subject ? ` ${a.subject}:` : ""} ${(a.content ?? "").slice(0, 400)}`)
    .join("\n");

  const client = new Anthropic();
  const resp = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 900,
    thinking: { type: "adaptive" },
    system: `You draft follow-up emails for the Vantage Career Accelerator (a premium career program). ${senderName} is writing to a prospective participant. Read the recent timeline and draft the natural next email: warm, human, specific to what was actually discussed, no corporate filler, no em-dashes, short (under 130 words). Reference the most recent real interaction. One clear next step. Sign off with just the first name "${senderName}".

Return ONLY valid JSON, no markdown fences: {"subject": "...", "body": "..."} — body is plain text with blank lines between paragraphs.`,
    messages: [{
      role: "user",
      content: `Lead: ${lead.firstName} ${lead.lastName}${lead.jobTitle ? `, ${lead.jobTitle}` : ""}${lead.company ? ` at ${lead.company}` : ""}\nPipeline stage: ${lead.stage}\nSource: ${lead.source ?? "unknown"}\nNotes on record: ${(lead.notes ?? "none").slice(0, 600)}\n\nRecent timeline (newest first):\n${timeline || "(no activity yet)"}`,
    }],
  });

  const text = resp.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
  try {
    const draft = JSON.parse(text.trim().replace(/^```json?\s*|\s*```$/g, ""));
    if (!draft.subject || !draft.body) throw new Error("bad shape");
    return NextResponse.json(draft);
  } catch {
    return NextResponse.json({ error: "Could not draft email" }, { status: 502 });
  }
}
