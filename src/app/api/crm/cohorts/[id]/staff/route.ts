/**
 * The people who teach or assist ONE cohort.
 *
 *   GET    /api/crm/cohorts/[id]/staff
 *   POST   /api/crm/cohorts/[id]/staff   { name, email, role }
 *   DELETE /api/crm/cohorts/[id]/staff?userId=…
 *
 * Wake appoints an instructor of record and puts a TA in the room, and both need
 * to sign in to the LMS: the TA takes the register for twenty-eight classes.
 * Until this existed they could only be added by running a script, which is not
 * a way to onboard a university.
 *
 * WHAT THIS DOES NOT DO, on purpose:
 *
 *   It does not make anyone an admin. A staff row grants that one cohort and
 *   nothing else — not the other cohorts, not the CRM, and for a TA not the
 *   coaching notes. The policy is one table in the LMS at lib/cohort-staff.ts.
 *
 *   It does not set a password, and it does not email anyone. It returns a
 *   one-hour set-password link for the admin to send, because sending it from
 *   here would mean a university employee receiving an unexplained email from a
 *   system they have not been told about yet. Dan or Caleb introduces them, with
 *   the link.
 *
 *   It never touches an existing account's role. If the address already belongs
 *   to somebody — a Fellow, an admin, a TA at another university — the row is
 *   added and the account is left exactly as it is.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomBytes } from "crypto";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ROLES = new Set(["INSTRUCTOR", "TA"]);
const LMS = process.env.LMS_URL ?? "https://lms.vantagecareer.co";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") return null;
  return session;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const staff = await prisma.cohortStaff.findMany({
    where:   { cohortId: params.id },
    orderBy: { addedAt: "asc" },
    select: {
      role: true, addedAt: true, addedBy: true,
      user: { select: { id: true, name: true, email: true, role: true, withdrawnAt: true } },
    },
  });

  return NextResponse.json({
    staff: staff.map(s => ({
      userId: s.user.id, name: s.user.name, email: s.user.email,
      role: s.role, addedAt: s.addedAt, addedBy: s.addedBy,
      /** An account that cannot sign in yet, so the link still has to be sent. */
      neverSignedIn: s.user.role === "STAFF" && !s.user.withdrawnAt,
      globalRole: s.user.role,
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, email, role } = await req.json() as { name?: string; email?: string; role?: string };
  const cleanEmail = email?.trim().toLowerCase();
  if (!name?.trim() || !cleanEmail) return NextResponse.json({ error: "Name and email, please." }, { status: 400 });
  if (!ROLES.has(role ?? "")) {
    return NextResponse.json({ error: "Role has to be INSTRUCTOR or TA." }, { status: 400 });
  }

  const cohort = await prisma.cohort.findUnique({
    where: { id: params.id }, select: { id: true, name: true },
  });
  if (!cohort) return NextResponse.json({ error: "No such cohort" }, { status: 404 });

  const existing = await prisma.user.findUnique({
    where: { email: cleanEmail }, select: { id: true, name: true, role: true },
  });

  /**
   * A new account is role STAFF: not STUDENT, so it appears in no roster, no
   * metric, no digest and no chasing cron, all of which select STUDENT; and not
   * ADMIN, which would be everything everywhere.
   */
  const user = existing ?? await prisma.user.create({
    data: {
      email: cleanEmail,
      name: name.trim(),
      // Unusable until they set one through the link below.
      password: `nologin-${randomBytes(24).toString("hex")}`,
      role: "STAFF",
    },
    select: { id: true, name: true, role: true },
  });

  await prisma.cohortStaff.upsert({
    where:  { cohortId_userId: { cohortId: cohort.id, userId: user.id } },
    update: { role: role! },
    create: {
      cohortId: cohort.id, userId: user.id, role: role!,
      addedBy: (session.user as { email?: string }).email ?? "CRM",
    },
  });

  /**
   * A set-password link, for a brand new account only. Someone who already has
   * an account has a password, and minting a reset token for them would be a
   * password reset nobody asked for.
   */
  let setPasswordUrl: string | null = null;
  if (!existing) {
    const token = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    setPasswordUrl = `${LMS}/reset-password?token=${token}`;
  }

  return NextResponse.json({
    ok: true,
    userId: user.id,
    created: !existing,
    // Said plainly, because adding a Fellow's address as a TA would be a
    // mistake worth noticing immediately.
    joinedExistingAccount: existing ? `${existing.name} already has an account (${existing.role}). Added as staff; their account was not changed.` : null,
    setPasswordUrl,
    registerUrl: `${LMS}/teach/${cohort.id}`,
  }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Which person?" }, { status: 400 });

  /**
   * Removes the membership, never the account. The account is the record of what
   * they marked: every attendance row says who set it, and deleting the person
   * would take that with it.
   */
  const gone = await prisma.cohortStaff.deleteMany({ where: { cohortId: params.id, userId } });
  if (gone.count === 0) return NextResponse.json({ error: "They are not staff on this cohort." }, { status: 404 });

  return NextResponse.json({ ok: true, removed: gone.count, accountKept: true });
}
