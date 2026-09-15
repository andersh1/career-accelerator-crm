import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || (role !== "ADMIN" && role !== "MEMBER")) return null;
  return session;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const before = await prisma.crmIssue.findUnique({
    where: { id: params.id },
    select: { status: true, resolution: true, notify: true, assignee: true, title: true, type: true, source: true },
  });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.title       !== undefined) data.title       = body.title?.trim() || undefined;
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.type        !== undefined) data.type        = body.type;
  if (body.status      !== undefined) {
    data.status = body.status;
    // Stamp the close date on the way in, clear it if something is reopened —
    // "how long did that take" is only answerable if this is automatic.
    data.closedAt = body.status === "DONE" ? new Date() : null;
  }
  if (body.priority    !== undefined) data.priority    = body.priority;
  if (body.assignee    !== undefined) data.assignee    = body.assignee || null;
  if (body.tags        !== undefined) data.tags        = Array.isArray(body.tags) ? body.tags : [];
  if (body.linkedLeadId !== undefined) data.linkedLeadId = body.linkedLeadId || null;
  if (body.dueAt  !== undefined) data.dueAt  = typeof body.dueAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueAt)
                                                 ? new Date(`${body.dueAt}T17:00:00-04:00`) : null;
  if (body.notify !== undefined) data.notify = Array.isArray(body.notify) ? body.notify : [];
  if (body.source !== undefined) data.source = body.source?.trim() || null;
  if (body.resolution !== undefined) data.resolution = body.resolution?.trim() || null;

  const closer = (session.user as { email?: string; name?: string }).email ?? "someone";
  const closerName = (session.user as { name?: string }).name ?? closer;

  const closingNow = body.status === "DONE" && before.status !== "DONE";
  if (closingNow) data.resolvedBy = closer;

  const issue = await prisma.crmIssue.update({ where: { id: params.id }, data });

  /**
   * Tell the "Keep informed" list when it closes — in the CRM, not by email.
   *
   * The list was recorded and never used, so telling people was a manual step,
   * which is the step that gets skipped. This is a working tool the three of us
   * are in every day; a notification here is enough, and another automated
   * email is not.
   *
   * Only on the transition into DONE, so editing a finished task does not
   * re-announce it, and only when there is a resolution to read: "it's done"
   * with no "here's what we did" is a notification nobody needed.
   *
   * The feed is shared across admins, so the notice names who it is for.
   */
  const resolution = (issue.resolution ?? "").trim();
  if (closingNow && resolution) {
    const audience = Array.from(new Set(
      [...(issue.notify ?? []), issue.assignee ?? ""]
        .map(e => e.trim().toLowerCase())
        .filter(e => e && e !== closer.toLowerCase()),
    ));
    const firstNames = audience.map(e => {
      const local = e.split("@")[0].split(/[._+]/)[0];
      return local.charAt(0).toUpperCase() + local.slice(1);
    });
    await prisma.cRMNotification.create({
      data: {
        type:  "TASK_DONE",
        title: firstNames.length
          ? `For ${firstNames.join(" & ")} — done: ${issue.title}`
          : `Done: ${issue.title}`,
        body:  `${closerName}: ${resolution.length > 200 ? resolution.slice(0, 200) + "…" : resolution}`,
        href:  "/issues",
      },
    }).catch(err => console.error("[crm-issues] close notice failed:", err));
  }

  return NextResponse.json(issue);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.crmIssue.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
