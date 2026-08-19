/**
 * POST /api/skill/session
 * Authenticated via SKILL_API_KEY (Bearer token) — no browser session required.
 * Dan's Claude Code skill calls this after a 1-on-1 to get AI coaching analysis
 * and a draft follow-up email, using prior session notes as context.
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function checkApiKey(req: NextRequest) {
  const auth  = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token === process.env.SKILL_API_KEY && token.length > 0;
}

export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const { query, transcript } = await req.json() as { query?: string; transcript?: string };

  if (!query?.trim()) {
    return NextResponse.json({ error: "query is required (student name or email)" }, { status: 400 });
  }
  if (!transcript?.trim()) {
    return NextResponse.json({ error: "transcript is required" }, { status: 400 });
  }

  // Find lead by email or first/last name
  const leads = await prisma.lead.findMany({
    where: {
      deletedAt: null,
      OR: [
        { email:      { contains: query.trim(), mode: "insensitive" } },
        { firstName:  { contains: query.trim(), mode: "insensitive" } },
        { lastName:   { contains: query.trim(), mode: "insensitive" } },
      ],
    },
    select: {
      id: true, firstName: true, lastName: true, email: true, stage: true, notes: true,
      enrolledUser: { select: { id: true } },
    },
    take: 5,
  });

  if (leads.length === 0) {
    return NextResponse.json(
      { error: `No lead found matching "${query}". Check the CRM and try their email.` },
      { status: 404 },
    );
  }
  if (leads.length > 1) {
    return NextResponse.json({
      error: "Multiple leads matched — be more specific (use their email).",
      matches: leads.map(l => ({ id: l.id, name: `${l.firstName} ${l.lastName}`, email: l.email })),
    }, { status: 409 });
  }

  const lead = leads[0];

  // Pull last 5 prior session notes for context
  const priorSessions = await prisma.leadActivity.findMany({
    where: { leadId: lead.id, type: { in: ["MEETING", "CALL", "NOTE"] } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { type: true, content: true, createdAt: true },
  });

  // Pull recent prework submissions if they're an enrolled student
  let preworkContext = "";
  if (lead.enrolledUser) {
    const submissions = await prisma.preworkSubmission.findMany({
      where:   { userId: lead.enrolledUser.id },
      include: {
        answers:  { include: { question: { select: { question: true } } } },
        module:   { select: { number: true, title: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: 3,
    });
    if (submissions.length > 0) {
      preworkContext = submissions.map(s =>
        `Module ${s.module.number} — ${s.module.title}:\n` +
        s.answers.map(a => `  Q: ${a.question.question}\n  A: ${a.answer}`).join("\n"),
      ).join("\n\n");
    }
  }

  const priorContext = priorSessions.length > 0
    ? priorSessions.map(s =>
        `[${s.createdAt.toLocaleDateString("en-US")} — ${s.type}]\n${s.content ?? ""}`,
      ).join("\n\n---\n\n")
    : "No prior sessions on record.";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are a coaching assistant for Dan Sommer, who runs a career accelerator program that teaches college students how to land their first job by building a real proof-of-work project (their "wedge") and running a structured networking process (the "warm intro pipeline"). The program lasts 8 weeks across 8 modules. Dan does weekly 1-on-1 coaching calls with each student.

STUDENT: ${lead.firstName} ${lead.lastName} (${lead.email})
CRM STAGE: ${lead.stage}
NOTES ON FILE: ${lead.notes ?? "none"}

PRIOR SESSION NOTES (newest first):
${priorContext}

${preworkContext ? `RECENT PREWORK SUBMISSIONS:\n${preworkContext}\n\n` : ""}TODAY'S TRANSCRIPT:
---
${transcript.slice(0, 15000)}
---

Analyze this coaching session and return a JSON object with exactly these fields:

{
  "summary": "2-3 sentence summary of where the student is and what moved today",
  "sessionNotes": "Rich coaching notes (5-8 sentences). What was discussed, how the student is progressing on their wedge and networking process, breakthroughs, blockers, commitments they made. Detailed enough that Dan can recall the full conversation in 3 months.",
  "studentProgress": ["specific observation about their project or mindset"],
  "blockers": ["anything slowing them down, confusing them, or holding them back"],
  "nextSteps": [
    { "title": "concrete action", "owner": "STUDENT or DAN", "dueInDays": 3 }
  ],
  "draftEmail": {
    "subject": "Following up on our session — [topic]",
    "body": "Full email body Dan sends to the student. Warm, direct, personal. Reference specific things from the call. End with 1-2 clear next steps they own. Write it as Dan speaking — not formal, not templated. Do not use placeholders like [Name] — use the actual student name."
  }
}

Rules:
- sessionNotes should read like notes a good coach keeps, not a transcript summary
- The draft email body should sound like Dan — conversational, encouraging, high-energy, direct
- nextSteps: be specific. Bad: "work on project". Good: "draft the first version of the experiment hypothesis doc and share with Dan by Friday"
- Return ONLY valid JSON, no markdown fences, no extra text`;

  const message = await client.messages.create({
    model:      "claude-opus-4-8",
    max_tokens: 2500,
    messages:   [{ role: "user", content: prompt }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "";
  let parsed: Record<string, unknown>;
  try {
    const clean = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response", raw }, { status: 500 });
  }

  return NextResponse.json({
    leadId:      lead.id,
    studentName: `${lead.firstName} ${lead.lastName}`,
    email:       lead.email,
    ...parsed,
  });
}
