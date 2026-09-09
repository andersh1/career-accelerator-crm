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
    description: "Full record for one student by name or email: open care flags (raised when they report struggling, hit a blocker, fail a module gate, or go quiet), application details, activity timeline, pre-work answers and session questions per module, assignment submissions with feedback, and private coach notes. Always lead with openFlags — a student can look fine on paper and still be asking for help.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Student name or email" } },
      required: ["query"],
    },
  },
  {
    name: "list_open_flags",
    description: "Every unresolved student-care flag across the program, most urgent first: who it's about, what was said, who owns the follow-up (DAN or CALEB), when it's due, and whether it's overdue. Use this to answer 'who needs attention?' or 'what's on my plate?'.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Optional filter: 'DAN' or 'CALEB'" },
        overdueOnly: { type: "boolean", description: "Only flags past their follow-up deadline" },
      },
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
  {
    name: "create_lead",
    description: "Add someone to the CRM pipeline — e.g. after a call, from a transcript or notes. Give whatever you actually heard; only email, first and last name are required. NEVER invent an email: if one was not stated, say so and ask rather than guessing, because the email is the record's identity and a wrong one creates a duplicate person. If the email already exists this does NOT overwrite the existing record — it appends what you pass as a timestamped note and returns the existing lead, so a half-heard detail can never clobber real pipeline data. Use `notes` for the substance of the conversation: what they want, their situation, timeline, objections.",
    inputSchema: {
      type: "object",
      properties: {
        email:        { type: "string", description: "Their email. Required — this is the record's identity. Ask rather than guess." },
        firstName:    { type: "string" },
        lastName:     { type: "string" },
        phone:        { type: "string" },
        company:      { type: "string", description: "Employer, or the school they attend" },
        jobTitle:     { type: "string" },
        academicYear: { type: "string", description: "e.g. Junior, Senior, Recent grad" },
        linkedinUrl:  { type: "string" },
        stage:        { type: "string", description: "Pipeline stage. Defaults to LEAD. One of: WAITLIST, LEAD, WAITING_TO_MEET, CONTACTED, APPLIED, STRATEGY_CALL, ADMITTED, OFFER_SENT" },
        source:       { type: "string", description: "Where they came from, e.g. Referral, Event, Inbound" },
        notes:        { type: "string", description: "What was actually said — their goal, situation, timeline, objections. This becomes the first activity on the record." },
      },
      required: ["email", "firstName", "lastName"],
    },
  },
  {
    name: "log_activity",
    description: "Log a call, meeting or note on ANYONE in the CRM — prospect or enrolled student. Use this after a conversation to put what was said on their record. save_note only reaches enrolled students; this reaches everyone.",
    inputSchema: {
      type: "object",
      properties: {
        leadQuery: { type: "string", description: "Their name or email" },
        content:   { type: "string", description: "What was said. Write it as you would want to read it in six months." },
        type:      { type: "string", description: "NOTE (default), CALL, or MEETING" },
      },
      required: ["leadQuery", "content"],
    },
  },
  {
    name: "update_lead",
    description: "Move someone's pipeline stage and/or correct their details. Only pass the fields you are changing — anything omitted is left alone. Cannot set ENROLLED, COMPLETED, GRADUATED or DECLINED: those have consequences elsewhere and are done in the CRM by a person.",
    inputSchema: {
      type: "object",
      properties: {
        leadQuery:    { type: "string", description: "Their name or email" },
        stage:        { type: "string", description: "WAITLIST, LEAD, WAITING_TO_MEET, CONTACTED, APPLIED, STRATEGY_CALL, ADMITTED or OFFER_SENT" },
        reason:       { type: "string", description: "Why it moved — recorded on the timeline alongside the change" },
        phone:        { type: "string" },
        company:      { type: "string" },
        jobTitle:     { type: "string" },
        academicYear: { type: "string" },
        linkedinUrl:  { type: "string" },
        priority:     { type: "string", description: "HIGH, MEDIUM or LOW" },
      },
      required: ["leadQuery"],
    },
  },
  {
    name: "resolve_flag",
    description: "Close a student-care flag once it has been dealt with. Use list_open_flags first to find it. Say what you actually did — that note is the record of the follow-up.",
    inputSchema: {
      type: "object",
      properties: {
        studentQuery: { type: "string", description: "Student name or email" },
        kind:         { type: "string", description: "Optional — the flag kind, if they have more than one open" },
        whatYouDid:   { type: "string", description: "How it was resolved" },
      },
      required: ["studentQuery", "whatYouDid"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a follow-up task done. Matches on a fragment of the task title for that person.",
    inputSchema: {
      type: "object",
      properties: {
        leadQuery: { type: "string", description: "Their name or email" },
        titleLike: { type: "string", description: "Part of the task title, e.g. 'send offer'" },
      },
      required: ["leadQuery", "titleLike"],
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
    // stage is needed by update_lead to record what it moved FROM.
    select: { id: true, firstName: true, lastName: true, email: true, stage: true },
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
    // Most modules have no pre-work QUESTIONS — the pre-work IS the worksheets
    // (360 tracker, energy audit, story bank, access map…). Fetching only
    // `answers` meant every module came back with an empty array and Claude
    // reported it could not find the pre-work, while the student's actual work
    // sat in worksheetResponse and threeSixtyResponse untouched.
    const [lead, prework, worksheets, threeSixty, submissions, progressCount, coachNotes, openFlags] = await Promise.all([
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
      prisma.worksheetResponse.findMany({
        where: { userId: u.id },
        select: { worksheetId: true, rows: true, moduleId: true },
      }),
      prisma.threeSixtyResponse.findMany({
        where: { userId: u.id },
        orderBy: { createdAt: "asc" },
        select: { responderName: true, relationship: true, answers: true, source: true },
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
      // Open care flags. Whoever is asking about this student needs to know
      // they've said they're struggling BEFORE they read the assignment list.
      prisma.interventionFlag.findMany({
        where: { userId: u.id, resolvedAt: null },
        orderBy: { dueBy: "asc" },
        select: { kind: true, owner: true, detail: true, dueBy: true, createdAt: true },
      }),
    ]);
    const now = Date.now();
    // Which modules have had their pre-work released to the student — the
    // difference between "we told them" and "we wrote it down".
    const reviewedByModule: Record<string, Date | null> = Object.fromEntries(
      prework.map(p => [p.moduleId, p.reviewedAt]),
    );

    // WorksheetResponse stores only moduleId, so resolve labels once.
    const mods = await prisma.module.findMany({ select: { id: true, number: true, title: true } });
    const moduleLabel: Record<string, string> = Object.fromEntries(
      mods.map(m => [m.id, `M${m.number} ${m.title}`]),
    );
    const moduleNumberById: Record<string, number> = Object.fromEntries(
      mods.map(m => [m.id, m.number]),
    );

    return JSON.stringify({
      student: { name: u.name, email: u.email, cohort: u.cohort, onboarded: !!u.onboardedAt, sectionsCompleted: progressCount },
      openFlags: openFlags.map(f => ({
        kind: f.kind, owner: f.owner, detail: f.detail,
        dueBy: f.dueBy, raisedAt: f.createdAt,
        overdue: f.dueBy.getTime() < now,
      })),
      application: lead,
      prework: prework.map(p => ({
        module: `M${p.module.number} ${p.module.title}`,
        submittedAt: p.submittedAt,
        sessionQuestions: p.sessionQuestions,
        answers: [...p.answers].sort((a, b) => a.question.order - b.question.order).map(a => ({ q: a.question.question, a: a.answer })),
      })),
      // The worksheets, which for most modules ARE the pre-work. Empty rows are
      // dropped so six filled rows read as six, not six plus fourteen blanks.
      preworkWorksheets: worksheets
        .map(w => ({
          module: moduleLabel[w.moduleId] ?? "Unknown module",
          worksheet: w.worksheetId,
          rows: (Array.isArray(w.rows) ? w.rows : []).filter(
            (r) => !!r && typeof r === "object" &&
              Object.values(r as Record<string, unknown>).some(v => String(v ?? "").trim()),
          ),
        }))
        .filter(w => w.rows.length > 0),
      // The 360 in full — the answers people actually sent back, which is what
      // Module 1's spike statement gets argued from.
      threeSixty: threeSixty.map(r => ({
        from: r.responderName,
        relationship: r.relationship,
        typedUpByStudent: r.source === "TYPED_IN",
        answers: r.answers,
      })),
      assignments: submissions,
      // Coach notes, each labelled with what the STUDENT has actually seen.
      // They arrived as one flat list before, so a private read, a write-up
      // they have already read, and feedback still sitting unreleased were
      // indistinguishable — Claude could quote a private note back as though
      // it had been said to them, or claim they had been told something that
      // was never released.
      coachNotes: coachNotes.map(n => {
        const moduleNumber = moduleNumberById[n.moduleId] ?? null;
        const released = !!reviewedByModule[n.moduleId];
        const visibility =
          n.sectionKey === "general"
            ? "PRIVATE — coach-only. The student has NEVER seen this. Never quote or paraphrase it back to them."
            : n.sectionKey === "session-writeup"
              ? "SENT — the student has this write-up and has been notified."
              : released
                ? "SHARED — released to the student with their pre-work feedback."
                : "NOT YET SENT — written, but not released. Marking the pre-work reviewed is what sends it.";
        return {
          module: moduleNumber ? `M${moduleNumber}` : null,
          section: n.sectionKey,
          visibility,
          studentHasSeen: n.sectionKey !== "general" && (n.sectionKey === "session-writeup" || released),
          content: n.content,
        };
      }),
    });
  }

  if (name === "list_open_flags") {
    const owner = typeof input.owner === "string" ? input.owner.toUpperCase() : undefined;
    const flags = await prisma.interventionFlag.findMany({
      where: { resolvedAt: null, ...(owner === "DAN" || owner === "CALEB" ? { owner } : {}) },
      orderBy: { dueBy: "asc" },
      select: {
        kind: true, owner: true, detail: true, dueBy: true, createdAt: true,
        user: { select: { name: true, email: true, cohort: true } },
      },
    });
    const now = Date.now();
    const rows = flags
      .map(f => ({
        student: f.user.name, email: f.user.email, cohort: f.user.cohort,
        kind: f.kind, owner: f.owner, detail: f.detail,
        dueBy: f.dueBy, raisedAt: f.createdAt,
        overdue: f.dueBy.getTime() < now,
      }))
      .filter(r => (input.overdueOnly === true ? r.overdue : true));
    return JSON.stringify({ count: rows.length, flags: rows });
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

  if (name === "create_lead") {
    const email = String(input.email ?? "").trim().toLowerCase();
    const firstName = String(input.firstName ?? "").trim();
    const lastName = String(input.lastName ?? "").trim();
    if (!email || !firstName || !lastName) {
      return JSON.stringify({ error: "email, firstName and lastName are all required" });
    }
    // Cheap sanity check. A malformed address is almost always a mis-heard one,
    // and a bad identity is worse than no record.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return JSON.stringify({ error: `"${email}" does not look like an email address. Ask for it rather than guessing.` });
    }

    const notes = String(input.notes ?? "").trim();
    const stageIn = String(input.stage ?? "").trim().toUpperCase();
    const ALLOWED = ["WAITLIST","LEAD","WAITING_TO_MEET","CONTACTED","APPLIED","STRATEGY_CALL","ADMITTED","OFFER_SENT"];
    // Deliberately cannot set ENROLLED/COMPLETED/GRADUATED/DECLINED: those carry
    // real consequences elsewhere and are not a transcript's call to make.
    const stage = ALLOWED.includes(stageIn) ? stageIn : "LEAD";

    const existing = await prisma.lead.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, firstName: true, lastName: true, stage: true },
    });

    // Never overwrite. A half-heard detail must not clobber real pipeline data,
    // so an existing record gets the new information appended as a note and the
    // caller is told plainly that nothing was changed.
    if (existing) {
      if (notes) {
        await prisma.leadActivity.create({
          data: {
            leadId: existing.id, type: "NOTE", source: "MCP_CLAUDE",
            content: `🗣️ From a call, via Claude:\n${notes}`,
          },
        });
      }
      return JSON.stringify({
        ok: true, created: false, existingLead: true,
        lead: { id: existing.id, name: `${existing.firstName} ${existing.lastName}`, email, stage: existing.stage },
        message: notes
          ? "That email is already in the CRM. Nothing was overwritten — the notes were added to their timeline."
          : "That email is already in the CRM. Nothing was created or changed.",
      });
    }

    const lead = await prisma.lead.create({
      data: {
        email, firstName, lastName, stage,
        phone:        String(input.phone ?? "").trim() || null,
        company:      String(input.company ?? "").trim() || null,
        jobTitle:     String(input.jobTitle ?? "").trim() || null,
        academicYear: String(input.academicYear ?? "").trim() || null,
        linkedinUrl:  String(input.linkedinUrl ?? "").trim() || null,
        source:       String(input.source ?? "").trim() || "Claude (call notes)",
        assignedTo:   admin.id,
      },
      select: { id: true },
    });

    await prisma.leadActivity.create({
      data: {
        leadId: lead.id, type: "CREATED", source: "MCP_CLAUDE",
        content: `Lead created from call notes via Claude by ${admin.name ?? admin.email}.`,
      },
    });
    if (notes) {
      await prisma.leadActivity.create({
        data: { leadId: lead.id, type: "NOTE", source: "MCP_CLAUDE", content: `🗣️ From a call, via Claude:\n${notes}` },
      });
    }

    return JSON.stringify({
      ok: true, created: true,
      lead: { id: lead.id, name: `${firstName} ${lastName}`, email, stage },
      url: `${process.env.NEXTAUTH_URL ?? "https://crm.vantagecareer.co"}/leads/${lead.id}`,
      message: "Lead created. Open the URL to review and correct anything mis-heard.",
    });
  }

  if (name === "log_activity") {
    const lead = await findLead(String(input.leadQuery ?? ""));
    if (!lead) return JSON.stringify({ error: "Nobody in the CRM matched that name or email" });
    const content = String(input.content ?? "").trim();
    if (!content) return JSON.stringify({ error: "Nothing to log" });
    const t = String(input.type ?? "NOTE").toUpperCase();
    const type = ["NOTE", "CALL", "MEETING"].includes(t) ? t : "NOTE";
    await prisma.leadActivity.create({
      data: { leadId: lead.id, type, source: "MCP_CLAUDE", content },
    });
    return JSON.stringify({ ok: true, loggedOn: `${lead.firstName} ${lead.lastName}`, type });
  }

  if (name === "update_lead") {
    const lead = await findLead(String(input.leadQuery ?? ""));
    if (!lead) return JSON.stringify({ error: "Nobody in the CRM matched that name or email" });

    // Same whitelist as create_lead: the terminal stages carry consequences
    // elsewhere (enrolment, graduation, loss reporting) and stay human-driven.
    const ALLOWED = ["WAITLIST","LEAD","WAITING_TO_MEET","CONTACTED","APPLIED","STRATEGY_CALL","ADMITTED","OFFER_SENT"];
    const stageIn = String(input.stage ?? "").trim().toUpperCase();
    if (stageIn && !ALLOWED.includes(stageIn)) {
      return JSON.stringify({
        error: `Stage "${stageIn}" cannot be set from here. Allowed: ${ALLOWED.join(", ")}. Enrolment, graduation and denial are done in the CRM by a person.`,
      });
    }

    const data: Record<string, string> = {};
    for (const k of ["phone","company","jobTitle","academicYear","linkedinUrl"]) {
      const v = String(input[k] ?? "").trim();
      if (v) data[k] = v;
    }
    const pr = String(input.priority ?? "").trim().toUpperCase();
    if (["HIGH","MEDIUM","LOW"].includes(pr)) data.priority = pr;
    if (stageIn) data.stage = stageIn;

    if (Object.keys(data).length === 0) {
      return JSON.stringify({ error: "Nothing to change — pass a stage or at least one field." });
    }

    const before = lead.stage;
    await prisma.lead.update({ where: { id: lead.id }, data });

    // A stage move is the thing people ask "why?" about later, so record the
    // move and the reason as one entry rather than a silent field change.
    if (stageIn && stageIn !== before) {
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id, type: "STAGE_CHANGE", source: "MCP_CLAUDE",
          metadata: JSON.stringify({ from: before, to: stageIn }),
          content: String(input.reason ?? "").trim() || `Moved ${before} → ${stageIn} via Claude.`,
        },
      });
    }
    return JSON.stringify({
      ok: true, lead: `${lead.firstName} ${lead.lastName}`,
      changed: Object.keys(data), stageWas: before, stageNow: data.stage ?? before,
    });
  }

  if (name === "resolve_flag") {
    const u = await findStudent(String(input.studentQuery ?? ""));
    if (!u) return JSON.stringify({ error: "No student matched that name/email" });
    const whatYouDid = String(input.whatYouDid ?? "").trim();
    if (!whatYouDid) return JSON.stringify({ error: "Say what you did — that note is the record of the follow-up." });

    const kind = String(input.kind ?? "").trim();
    const open = await prisma.interventionFlag.findMany({
      where: { userId: u.id, resolvedAt: null, ...(kind ? { kind } : {}) },
      orderBy: { dueBy: "asc" },
      select: { id: true, kind: true, detail: true },
    });
    if (open.length === 0) return JSON.stringify({ error: `No open flags for ${u.name}${kind ? ` of kind ${kind}` : ""}.` });
    if (open.length > 1 && !kind) {
      return JSON.stringify({
        error: `${u.name} has ${open.length} open flags — pass \`kind\` to say which.`,
        openFlags: open.map(f => ({ kind: f.kind, detail: f.detail })),
      });
    }
    await prisma.interventionFlag.update({
      where: { id: open[0].id },
      data: { resolvedAt: new Date(), resolvedBy: admin.id },
    });
    const lead = await prisma.lead.findFirst({ where: { enrolledUserId: u.id }, select: { id: true } });
    if (lead) {
      await prisma.leadActivity.create({
        data: { leadId: lead.id, type: "NOTE", source: "MCP_CLAUDE",
                content: `✅ Flag resolved (${open[0].kind}): ${whatYouDid}` },
      });
    }
    return JSON.stringify({ ok: true, resolved: open[0].kind, student: u.name });
  }

  if (name === "complete_task") {
    const lead = await findLead(String(input.leadQuery ?? ""));
    if (!lead) return JSON.stringify({ error: "Nobody in the CRM matched that name or email" });
    const like = String(input.titleLike ?? "").trim();
    if (!like) return JSON.stringify({ error: "Say which task — pass part of its title." });
    const open = await prisma.task.findMany({
      where: { leadId: lead.id, completedAt: null, title: { contains: like, mode: "insensitive" } },
      select: { id: true, title: true },
    });
    if (open.length === 0) return JSON.stringify({ error: `No open task on ${lead.firstName} ${lead.lastName} matching "${like}".` });
    if (open.length > 1) {
      return JSON.stringify({ error: "That matches more than one open task — be more specific.", matches: open.map(t => t.title) });
    }
    await prisma.task.update({ where: { id: open[0].id }, data: { completedAt: new Date() } });
    return JSON.stringify({ ok: true, completed: open[0].title, on: `${lead.firstName} ${lead.lastName}` });
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
