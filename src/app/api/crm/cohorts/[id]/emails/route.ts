import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Per-cohort email overrides.
 *
 * GET  /api/crm/cohorts/[id]/emails
 *   Every automated email, with the shared copy and this cohort's override
 *   side by side, so it is obvious which ones have been changed for them.
 *
 * PATCH /api/crm/cohorts/[id]/emails  { key, subject?, body?, enabled? }
 *   Null on a field means "inherit the shared version". An override whose
 *   fields are all null is deleted rather than left as an empty row, so
 *   "Use the shared copy" genuinely returns to shared.
 */
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  return !!session && role === "ADMIN";
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [shared, overrides] = await Promise.all([
    prisma.emailTemplate.findMany({
      orderBy: { key: "asc" },
      select: { key: true, name: true, subject: true, body: true, enabled: true },
    }),
    prisma.cohortEmailTemplate.findMany({ where: { cohortId: params.id } }),
  ]);
  const byKey = new Map(overrides.map(o => [o.key, o]));

  return NextResponse.json(shared.map(t => {
    const o = byKey.get(t.key);
    return {
      key: t.key,
      name: t.name,
      sharedSubject: t.subject,
      sharedBody: t.body,
      sharedEnabled: t.enabled,
      // Null on any of these means this cohort inherits that field.
      subject: o?.subject ?? null,
      body: o?.body ?? null,
      enabled: o?.enabled ?? null,
      overridden: !!o && (o.subject !== null || o.body !== null || o.enabled !== null),
    };
  }));
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  // Guard against a typo creating an override of a template that does not
  // exist, which would sit in the list doing nothing and look like a bug.
  const exists = await prisma.emailTemplate.findUnique({ where: { key }, select: { key: true } });
  if (!exists) return NextResponse.json({ error: `No email template named "${key}"` }, { status: 400 });

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const subject = str(body.subject);
  const text    = str(body.body);
  const enabled = typeof body.enabled === "boolean" ? body.enabled : null;

  // Nothing overridden means this cohort is back on the shared version.
  if (subject === null && text === null && enabled === null) {
    await prisma.cohortEmailTemplate.deleteMany({ where: { cohortId: params.id, key } });
    return NextResponse.json({ key, overridden: false, subject: null, body: null, enabled: null });
  }

  const row = await prisma.cohortEmailTemplate.upsert({
    where:  { cohortId_key: { cohortId: params.id, key } },
    create: { cohortId: params.id, key, subject, body: text, enabled },
    update: { subject, body: text, enabled },
  });
  return NextResponse.json({ key, overridden: true, subject: row.subject, body: row.body, enabled: row.enabled });
}
