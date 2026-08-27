/**
 * Remote MCP connector for claude.ai (Vantage Career Accelerator).
 *
 * Each admin gets a personal URL: https://crm.vantagecareer.co/api/mcp/<token>
 * Added in claude.ai via Settings → Connectors → Add custom connector.
 *
 * Stateless Streamable-HTTP JSON-RPC server: initialize / tools/list / tools/call.
 * The token identifies the admin, so reads are gated and writes are attributed.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

// ── Auth ─────────────────────────────────────────────────────────────────────

async function adminForToken(token: string) {
  if (!token || token.length < 24) return null;
  const user = await prisma.user.findUnique({
    where: { mcpToken: token },
    select: { id: true, name: true, email: true, role: true, crmRole: true },
  });
  if (!user || (user.role !== "ADMIN" && user.crmRole !== "ADMIN")) return null;
  return user;
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "list_students",
    description: "List all program students with cohort, pipeline stage, onboarding status, and LMS progress counts (sections completed, pre-work and assignments submitted). Optionally filter by cohort name.",
    inputSchema: {
      type: "object",
      properties: { cohort: { type: "string", description: "Optional cohort name filter, e.g. 'Cohort 2'" } },
    },
  },
  {
    name: "get_student",
    description: "Full record for one student by name or email: application details, activity timeline, pre-work answers and session questions per module, assignment submissions with feedback, and private coach notes.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Student name or email" } },
      required: ["query"],
    },
  },
  {
    name: "list_missing_work",
    description: "For a given module number (1-8), list which onboarded students have NOT submitted pre-work and which have not submitted the assignment.",
    inputSchema: {
      type: "object",
      properties: { moduleNumber: { type: "number" } },
      required: ["moduleNumber"],
    },
  },
  {
    name: "search_leads",
    description: "Search the enrollment pipeline (prospects, not students). Returns name, email, stage, priority, source, last-touch, and latest activity. Filter by free-text query and/or stage.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name, email, or company fragment" },
        stage: { type: "string", description: "Optional stage key, e.g. WAITLIST, CONTACTED, APPLIED, OFFER_SENT" },
      },
    },
  },
  {
    name: "upcoming_sessions",
    description: "Upcoming booked 1-on-1 coaching sessions in the next 14 days: student, coach, module, start time (ET).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "save_note",
    description: "Save a note about a student, attributed to you. destination 'lead' = CRM activity timeline (team-visible). destination 'coach' = private coach note on the student's Module call sheet (moduleNumber required).",
    inputSchema: {
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
  {
    name: "push_call_writeup",
    description: "Send a post-session call write-up TO a student. Saves it on their Module record and notifies them in the LMS ('Your coach sent your session write-up'). The student reads it on their 1-on-1 Sessions page. Use after a coaching call, with the write-up in the coach's voice.",
    inputSchema: {
      type: "object",
      properties: {
        studentQuery: { type: "string", description: "Student name or email" },
        moduleNumber: { type: "number", description: "Module the session covered (1-8)" },
        writeup: { type: "string", description: "The student-facing write-up text" },
      },
      required: ["studentQuery", "moduleNumber", "writeup"],
    },
  },
  {
    name: "create_task",
    description: "Create a follow-up task on a lead/student's CRM record, assigned to you. dueDate optional (YYYY-MM-DD).",
    inputSchema: {
      type: "object",
      properties: {
        leadQuery: { type: "string", description: "Lead/student name or email" },
        title: { type: "string" },
        dueDate: { type: "string", description: "YYYY-MM-DD, optional" },
      },
      required: ["leadQuery", "title"],
    },
  },
];

// ── Tool implementations ─────────────────────────────────────────────────────

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
    select: { id: true, name: true, email: true, cohort: true, onboardedAt: true },
  });
}

async function findLead(query: string) {
  const q = query.trim();
  return prisma.lead.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { email: { equals: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
}

async function runTool(
  name: string,
  input: Record<string, unknown>,
  admin: { id: string; name: string | null; email: string },
): Promise<string> {
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
          stage: true, source: true, tags: true, notes: true,
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
      select: { id: true, name: true },
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

  if (name === "search_leads") {
    const q = typeof input.query === "string" ? input.query.trim() : "";
    const stage = typeof input.stage === "string" ? input.stage.trim().toUpperCase() : "";
    const leads = await prisma.lead.findMany({
      where: {
        deletedAt: null,
        ...(stage ? { stage } : {}),
        ...(q ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
          ],
        } : {}),
      },
      select: {
        firstName: true, lastName: true, email: true, stage: true, priority: true,
        source: true, updatedAt: true,
        activities: { orderBy: { createdAt: "desc" }, take: 1, select: { type: true, content: true, createdAt: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return JSON.stringify(leads.map(l => ({
      name: `${l.firstName} ${l.lastName}`, email: l.email, stage: l.stage,
      priority: l.priority, source: l.source,
      lastTouched: l.updatedAt,
      latestActivity: l.activities[0] ? `${l.activities[0].type}: ${(l.activities[0].content ?? "").slice(0, 200)}` : null,
    })));
  }

  if (name === "upcoming_sessions") {
    const now = new Date();
    const bookings = await prisma.oneOnOneBooking.findMany({
      where: { status: "CONFIRMED", slot: { startTime: { gte: now, lte: new Date(now.getTime() + 14 * 86_400_000) } } },
      include: {
        slot: { select: { startTime: true, admin: { select: { name: true } } } },
        student: { select: { name: true, email: true } },
        module: { select: { number: true, title: true } },
      },
      orderBy: { slot: { startTime: "asc" } },
    });
    return JSON.stringify(bookings.map(b => ({
      student: b.student.name,
      coach: b.slot.admin?.name,
      module: `M${b.module.number} ${b.module.title}`,
      startsAtET: b.slot.startTime.toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    })));
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
        create: { userId: u.id, moduleId: mod.id, sectionKey: "general", content: note, authorId: admin.id },
        update: { content: existing ? `${existing.content}\n\n${note}` : note },
      });
      return JSON.stringify({ ok: true, savedTo: `private coach note — ${u.name}, Module ${modNum} call sheet` });
    }

    const lead = await prisma.lead.findFirst({ where: { email: { equals: u.email, mode: "insensitive" } }, select: { id: true } });
    if (!lead) return JSON.stringify({ error: "No CRM lead found for this student" });
    await prisma.leadActivity.create({
      data: { leadId: lead.id, type: "NOTE", content: note, createdBy: admin.id, source: "mcp" },
    });
    return JSON.stringify({ ok: true, savedTo: `CRM timeline note on ${u.name}` });
  }

  if (name === "push_call_writeup") {
    const u = await findStudent(String(input.studentQuery ?? ""));
    if (!u) return JSON.stringify({ error: "No student matched that name/email" });
    const writeup = String(input.writeup ?? "").trim();
    if (!writeup) return JSON.stringify({ error: "Write-up is empty" });
    const modNum = Number(input.moduleNumber);
    const mod = await prisma.module.findUnique({ where: { number: modNum }, select: { id: true, number: true } });
    if (!mod) return JSON.stringify({ error: "Module not found — use moduleNumber 1-8" });

    const existing = await prisma.preworkNote.findUnique({
      where: { userId_moduleId_sectionKey: { userId: u.id, moduleId: mod.id, sectionKey: "session-writeup" } },
    });
    await prisma.preworkNote.upsert({
      where:  { userId_moduleId_sectionKey: { userId: u.id, moduleId: mod.id, sectionKey: "session-writeup" } },
      create: { userId: u.id, moduleId: mod.id, sectionKey: "session-writeup", content: writeup, authorId: admin.id },
      update: { content: writeup, authorId: admin.id },
    });
    await prisma.notification.create({
      data: {
        userId: u.id,
        type: "COACHING_NOTE",
        title: existing
          ? `Your Module ${mod.number} session write-up was updated`
          : `Your coach sent your Module ${mod.number} session write-up`,
        body: "Open your 1-on-1 Sessions page to read it.",
        href: "/1on1",
      },
    }).catch(() => {});
    return JSON.stringify({ ok: true, sentTo: u.name, module: mod.number, updated: !!existing, note: "The student sees it on their 1-on-1 Sessions page and gets an in-app notification." });
  }

  if (name === "create_task") {
    const lead = await findLead(String(input.leadQuery ?? ""));
    if (!lead) return JSON.stringify({ error: "No lead matched that name/email" });
    const title = String(input.title ?? "").trim();
    if (!title) return JSON.stringify({ error: "Task title is empty" });
    const dueDate = typeof input.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)
      ? new Date(`${input.dueDate}T17:00:00-04:00`)
      : null;
    await prisma.task.create({
      data: { leadId: lead.id, title, dueAt: dueDate, createdBy: admin.id, assignedTo: admin.email },
    });
    return JSON.stringify({ ok: true, task: title, on: `${lead.firstName} ${lead.lastName}`, due: dueDate, assignedTo: admin.email });
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

// ── JSON-RPC plumbing (stateless Streamable HTTP) ────────────────────────────

type RpcRequest = { jsonrpc: "2.0"; id?: number | string | null; method: string; params?: Record<string, unknown> };

function rpcResult(id: number | string | null | undefined, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function rpcError(id: number | string | null | undefined, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function handleRpc(msg: RpcRequest, admin: { id: string; name: string | null; email: string }) {
  if (msg.method === "initialize") {
    const requested = (msg.params?.protocolVersion as string) ?? "2025-03-26";
    return rpcResult(msg.id, {
      protocolVersion: requested,
      capabilities: { tools: {} },
      serverInfo: { name: "vantage-career-accelerator", version: "1.0.0" },
      instructions: `Connected as ${admin.name ?? admin.email}. Tools read live CRM/LMS data for the Vantage Career Accelerator; write tools (save_note, push_call_writeup, create_task) are attributed to this admin.`,
    });
  }
  if (msg.method === "ping") return rpcResult(msg.id, {});
  if (msg.method === "tools/list") return rpcResult(msg.id, { tools: TOOLS });
  if (msg.method === "tools/call") {
    const name = String(msg.params?.name ?? "");
    const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
    try {
      const out = await runTool(name, args, admin);
      return rpcResult(msg.id, { content: [{ type: "text", text: out }], isError: false });
    } catch (e) {
      return rpcResult(msg.id, {
        content: [{ type: "text", text: JSON.stringify({ error: e instanceof Error ? e.message : "Tool failed" }) }],
        isError: true,
      });
    }
  }
  if (msg.method.startsWith("notifications/")) return null; // notifications get no response
  return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const admin = await adminForToken(params.token);
  if (!admin) return NextResponse.json({ error: "Invalid connector URL" }, { status: 401 });

  let body: RpcRequest | RpcRequest[];
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }

  const messages = Array.isArray(body) ? body : [body];
  const responses = [];
  for (const msg of messages) {
    const r = await handleRpc(msg, admin);
    if (r) responses.push(r);
  }

  if (responses.length === 0) return new NextResponse(null, { status: 202 });
  const payload = Array.isArray(body) ? responses : responses[0];
  return NextResponse.json(payload, { headers: { "Content-Type": "application/json" } });
}

// Some clients probe with GET (SSE); we're stateless, so decline politely.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const admin = await adminForToken(params.token);
  if (!admin) return NextResponse.json({ error: "Invalid connector URL" }, { status: 401 });
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 200 });
}
