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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const codes = await prisma.promoCode.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(codes);
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { code, label, discountPct, maxUses, expiresAt } = await req.json();
  if (!code?.trim()) return NextResponse.json({ error: "Code is required" }, { status: 400 });

  const normalized = (code as string).trim().toUpperCase().replace(/\s+/g, "");

  try {
    const promo = await prisma.promoCode.create({
      data: {
        code:        normalized,
        label:       label?.trim() || null,
        discountPct: discountPct != null ? Number(discountPct) : null,
        maxUses:     maxUses != null && maxUses !== "" ? Number(maxUses) : null,
        expiresAt:   expiresAt ? new Date(expiresAt) : null,
      },
    });
    return NextResponse.json(promo, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Code already exists" }, { status: 409 });
    throw e;
  }
}
