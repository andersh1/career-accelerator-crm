import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requireAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return !session || (session as { user?: { role?: string } }).user?.role !== "ADMIN";
}

// PATCH — complete / uncomplete / update
export async function PATCH(req: NextRequest, { params }: { params: { taskId: string } }) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if ("completedAt" in body) data.completedAt = body.completedAt ? new Date(body.completedAt) : null;
  if ("title"       in body) data.title       = body.title;
  if ("notes"       in body) data.notes       = body.notes;
  if ("dueAt"       in body) data.dueAt       = body.dueAt ? new Date(body.dueAt) : null;

  const task = await prisma.task.update({ where: { id: params.taskId }, data });
  return NextResponse.json(task);
}

// DELETE
export async function DELETE(req: NextRequest, { params }: { params: { taskId: string } }) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.task.delete({ where: { id: params.taskId } });
  return NextResponse.json({ ok: true });
}
