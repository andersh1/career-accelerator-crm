/** POST /api/crm/email-templates/test — { key } → sends a sample render to the logged-in admin. */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendTemplateTest } from "@/lib/email";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const crmRole = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || crmRole !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const to = session.user?.email;
  if (!to) return NextResponse.json({ error: "No email on your account" }, { status: 400 });

  const { key } = await req.json() as { key?: string };
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const result = await sendTemplateTest(key, to);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
  return NextResponse.json({ ok: true, to });
}
