import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STATUSES = new Set(["DRAFT", "APPROVED", "PUBLISHED", "ARCHIVED"]);

/**
 * Update one quote: approve it, record the trimmed wording, or note where it
 * ran.
 *
 * `quote` is deliberately not patchable. The Fellow's words stay as submitted
 * and a polished version goes in `editedQuote`, so there is always an original
 * to check a trimmed quote against. A library of quotes nobody can verify is
 * worth less than no library.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = (session as { user?: { crmRole?: string; name?: string; email?: string } } | null)?.user;
  if (!session || user?.crmRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { status, editedQuote, usedIn } = body;

  const existing = await prisma.testimonial.findUnique({
    where: { id: params.id },
    select: { status: true, approvedAt: true, approvedBy: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};

  if (status !== undefined) {
    if (!STATUSES.has(status)) return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    data.status = status;

    /**
     * Stamp who approved it, and when, on the move into APPROVED.
     *
     * Dan is the sole approver of anything Fellow-facing. Recording the name
     * is what makes that checkable later, when a quote is on a landing page
     * and somebody asks who cleared it. Moving back to DRAFT clears the stamp,
     * because a withdrawn approval that still reads as approved is worse than
     * none.
     */
    if (status === "APPROVED" && existing.status !== "APPROVED") {
      data.approvedBy = user?.name ?? user?.email ?? "unknown";
      data.approvedAt = new Date();
    }
    if (status === "DRAFT") {
      data.approvedBy = null;
      data.approvedAt = null;
    }
  }

  // Empty string clears the trimmed version back to the original.
  if (editedQuote !== undefined) data.editedQuote = editedQuote?.trim() || null;
  if (usedIn      !== undefined) data.usedIn      = usedIn?.trim() || null;

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.testimonial.update({ where: { id: params.id }, data });
  return NextResponse.json({ testimonial: updated });
}
