import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") return null;
  return session;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.active     !== undefined) data.active      = body.active;
  if (body.label      !== undefined) data.label       = body.label?.trim() || null;
  if (body.discountPct !== undefined) data.discountPct = body.discountPct != null ? Number(body.discountPct) : null;
  if (body.maxUses    !== undefined) data.maxUses     = body.maxUses != null && body.maxUses !== "" ? Number(body.maxUses) : null;
  if (body.expiresAt  !== undefined) data.expiresAt   = body.expiresAt ? new Date(body.expiresAt) : null;
  data.updatedAt = new Date();

  const promo = await prisma.promoCode.update({ where: { id: params.id }, data });
  return NextResponse.json(promo);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.promoCode.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
