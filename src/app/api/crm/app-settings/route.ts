import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_KEYS = [
  "slack_webhook_url", "proposal_program_name", "proposal_tagline", "proposal_footer",
  "automation.stale-escalation", "automation.stale-notification",
  "automation.proposal-followup", "automation.qualified-trigger",
  "automation.proposal-trigger", "automation.enrolled-trigger",
  "webhook_url", "zapier_webhook_url",
];

function requireAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return !session || (session as { user?: { crmRole?: string } }).user?.crmRole !== "ADMIN";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settings = await prisma.appSetting.findMany({ where: { key: { in: ALLOWED_KEYS } } });
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
  return NextResponse.json(map);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as Record<string, string>;

  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_KEYS.includes(key)) continue;
    await prisma.appSetting.upsert({
      where:  { key },
      create: { key, value },
      update: { value },
    });
  }
  return NextResponse.json({ ok: true });
}
