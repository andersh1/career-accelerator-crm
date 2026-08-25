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

  const { key, subject, body, enabled } = await req.json() as { key?: string; subject?: string; body?: string; enabled?: boolean };
  if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });
  const data: { subject?: string; body?: string; enabled?: boolean; updatedBy?: string | null } = {
    updatedBy: session.user?.email ?? null,
  };
  if (enabled !== undefined) data.enabled = enabled;
  if (subject !== undefined || body !== undefined) {
    if (!subject?.trim() || !body?.trim()) {
      return NextResponse.json({ error: "subject and body cannot be empty" }, { status: 400 });
    }
    data.subject = subject.trim();
    data.body = body;
  }
  const updated = await prisma.emailTemplate.update({
    where: { key },
    data,
  }).catch(() => null);
  if (!updated) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  return NextResponse.json(updated);
}
