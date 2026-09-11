import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function isAdmin() {
  const s = await getServerSession(authOptions);
  const u = (s as { user?: { role?: string; crmRole?: string } } | null)?.user;
  return !!u && (u.role === "ADMIN" || u.crmRole === "ADMIN");
}

/** Everything at one institution, in one place — the point of the layer. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await isAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const org = await prisma.organization.findUnique({
    where: { id: params.id },
    include: {
      contacts: {
        select: { id: true, firstName: true, lastName: true, email: true, jobTitle: true, tags: true },
        orderBy: { firstName: "asc" },
      },
      deals: {
        select: { id: true, title: true, status: true, dealType: true, seats: true, totalValue: true, startDate: true },
        orderBy: { createdAt: "desc" },
      },
      events: {
        select: { id: true, title: true, slug: true, startsAt: true, location: true },
        orderBy: { startsAt: "desc" },
      },
      promoCodes: { select: { id: true, code: true, discountPct: true, usedCount: true, active: true } },
    },
  });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(org);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await isAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name    !== undefined) data.name    = body.name?.trim() || undefined;
  if (body.type    !== undefined) data.type    = body.type;
  if (body.website !== undefined) data.website = body.website?.trim() || null;
  if (body.notes   !== undefined) data.notes   = body.notes?.trim() || null;
  const org = await prisma.organization.update({ where: { id: params.id }, data });
  return NextResponse.json(org);
}
