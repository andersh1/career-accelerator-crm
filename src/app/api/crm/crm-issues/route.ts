import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requireAdmin() {
  return getServerSession(authOptions).then(session => {
    const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
    if (!session || (role !== "ADMIN" && role !== "MEMBER")) return null;
    return session;
  });
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status   = searchParams.get("status");
  const assignee = searchParams.get("assignee");
  const type     = searchParams.get("type");

  const issues = await prisma.crmIssue.findMany({
    where: {
      ...(status   ? { status }   : {}),
      ...(assignee ? { assignee } : {}),
      ...(type     ? { type }     : {}),
    },
    orderBy: [
      { status: "asc" },
      { createdAt: "desc" },
    ],
  });

  return NextResponse.json(issues);
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { title, description, type, priority, assignee, tags, linkedLeadId } = body;

  if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const issue = await prisma.crmIssue.create({
    data: {
      title:       title.trim(),
      description: description?.trim() || null,
      type:        type        || "BUG",
      priority:    priority    || "NORMAL",
      status:      "BACKLOG",
      assignee:    assignee    || null,
      tags:        Array.isArray(tags) ? tags : [],
      linkedLeadId: linkedLeadId || null,
      createdBy:   session.user?.email ?? null,
    },
  });

  return NextResponse.json(issue, { status: 201 });
}
