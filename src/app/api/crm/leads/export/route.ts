/**
 * GET /api/crm/leads/export — download all leads as CSV
 * Optional query params: stage, source, priority (same filters as /api/crm/leads)
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function esc(v: string | null | undefined): string {
  if (v == null || v === "") return "";
  const s = String(v);
  // Wrap in quotes if contains comma, quote, or newline
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const u = (session as { user?: { role?: string; crmRole?: string } } | null)?.user;
  if (!u || u.role !== "ADMIN" || u.crmRole !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const stage    = searchParams.get("stage");
  const source   = searchParams.get("source");
  const priority = searchParams.get("priority");

  const leads = await prisma.lead.findMany({
    where: {
      deletedAt: null,
      ...(stage    ? { stage }    : {}),
      ...(source   ? { source }   : {}),
      ...(priority ? { priority } : {}),
    },
    include: {
      enrolledUser: { select: { id: true, name: true, email: true } },
      _count: { select: { activities: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const headers = [
    "First Name", "Last Name", "Email", "Phone", "Company", "Job Title",
    "LinkedIn URL", "Stage", "Source", "Priority", "Deal Value", "Payment Status",
    "Tags", "Notes", "Lost Reason", "Assigned To",
    "LMS Student Name", "LMS Student Email",
    "Activity Count", "Created At", "Updated At",
  ];

  const rows = leads.map(l => [
    esc(l.firstName),
    esc(l.lastName),
    esc(l.email),
    esc(l.phone),
    esc(l.company),
    esc(l.jobTitle),
    esc(l.linkedinUrl),
    esc(l.stage),
    esc(l.source),
    esc(l.priority),
    l.dealValue != null ? String(l.dealValue) : "",
    esc(l.paymentStatus),
    esc(l.tags.join("; ")),
    esc(l.notes),
    esc(l.lostReason),
    esc(l.assignedTo),
    esc(l.enrolledUser?.name),
    esc(l.enrolledUser?.email),
    String(l._count.activities),
    l.createdAt.toISOString(),
    l.updatedAt.toISOString(),
  ].join(","));

  const csv = [headers.join(","), ...rows].join("\n");
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${date}.csv"`,
    },
  });
}
