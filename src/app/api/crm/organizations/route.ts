/**
 * Partner organisations — the layer above contacts, deals and events.
 *
 * Before this, a deal held its org as free text, so "3i" and "3i NextGen" were
 * unrelated strings and nobody could see everyone at one institution together.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const s = await getServerSession(authOptions);
  const u = (s as { user?: { role?: string; crmRole?: string } } | null)?.user;
  return u && (u.role === "ADMIN" || u.crmRole === "ADMIN") ? s : null;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const orgs = await prisma.organization.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : {},
    include: { _count: { select: { contacts: true, deals: true, events: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(orgs);
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, type, website, notes } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  // Case-insensitive, because "3i" and "3I" are the same partner and the whole
  // point of this table is that one institution is one row.
  const existing = await prisma.organization.findFirst({
    where: { name: { equals: name.trim(), mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (existing) {
    return NextResponse.json({ error: `"${existing.name}" already exists.`, id: existing.id }, { status: 409 });
  }

  const org = await prisma.organization.create({
    data: {
      name: name.trim(),
      type: ["UNIVERSITY","EMPLOYER","RIA","MEMBERSHIP","AGENCY","OTHER"].includes(type) ? type : "OTHER",
      website: website?.trim() || null,
      notes: notes?.trim() || null,
      createdBy: (session as { user?: { email?: string } }).user?.email ?? null,
    },
  });
  return NextResponse.json(org, { status: 201 });
}
