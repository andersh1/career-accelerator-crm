import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { postRecordingToLms } from "@/lib/recording-sync";

/**
 * PATCH /api/crm/cohorts/[id]/recording  { moduleId, deckUrl?, recordingUrl? }
 *
 * Puts one module's slide deck and session recording in front of THIS cohort's
 * Fellows. See src/lib/recording-sync.ts for why the write goes through the LMS
 * rather than straight into the shared database.
 *
 * Reports failure honestly. A save that says it worked and did not is the kind
 * of bug that costs trust in the whole page.
 */
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  return !!session && role === "ADMIN";
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { moduleId } = body;
  if (!moduleId) return NextResponse.json({ error: "moduleId required" }, { status: 400 });

  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  const result = await postRecordingToLms({
    cohortId: params.id,
    moduleId,
    ...(has("deckUrl")      ? { deckUrl:      body.deckUrl      as string | null } : {}),
    ...(has("recordingUrl") ? { recordingUrl: body.recordingUrl as string | null } : {}),
  });

  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 502 });
  return NextResponse.json({ deckUrl: result.deckUrl, recordingUrl: result.recordingUrl });
}
