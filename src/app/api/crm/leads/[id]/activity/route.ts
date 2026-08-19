import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_TYPES = ["NOTE", "EMAIL", "CALL", "MEETING"] as const;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { type, content, metadata } = await req.json();

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid activity type" }, { status: 400 });
  }
  if (!content?.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const activity = await prisma.leadActivity.create({
    data: {
      leadId:    params.id,
      type,
      content:   content.trim(),
      metadata:  metadata ?? null,
      createdBy: (session as { user: { id: string } }).user.id,
    },
  });

  await prisma.lead.update({ where: { id: params.id }, data: { updatedAt: new Date() } });

  return NextResponse.json(activity, { status: 201 });
}
