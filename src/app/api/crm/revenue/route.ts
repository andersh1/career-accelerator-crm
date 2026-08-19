/**
 * GET /api/crm/revenue — revenue summary stats
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Total pipeline value (all non-lost leads with dealValue)
  const pipeline = await prisma.lead.aggregate({
    where: { deletedAt: null, stage: { not: "LOST" }, dealValue: { gt: 0 } },
    _sum: { dealValue: true },
    _count: { id: true },
  });

  // Enrolled only
  const enrolled = await prisma.lead.aggregate({
    where: { deletedAt: null, stage: "ENROLLED", dealValue: { gt: 0 } },
    _sum: { dealValue: true },
    _count: { id: true },
  });

  // Total actually collected (payment records)
  const collected = await prisma.paymentRecord.aggregate({
    _sum: { amount: true },
  });

  // By payment status breakdown
  const byStatus = await prisma.lead.groupBy({
    by: ["paymentStatus"],
    where: { stage: "ENROLLED" },
    _count: { id: true },
    _sum: { dealValue: true },
  });

  // Recent payments (last 5)
  const recentPayments = await prisma.paymentRecord.findMany({
    take: 5,
    orderBy: { paidAt: "desc" },
    include: { lead: { select: { firstName: true, lastName: true } } },
  });

  return NextResponse.json({
    pipelineValue:    pipeline._sum.dealValue ?? 0,
    pipelineCount:    pipeline._count.id,
    enrolledValue:    enrolled._sum.dealValue ?? 0,
    enrolledCount:    enrolled._count.id,
    totalCollected:   collected._sum.amount ?? 0,
    byStatus,
    recentPayments,
  });
}
