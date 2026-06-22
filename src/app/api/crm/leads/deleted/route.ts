import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requireAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return !session || (session as { user?: { role?: string } }).user?.role !== "ADMIN";
}
function requireCrmAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  const u = (session as { user?: { role?: string; crmRole?: string } }).user;
  return !session || u?.role !== "ADMIN" || u?.crmRole !== "ADMIN";
}

// GET — list soft-deleted leads
export async function GET() {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const leads = await prisma.lead.findMany({
    where: { deletedAt: { not: null } },
    select: {
      id: true, firstName: true, lastName: true, email: true,
      company: true, stage: true, deletedAt: true,
    },
    orderBy: { deletedAt: "desc" },
  });

  return NextResponse.json(leads);
}

// POST — restore or permanently delete a lead
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, action } = await req.json() as { id: string; action: "restore" | "purge" };
  if (!id || !action) return NextResponse.json({ error: "Missing id or action" }, { status: 400 });

  if (action === "restore") {
    await prisma.lead.update({ where: { id }, data: { deletedAt: null } });
    return NextResponse.json({ ok: true });
  }

  if (action === "purge") {
    if (requireCrmAdmin(session)) return NextResponse.json({ error: "Requires CRM Admin role" }, { status: 403 });
    await prisma.lead.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
