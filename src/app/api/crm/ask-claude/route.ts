/**
 * POST /api/crm/ask-claude — admin chat over the LMS/CRM database.
 * Claude gets read tools (students, applications, submissions, progress) and
 * one write tool (save a note). Requires ANTHROPIC_API_KEY in the environment.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const maxDuration = 120;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_students",
    description: "List students, optionally filtered by cohort name substring (e.g. 'Cohort 2') or status. Returns name, email, cohort, stage, onboarded, progress counts.",
    input_schema: {
      type: "object",
      properties: {
        cohort: { type: "string", description: "Cohort name substring filter (optional)" },
      },
    },
  },
  {
    name: "get_student",
    description: "Full record for one student by name or email: application details (lead notes, tags, source, activities), pre-work submissions with answers, assignment submissions, progress, coach notes.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Student name or email" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_missing_work",
    description: "For a module number, list which onboarded students have not submitted pre-work and which have not submitted the assignment.",
    input_schema: {
      type: "object",
      properties: {
        moduleNumber: { type: "number", description: "Module number 1-8" },
      },
      required: ["moduleNumber"],
    },
  },
  {
    name: "save_note",
    description: "Save a note onto a student's record. destination 'lead' = CRM activity note (general). destination 'coach' = private coach note on a module's call sheet (requires moduleNumber); only the coach sees it, and it appears in the morning call digest.",
    input_schema: {
      type: "object",
      properties: {
        studentQuery: { type: "string", description: "Student name or email" },
        note: { type: "string" },
        destination: { type: "string", enum: ["lead", "coach"] },
        moduleNumber: { type: "number", description: "Required when destination is 'coach'" },
      },
      required: ["studentQuery", "note", "destination"],
    },
  },
];

async function findStudent(query: string) {
  const q = query.trim();
  return prisma.user.findFirst({
    where: {
      role: "STUDENT",
      OR: [
        { email: { equals: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, email: true, cohort: true, cohortId: true, onboardedAt: true },
  });
}

async function runTool(name: string, input: Record<string, unknown>, adminId: string): Promise<string> {
  try {
    if (name === "list_students") {
      const cohort = typeof input.cohort === "string" ? input.cohort : undefined;
      const students = await prisma.user.findMany({
        where: { role: "STUDENT", ...(cohort ? { cohort: { contains: cohort, mode: "insensitive" } } : {}) },
        select: {
          name: true, email: true, cohort: true, onboardedAt: true,
          _count: { select: { progress: true, submissions: true, preworkSubmissions: true } },
        },
        orderBy: { name: "asc" },
      });
      const leads = await prisma.lead.findMany({
        where: { leadType: "STUDENT", deletedAt: null },
        select: { email: true, stage: true },
      });
      const stageByEmail = new Map(leads.map(l => [l.email.toLowerCase(), l.stage]));
      return JSON.stringify(students.map(s => ({
        name: s.name, email: s.email, cohort: s.cohort,
        stage: stageByEmail.get(s.email.toLowerCase()) ?? null,
        onboarded: !!s.onboardedAt,
        sectionsCompleted: s._count.progress,
        assignmentsSubmitted: s._count.submissions,
        preworkSubmitted: s._count.preworkSubmissions,
      })));
    }

    if (name === "get_student") {
      const u = await findStudent(String(input.query ?? ""));
      if (!u) return JSON.stringify({ error: "No student matched that name/email" });
      const [lead, prework, submissions, progressCount, coachNotes] = await Promise.all([
        prisma.lead.findFirst({
          where: { email: { equals: u.email, mode: "insensitive" } },
          select: {
            stage: true, source: true, subSource: true, tags: true, notes: true,
            company: true, jobTitle: true, linkedinUrl: true, phone: true,
            activities: { orderBy: { createdAt: "desc" }, take: 15, select: { type: true, content: true, subject: true, createdAt: true } },
          },
        }),
        prisma.preworkSubmission.findMany({
          where: { userId: u.id },
          include: {
            module: { select: { number: true, title: true } },
            answers: { include: { question: { select: { question: true, order: true } } } },
          },
        }),
        prisma.submission.findMany({
          where: { userId: u.id },
          select: { title: true, content: true, status: true, feedback: true, submittedAt: true, module: { select: { number: true } } },
          orderBy: { submittedAt: "desc" },
        }),
        prisma.progress.count({ where: { userId: u.id } }),
        prisma.preworkNote.findMany({
          where: { userId: u.id },
          select: { moduleId: true, sectionKey: true, content: true },
        }),
      ]);
      return JSON.stringify({
        student: { name: u.name, email: u.email, cohort: u.cohort, onboarded: !!u.onboardedAt, sectionsCompleted: progressCount },
        application: lead,
        prework: prework.map(p => ({
          module: `M${p.module.number} ${p.module.title}`,
          submittedAt: p.submittedAt,
          sessionQuestions: p.sessionQuestions,
          answers: [...p.answers].sort((a, b) => a.question.order - b.question.order).map(a => ({ q: a.question.question, a: a.answer })),
        })),
        assignments: submissions,
        coachNotes,
      });
    }

    if (name === "list_missing_work") {
      const modNum = Number(input.moduleNumber);
      const mod = await prisma.module.findUnique({ where: { number: modNum }, select: { id: true, title: true } });
      if (!mod) return JSON.stringify({ error: "Module not found" });
      const students = await prisma.user.findMany({
        where: { role: "STUDENT", onboardedAt: { not: null } },
        select: { id: true, name: true, cohort: true },
      });
      const ids = students.map(s => s.id);
      const [pw, asg] = await Promise.all([
        prisma.preworkSubmission.findMany({ where: { moduleId: mod.id, userId: { in: ids } }, select: { userId: true } }),
        prisma.submission.findMany({ where: { moduleId: mod.id, userId: { in: ids } }, select: { userId: true } }),
      ]);
      const pwSet = new Set(pw.map(x => x.userId));
      const asgSet = new Set(asg.map(x => x.userId));
      return JSON.stringify({
        module: `M${modNum} ${mod.title}`,
        missingPrework: students.filter(s => !pwSet.has(s.id)).map(s => s.name),
        missingAssignment: students.filter(s => !asgSet.has(s.id)).map(s => s.name),
      });
    }

    if (name === "save_note") {
      const u = await findStudent(String(input.studentQuery ?? ""));
      if (!u) return JSON.stringify({ error: "No student matched that name/email" });
      const note = String(input.note ?? "").trim();
      if (!note) return JSON.stringify({ error: "Note is empty" });

      if (input.destination === "coach") {
        const modNum = Number(input.moduleNumber);
        const mod = await prisma.module.findUnique({ where: { number: modNum }, select: { id: true } });
        if (!mod) return JSON.stringify({ error: "moduleNumber required (1-8) for coach notes" });
        const existing = await prisma.preworkNote.findUnique({
          where: { userId_moduleId_sectionKey: { userId: u.id, moduleId: mod.id, sectionKey: "general" } },
        });
        await prisma.preworkNote.upsert({
          where: { userId_moduleId_sectionKey: { userId: u.id, moduleId: mod.id, sectionKey: "general" } },
          create: { userId: u.id, moduleId: mod.id, sectionKey: "general", content: note, authorId: adminId },
          update: { content: existing ? `${existing.content}\n\n${note}` : note },
        });
        return JSON.stringify({ ok: true, savedTo: `private coach note — ${u.name}, Module ${modNum} call sheet` });
      }

      const lead = await prisma.lead.findFirst({ where: { email: { equals: u.email, mode: "insensitive" } }, select: { id: true } });
      if (!lead) return JSON.stringify({ error: "No CRM lead found for this student" });
      await prisma.leadActivity.create({
        data: { leadId: lead.id, type: "NOTE", content: note, createdBy: adminId, source: "ask-claude" },
      });
      return JSON.stringify({ ok: true, savedTo: `CRM note on ${u.name}` });
    }

    return JSON.stringify({ error: "Unknown tool" });
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : "Tool failed" });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const crmRole = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || crmRole !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ notConfigured: true, error: "ANTHROPIC_API_KEY is not set" }, { status: 503 });
  }
  const client = new Anthropic();

  const { messages } = await req.json() as { messages: { role: "user" | "assistant"; content: string }[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const adminId = (session as { user: { id: string } }).user.id;
  const system = `You are the Vantage Career Accelerator's program assistant, embedded in the CRM for the coaching team (Dan and Caleb).
You have tools to read student data (applications, pre-work, assignments, progress) and to save notes.
Be concise and concrete. When summarizing applications or pre-work, pull out what a coach needs before a 1-on-1: goals, background, standout details, concerns.
When asked to save a note, confirm what you saved and where. Never invent student data — if a tool returns nothing, say so.
Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;

  const convo: Anthropic.MessageParam[] = messages.map(m => ({ role: m.role, content: m.content }));

  try {
    for (let turn = 0; turn < 8; turn++) {
      const resp = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 3000,
        thinking: { type: "adaptive" },
        system,
        tools: TOOLS,
        messages: convo,
      });

      if (resp.stop_reason === "tool_use") {
        convo.push({ role: "assistant", content: resp.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of resp.content) {
          if (block.type === "tool_use") {
            const output = await runTool(block.name, block.input as Record<string, unknown>, adminId);
            results.push({ type: "tool_result", tool_use_id: block.id, content: output });
          }
        }
        convo.push({ role: "user", content: results });
        continue;
      }

      const text = resp.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("\n");
      return NextResponse.json({ reply: text || "(no response)" });
    }
    return NextResponse.json({ reply: "I hit my tool-use limit on this request — try asking a narrower question." });
  } catch (e) {
    console.error("[ask-claude]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Claude request failed" }, { status: 500 });
  }
}
