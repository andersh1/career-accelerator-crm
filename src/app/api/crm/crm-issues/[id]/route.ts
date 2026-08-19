import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || (role !== "ADMIN" && role !== "MEMBER")) return null;
  return session;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.title       !== undefined) data.title       = body.title?.trim() || undefined;
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.type        !== undefined) data.type        = body.type;
  if (body.status      !== undefined) data.status      = body.status;
  if (body.priority    !== undefined) data.priority    = body.priority;
  if (body.assignee    !== undefined) data.assignee    = body.assignee || null;
  if (body.tags        !== undefined) data.tags        = Array.isArray(body.tags) ? body.tags : [];
  if (body.linkedLeadId !== undefined) data.linkedLeadId = body.linkedLeadId || null;

  const issue = await prisma.crmIssue.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(issue);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.crmIssue.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
