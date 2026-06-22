/**
 * POST /api/crm/leads/[id]/transcript
 * Parses a Fathom (or any) call transcript with Claude and returns structured
 * coaching insights, next steps, and recommended CRM updates.
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const { transcript } = await req.json();
  if (!transcript?.trim()) {
    return NextResponse.json({ error: "transcript is required" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    select: { firstName: true, lastName: true, stage: true, notes: true, priority: true },
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const STAGES = ["LEAD", "CONTACTED", "QUALIFIED", "PROPOSAL", "ENROLLED", "LOST"];

  const prompt = `You are a sales intelligence assistant analyzing a call transcript from a career coaching sales conversation.

Lead name: ${lead.firstName} ${lead.lastName}
Current stage: ${lead.stage}
Current notes: ${lead.notes ?? "none"}

Here is the transcript:
---
${transcript.slice(0, 12000)}
---

Analyze this transcript and return a JSON object with exactly these fields:

{
  "summary": "2-3 sentence executive summary of what was discussed and the overall outcome",
  "callNotes": "Detailed call notes for the CRM activity log. Include what was discussed, the prospect's situation, any commitments made. 3-6 sentences.",
  "painPoints": ["pain point 1", "pain point 2"],
  "objections": ["objection 1", "objection 2"],
  "keyInsights": ["budget mentioned: X", "timeline: Y", "decision maker: Z", "other key detail"],
  "nextSteps": [
    { "title": "specific follow-up action", "dueInDays": 1 }
  ],
  "recommendedStage": "one of: LEAD | CONTACTED | QUALIFIED | PROPOSAL | ENROLLED | LOST",
  "recommendedPriority": "one of: LOW | NORMAL | HIGH | URGENT",
  "stageReason": "1 sentence explaining why you recommend this stage",
  "enrollmentReadiness": "one of: NOT_READY | WARMING | INTERESTED | VERY_INTERESTED | READY_TO_ENROLL",
  "notesAppend": "2-3 sentences of key context to append to the lead notes field (pain points, goals, situation)"
}

Rules:
- nextSteps should be concrete, actionable items the rep needs to do (send an email, schedule a call, send a proposal, etc.)
- dueInDays should be 1 for urgent items, 2-3 for follow-ups, 7 for longer-horizon tasks
- Only include objections and pain points actually mentioned in the transcript
- If the transcript doesn't contain enough signal to change the stage, keep the current stage: ${lead.stage}
- Only recommend ENROLLED if the prospect explicitly committed to joining
- Return ONLY valid JSON, no markdown, no explanation`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "";

    let parsed: Record<string, unknown>;
    try {
      // Strip any accidental markdown fences
      const clean = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response", raw }, { status: 500 });
    }

    // Validate recommendedStage
    if (!STAGES.includes(parsed.recommendedStage as string)) {
      parsed.recommendedStage = lead.stage;
    }

    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI call failed" },
      { status: 500 }
    );
  }
}
