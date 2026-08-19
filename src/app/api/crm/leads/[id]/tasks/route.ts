import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function adminId(session: Awaited<ReturnType<typeof getServerSession>>) {
  return (session as { user: { id: string; role: string } }).user;
}

// GET — list tasks for a lead
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = adminId(session);
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tasks = await prisma.task.findMany({
    where:   { leadId: params.id },
    orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(tasks);
}

// POST — create task
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = adminId(session);
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { title, notes, dueAt, assignedTo } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const task = await prisma.task.create({
    data: {
      leadId:     params.id,
      title:      title.trim(),
      notes:      notes || null,
      dueAt:      dueAt ? new Date(dueAt) : null,
      createdBy:  user.id,
      assignedTo: assignedTo || null,
    },
  });
  return NextResponse.json(task, { status: 201 });
}
