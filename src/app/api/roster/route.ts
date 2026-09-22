import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// GET /api/roster — enrolled Fellows, for the Readiness Grader's instructor view
// so it can show who hasn't graded yet. Server-to-server: gated by a shared
// bearer secret (ROSTER_API_SECRET), not a user session. Read-only, no PII beyond
// name/email/cohort.
export async function GET(req: NextRequest) {
  const secret = process.env.ROSTER_API_SECRET;
  if (!secret) return NextResponse.json({ error: "Roster API not configured" }, { status: 503 });
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const students = await prisma.user.findMany({
    where: { role: "STUDENT", withdrawnAt: null },
    select: { name: true, email: true, cohort: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    students
      .filter((s) => s.email)
      .map((s) => ({ name: s.name ?? s.email, email: (s.email ?? "").toLowerCase(), cohort: s.cohort }))
  );
}
