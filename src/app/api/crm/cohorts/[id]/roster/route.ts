/**
 * Import a class roster.
 *
 *   POST /api/crm/cohorts/[id]/roster   { text, apply?, domain? }
 *
 * A Fellow arrives through the pipeline: a lead, a consultation, tuition, then
 * enrolment. A university student arrives on a list from the registrar. There is
 * no lead, no deal, no tuition, and no reason to invent any, so this takes the
 * list and makes the accounts.
 *
 * `text` is whatever Wake sends, pasted: "Name, email" or "email, Name" per
 * line, tabs or commas, with or without a header row. Parsing it loosely here is
 * the difference between a paste and an afternoon of reformatting.
 *
 * ALWAYS PREVIEWS FIRST. `apply: true` writes. The preview says, per row, what
 * would happen and why, because the two bad outcomes are both silent: a typo in
 * an address creates an account that can never be signed in to, and a student
 * already enrolled somewhere else would be moved out of their own cohort.
 *
 * It creates accounts; it does not invite anybody. Publishing the cohort is what
 * sends the invitations, and that is a separate, deliberate press.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomBytes } from "crypto";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseRoster } from "@/lib/roster-import";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as { text?: string; apply?: boolean; domain?: string };
  if (!body.text?.trim()) return NextResponse.json({ error: "Paste the roster first." }, { status: 400 });

  const cohort = await prisma.cohort.findUnique({
    where:  { id: params.id },
    select: { id: true, name: true, track: true, capacity: true, _count: { select: { users: true } } },
  });
  if (!cohort) return NextResponse.json({ error: "No such cohort" }, { status: 404 });

  const { rows, skipped } = parseRoster(body.text);
  if (rows.length === 0) {
    return NextResponse.json({ error: "No usable rows. Each line needs a name and an email.", skipped }, { status: 400 });
  }

  const warnings: string[] = [];

  /**
   * An expected domain, when one is given. Not enforced: a university class can
   * legitimately include a visiting student or someone using a personal address.
   * Said out loud instead, because one wrong domain in a list of twenty is how
   * a typo gets through.
   */
  const domain = body.domain?.trim().replace(/^@/, "").toLowerCase();
  if (domain) {
    const strangers = rows.filter(r => !r.email.endsWith(`@${domain}`));
    if (strangers.length) {
      warnings.push(`${strangers.length} address${strangers.length === 1 ? " is" : "es are"} not @${domain}: ${strangers.map(s => s.email).join(", ")}. Check them before applying.`);
    }
  }

  const seen = new Map<string, number>();
  for (const r of rows) {
    if (seen.has(r.email)) warnings.push(`${r.email} appears twice, on lines ${seen.get(r.email)} and ${r.line}. It will be imported once.`);
    else seen.set(r.email, r.line);
  }

  const existing = await prisma.user.findMany({
    where:  { email: { in: Array.from(seen.keys()) } },
    select: { id: true, email: true, name: true, role: true, cohortId: true, withdrawnAt: true,
              cohortRef: { select: { name: true } } },
  });
  const byEmail = new Map(existing.map(u => [u.email.toLowerCase(), u]));

  const plan = Array.from(seen.keys()).map(email => {
    const row = rows.find(r => r.email === email)!;
    const found = byEmail.get(email);

    if (!found) return { ...row, action: "create" as const, note: "A new account, with no password until the cohort is published." };
    if (found.cohortId === cohort.id) return { ...row, action: "already-here" as const, note: "Already in this class. Nothing to do." };
    if (found.cohortId) {
      return {
        ...row, action: "blocked" as const,
        note: `This address is already in ${found.cohortRef?.name ?? "another cohort"}. Importing would move them out of it, so it is left alone. Move them from the Roster tab if that is really what you want.`,
      };
    }
    if (found.role !== "STUDENT") {
      return {
        ...row, action: "blocked" as const,
        note: `This address belongs to a ${found.role.toLowerCase()} account (${found.name}). Not touched.`,
      };
    }
    return { ...row, action: "enrol" as const, note: "Has an account with no cohort. Will be added to this class." };
  });

  const willAdd = plan.filter(p => p.action === "create" || p.action === "enrol").length;
  if (cohort.capacity && cohort._count.users + willAdd > cohort.capacity) {
    warnings.push(`That would put ${cohort._count.users + willAdd} students in a class with a capacity of ${cohort.capacity}.`);
  }

  if (!body.apply) {
    return NextResponse.json({
      preview: true, cohort: cohort.name, plan, skipped, warnings,
      summary: {
        create:  plan.filter(p => p.action === "create").length,
        enrol:   plan.filter(p => p.action === "enrol").length,
        already: plan.filter(p => p.action === "already-here").length,
        blocked: plan.filter(p => p.action === "blocked").length,
      },
    });
  }

  let created = 0, enrolled = 0;
  for (const p of plan) {
    if (p.action === "create") {
      await prisma.user.create({
        data: {
          email: p.email, name: p.name,
          // Unusable until they set one from the invitation that publishing
          // sends. Never a shared or guessable default.
          password: `nologin-${randomBytes(24).toString("hex")}`,
          role: "STUDENT",
          cohortId: cohort.id,
          cohort: cohort.name,
        },
      });
      created++;
    } else if (p.action === "enrol") {
      await prisma.user.update({
        where: { email: p.email },
        data:  { cohortId: cohort.id, cohort: cohort.name },
      });
      enrolled++;
    }
  }

  return NextResponse.json({
    ok: true, cohort: cohort.name, created, enrolled,
    blocked: plan.filter(p => p.action === "blocked").map(p => ({ email: p.email, note: p.note })),
    warnings,
    // Said explicitly, because "imported" and "invited" are different things and
    // nobody has been emailed yet.
    next: "Nobody has been emailed. Publish the cohort when you want the invitations to go out.",
  });
}
