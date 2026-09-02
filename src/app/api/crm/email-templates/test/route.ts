/** POST /api/crm/email-templates/test — { key } → sends a sample render to the logged-in admin. */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendTemplateTest, sendModulePreamblePreview } from "@/lib/email";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const crmRole = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || crmRole !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { key, to: requestedTo } = await req.json() as { key?: string; to?: string };
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  // Defaults to the admin's own address. An explicit recipient is allowed so a
  // preview can be sent to whoever is reviewing the copy — but it is one
  // address, validated, and never a list, so this cannot become a send tool.
  const to = requestedTo?.trim() || session.user?.email;
  if (!to) return NextResponse.json({ error: "No email on your account" }, { status: 400 });
  if (!/^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/.test(to)) {
    return NextResponse.json({ error: "That doesn't look like a single email address" }, { status: 400 });
  }

  // Module preambles render through their own path (module CTA, per-cohort
  // dates) and must be previewable while still switched off — reading the copy
  // before enabling it is the entire point.
  const preamble = /^module-preamble-([1-8])$/.exec(key);
  const result = preamble
    ? await sendModulePreamblePreview({
        to,
        moduleNumber: Number(preamble[1]),
        firstName: (session.user?.name ?? "there").trim().split(/\s+/)[0],
      })
    : await sendTemplateTest(key, to);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
  return NextResponse.json({ ok: true, to });
}
