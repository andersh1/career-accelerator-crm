import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enrichFromEmail } from "@/lib/enrichment";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { leadId } = await req.json() as { leadId: string };
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { email: true, company: true } });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const enriched = await enrichFromEmail(lead.email);
  if (!enriched) return NextResponse.json({ enriched: false, message: "No data found for this email domain" });

  const updates: Record<string, string> = {};
  if (!lead.company && enriched.company) updates.company = enriched.company;

  if (Object.keys(updates).length > 0) {
    await prisma.lead.update({ where: { id: leadId }, data: updates });
  }

  return NextResponse.json({ enriched: true, data: enriched, updated: updates });
}
