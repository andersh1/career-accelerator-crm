import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requireAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return !session || (session as { user?: { role?: string } }).user?.role !== "ADMIN";
}
function requireCrmAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return requireAdmin(session) || (session as { user?: { crmRole?: string } }).user?.crmRole !== "ADMIN";
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    ids: string[];
    action: "stage" | "priority" | "tag" | "delete";
    value?: string;
    tag?: string;
  };

  const { ids, action, value, tag } = body;

  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: "No IDs provided" }, { status: 400 });

  if (action === "stage") {
    if (!value) return NextResponse.json({ error: "Missing stage value" }, { status: 400 });
    await prisma.lead.updateMany({ where: { id: { in: ids } }, data: { stage: value } });
    return NextResponse.json({ updated: ids.length });
  }

  if (action === "priority") {
    if (!value) return NextResponse.json({ error: "Missing priority value" }, { status: 400 });
    await prisma.lead.updateMany({ where: { id: { in: ids } }, data: { priority: value } });
    return NextResponse.json({ updated: ids.length });
  }

  if (action === "tag") {
    if (!tag) return NextResponse.json({ error: "Missing tag value" }, { status: 400 });
    // Add tag to each lead (avoid duplicates)
    const leads = await prisma.lead.findMany({ where: { id: { in: ids } }, select: { id: true, tags: true } });
    await Promise.all(leads.map(lead => {
      const tags = lead.tags.includes(tag) ? lead.tags : [...lead.tags, tag];
      return prisma.lead.update({ where: { id: lead.id }, data: { tags } });
    }));
    return NextResponse.json({ updated: ids.length });
  }

  if (action === "delete") {
    if (requireCrmAdmin(session)) return NextResponse.json({ error: "Requires CRM Admin role" }, { status: 403 });
    await prisma.lead.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });
    return NextResponse.json({ deleted: ids.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
