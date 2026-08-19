/**
 * GET  /api/crm/leads/[id]/payments  — list payment records
 * POST /api/crm/leads/[id]/payments  — add payment record
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const records = await prisma.paymentRecord.findMany({
    where: { leadId: id },
    orderBy: { paidAt: "desc" },
  });

  const total = records.reduce((sum, r) => sum + r.amount, 0);
  return NextResponse.json({ records, total });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const adminId = (session.user as { id: string }).id;
  const { amount, note, paidAt } = await req.json() as { amount: number; note?: string; paidAt?: string };

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
  }

  // Verify lead exists
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const record = await prisma.paymentRecord.create({
    data: {
      leadId:    id,
      amount:    Math.round(amount),
      note:      note?.trim() ?? null,
      paidAt:    paidAt ? new Date(paidAt) : new Date(),
      createdBy: adminId,
    },
  });

  // Log activity
  const totalPaid = await prisma.paymentRecord.aggregate({
    where: { leadId: id },
    _sum: { amount: true },
  });

  await prisma.leadActivity.create({
    data: {
      leadId:    id,
      type:      "NOTE",
      content:   `Payment recorded: $${amount.toLocaleString()}${note ? ` — ${note}` : ""}. Total paid: $${(totalPaid._sum.amount ?? 0).toLocaleString()}`,
      createdBy: adminId,
    },
  });

  return NextResponse.json(record, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const u = (session as { user?: { role?: string; crmRole?: string } } | null)?.user;
  if (!u || u.role !== "ADMIN" || u.crmRole !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const recordId = new URL(req.url).searchParams.get("recordId");
  if (!recordId) return NextResponse.json({ error: "recordId required" }, { status: 400 });

  const record = await prisma.paymentRecord.findUnique({ where: { id: recordId } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.leadId !== id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.paymentRecord.delete({ where: { id: recordId } });
  return NextResponse.json({ ok: true });
}
