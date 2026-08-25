/**
 * GET   /api/crm/email-templates — all editable templates
 * PATCH /api/crm/email-templates — { key, subject, body } save (admin only)
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const crmRole = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || crmRole !== "ADMIN") return null;
  return session;
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const templates = await prisma.emailTemplate.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(templates);
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { key, subject, body } = await req.json() as { key?: string; subject?: string; body?: string };
  if (!key || !subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "key, subject, and body are required" }, { status: 400 });
  }
  const updated = await prisma.emailTemplate.update({
    where: { key },
    data: { subject: subject.trim(), body, updatedBy: session.user?.email ?? null },
  }).catch(() => null);
  if (!updated) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  return NextResponse.json(updated);
}
