import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const u = (session as { user?: { role?: string; crmRole?: string } } | null)?.user;
  if (!u || u.role !== "ADMIN" || u.crmRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { keepId, mergeId } = await req.json() as { keepId?: string; mergeId?: string };
  if (!keepId || !mergeId || keepId === mergeId) {
    return NextResponse.json({ error: "Invalid IDs" }, { status: 400 });
  }

  const [keep, merge] = await Promise.all([
    prisma.lead.findUnique({ where: { id: keepId } }),
    prisma.lead.findUnique({ where: { id: mergeId } }),
  ]);

  if (!keep || !merge) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  // Fill nulls in keepId from mergeId, merge tags de-duped
  const mergedTags = Array.from(new Set([...keep.tags, ...merge.tags]));

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: keepId },
      data: {
        phone:       keep.phone       ?? merge.phone,
        company:     keep.company     ?? merge.company,
        jobTitle:    keep.jobTitle    ?? merge.jobTitle,
        linkedinUrl: keep.linkedinUrl ?? merge.linkedinUrl,
        source:      keep.source      ?? merge.source,
        assignedTo:  keep.assignedTo  ?? merge.assignedTo,
        dealValue:   keep.dealValue   ?? merge.dealValue,
        notes:       keep.notes       ?? merge.notes,
        tags:        mergedTags,
      },
    }),
    prisma.leadActivity.updateMany({
      where:  { leadId: mergeId },
      data:   { leadId: keepId },
    }),
    prisma.lead.delete({ where: { id: mergeId } }),
  ]);

  return NextResponse.json({ ok: true, keepId });
}
