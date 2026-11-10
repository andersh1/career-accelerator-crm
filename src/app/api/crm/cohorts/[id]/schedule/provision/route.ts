/**
 * GET  /api/crm/cohorts/[id]/schedule/provision   — what a run would do, and what it needs
 * POST /api/crm/cohorts/[id]/schedule/provision   { moduleNumbers?, replaceManual?, dryRun? }
 *
 * Build a cohort's live sessions in one press: a Zoom meeting per session, a
 * Google Calendar event per session with every enrolled Fellow invited, and the
 * Zoom link written back onto the schedule so the LMS shows it.
 *
 * Nothing new has to be built downstream. The LMS reads `sessionZoomLink` for
 * the session-day email's join button and for the Fellow's calendar feed, and
 * Google sends the calendar invitation itself. This route only fills the field
 * those paths already read.
 *
 * RE-RUNNABLE BY DESIGN. Each row remembers the meeting and event it owns, so a
 * second press updates rather than duplicating, and a session moved for a
 * holiday keeps its meeting number and its join link. That is the point: the
 * link is already in a sent email and in somebody's calendar by the time a date
 * moves, so the meeting has to move, not be replaced.
 *
 * It will not touch a hand-pasted link unless asked. A row with a link but no
 * meeting id belongs to a meeting somebody made in Zoom by hand, and silently
 * replacing it would strand whoever already has that link.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  zoomConfigured, createZoomMeeting, updateZoomMeeting, getZoomMeeting,
  SESSION_HOST_EMAIL,
} from "@/lib/zoom";
import {
  googleConfigured, getAccessToken, hasCalendarScope, listWritableCalendars,
  createCalendarEvent, updateCalendarEvent, type CalendarAttendee, type EventInput,
} from "@/lib/google-calendar";

const SESSION_MINUTES = 60;

function forbidden(session: unknown) {
  const u = (session as { user?: { role?: string; crmRole?: string } } | null)?.user;
  return !session || u?.role !== "ADMIN" || u?.crmRole !== "ADMIN";
}

/**
 * The meeting title, following the house convention:
 *   `<Type> — <topic> (TIME ET)`
 * recorded in the Zoom session conventions. Fellows see this in Zoom and on the
 * calendar entry, so it is the one place the convention actually shows.
 */
function sessionTitle(moduleNumber: number, title: string, when: Date) {
  const time = when.toLocaleTimeString("en-US", {
    timeZone: "America/New_York", hour: "numeric", minute: "2-digit",
  });
  return `Working Session — Module ${moduleNumber}: ${title} (${time} ET)`;
}

/** Everything the run needs, gathered once so failures are reported together. */
async function preflight(cohortId: string, adminId: string) {
  const cohort = await prisma.cohort.findUnique({
    where: { id: cohortId },
    select: { id: true, name: true, track: true, calendarId: true },
  });
  if (!cohort) return { error: "Cohort not found", status: 404 as const };

  const rows = await prisma.cohortSchedule.findMany({
    where: { cohortId },
    orderBy: { module: { number: "asc" } },
    select: {
      id: true, sessionDate: true, sessionZoomLink: true, titleOverride: true,
      sessionZoomMeetingId: true, sessionCalendarEventId: true, sessionProvisionedAt: true,
      module: { select: { number: true, title: true } },
    },
  });

  /**
   * Who gets invited: every Fellow on the cohort who has not withdrawn.
   *
   * Test accounts are deliberately included. They are excluded from metrics,
   * never from sends, and a session nobody on the test seats can join is a
   * session nobody can rehearse.
   */
  const fellows = await prisma.user.findMany({
    where: { cohortId, role: "STUDENT", withdrawnAt: null },
    select: { name: true, email: true },
    orderBy: { name: "asc" },
  });

  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    select: { gmailRefreshToken: true, gmailEmail: true },
  });

  return { cohort, rows, fellows, admin };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (forbidden(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminId = (session as { user: { id: string } }).user.id;

  const pre = await preflight(params.id, adminId);
  if ("error" in pre) return NextResponse.json({ error: pre.error }, { status: pre.status });
  const { cohort, rows, fellows, admin } = pre;

  const blockers: string[] = [];
  if (!zoomConfigured()) {
    blockers.push("Zoom is not configured on this deployment. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET on the CRM project, then redeploy.");
  }
  if (!googleConfigured()) {
    blockers.push("Google is not configured on this deployment. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing.");
  }
  if (!admin?.gmailRefreshToken) {
    blockers.push("Your Google account is not connected. Connect it in Settings, then come back.");
  }
  if (!fellows.length) {
    blockers.push("Nobody is enrolled on this cohort yet, so there is no one to invite.");
  }
  const datedRows = rows.filter(r => r.sessionDate);
  if (!datedRows.length) {
    blockers.push("No session dates are set. Build the schedule first.");
  }

  // Only ask Google anything once the stored token is known to exist.
  let calendars: { id: string; summary: string; primary: boolean }[] = [];
  let scopeOk: boolean | null = null;
  if (admin?.gmailRefreshToken && googleConfigured()) {
    try {
      const token = await getAccessToken(admin.gmailRefreshToken);
      scopeOk = await hasCalendarScope(token);
      if (!scopeOk) {
        blockers.push("Your Google connection predates calendar access. Disconnect and reconnect Google in Settings to grant it.");
      } else {
        calendars = (await listWritableCalendars(token))
          .map(c => ({ id: c.id, summary: c.summary, primary: c.primary }));
      }
    } catch (e) {
      blockers.push(e instanceof Error ? e.message : "Could not reach Google.");
    }
  }

  return NextResponse.json({
    cohort: { id: cohort.id, name: cohort.name, calendarId: cohort.calendarId },
    hostEmail: SESSION_HOST_EMAIL || null,
    connectedAs: admin?.gmailEmail ?? null,
    calendars,
    scopeOk,
    blockers,
    fellows: fellows.map(f => ({ name: f.name, email: f.email })),
    sessions: datedRows.map(r => ({
      moduleNumber: r.module.number,
      title: r.titleOverride ?? r.module.title,
      sessionDate: r.sessionDate,
      owned: !!r.sessionZoomMeetingId,
      hasManualLink: !!r.sessionZoomLink && !r.sessionZoomMeetingId,
      provisionedAt: r.sessionProvisionedAt,
      action: r.sessionZoomMeetingId
        ? "update"
        : r.sessionZoomLink ? "skip (link pasted by hand)" : "create",
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (forbidden(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminId = (session as { user: { id: string } }).user.id;

  const body = await req.json().catch(() => ({})) as {
    moduleNumbers?: number[];
    replaceManual?: boolean;
    dryRun?: boolean;
    calendarId?: string;
  };
  const { moduleNumbers, replaceManual = false, dryRun = false } = body;

  const pre = await preflight(params.id, adminId);
  if ("error" in pre) return NextResponse.json({ error: pre.error }, { status: pre.status });
  const { cohort, rows, fellows, admin } = pre;

  if (!zoomConfigured()) {
    return NextResponse.json({ error: "Zoom is not configured on this deployment. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET on the CRM project, then redeploy." }, { status: 400 });
  }
  if (!admin?.gmailRefreshToken) {
    return NextResponse.json({ error: "Your Google account is not connected. Connect it in Settings first." }, { status: 400 });
  }
  if (!fellows.length) {
    return NextResponse.json({ error: "Nobody is enrolled on this cohort, so there is no one to invite." }, { status: 400 });
  }

  /**
   * The calendar is settled before anything is created, and remembered on the
   * cohort. Eight events on the wrong calendar is eight invitations to the
   * wrong audience, and withdrawing them is manual.
   */
  const calendarId = body.calendarId ?? cohort.calendarId ?? "primary";

  const targets = rows.filter(r => {
    if (!r.sessionDate) return false;
    if (moduleNumbers?.length && !moduleNumbers.includes(r.module.number)) return false;
    if (r.sessionZoomMeetingId) return true;             // ours: update it
    if (r.sessionZoomLink && !replaceManual) return false; // theirs: leave alone
    return true;
  });

  if (!targets.length) {
    return NextResponse.json({ error: "Nothing to do. Every session either already has a meeting we own, or has a link somebody pasted in by hand." }, { status: 400 });
  }

  const attendees: CalendarAttendee[] = [
    ...fellows.map(f => ({ email: f.email, displayName: f.name ?? undefined })),
    ...(SESSION_HOST_EMAIL ? [{ email: SESSION_HOST_EMAIL }] : []),
  ];

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      calendarId,
      invites: attendees.map(a => a.email),
      wouldProcess: targets.map(r => ({
        moduleNumber: r.module.number,
        action: r.sessionZoomMeetingId ? "update" : "create",
        title: sessionTitle(r.module.number, r.titleOverride ?? r.module.title, r.sessionDate!),
        sessionDate: r.sessionDate,
      })),
    });
  }

  let token: string;
  try {
    token = await getAccessToken(admin.gmailRefreshToken);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Google token failed" }, { status: 400 });
  }
  if (!(await hasCalendarScope(token))) {
    return NextResponse.json({ error: "Your Google connection predates calendar access. Disconnect and reconnect Google in Settings to grant it." }, { status: 400 });
  }

  const results: { moduleNumber: number; action: string; ok: boolean; detail?: string }[] = [];

  /**
   * Sequential on purpose. Eight parallel creates would hit Zoom's per-second
   * rate limit, and the Resend incident that dropped a Fellow's email was
   * exactly this shape: a burst that looked fine until one request was thrown
   * away. Eight requests taking a few seconds is not worth the risk.
   *
   * Each session is committed as it succeeds, so a failure halfway leaves the
   * earlier sessions genuinely done and the run can simply be pressed again.
   */
  for (const row of targets) {
    const when = row.sessionDate!;
    const title = sessionTitle(row.module.number, row.titleOverride ?? row.module.title, when);
    const end = new Date(when.getTime() + SESSION_MINUTES * 60_000);

    try {
      // ── Zoom ────────────────────────────────────────────────────────────
      let meetingId = row.sessionZoomMeetingId;
      let joinUrl = row.sessionZoomLink;

      if (meetingId) {
        // Confirm it still exists: somebody may have deleted it in Zoom.
        const existing = await getZoomMeeting(meetingId);
        if (existing) {
          await updateZoomMeeting(meetingId, { topic: title, startTime: when, duration: SESSION_MINUTES });
          joinUrl = existing.join_url;
        } else {
          meetingId = null;
        }
      }
      if (!meetingId) {
        const created = await createZoomMeeting({
          topic: title, startTime: when, duration: SESSION_MINUTES,
          agenda: `${cohort.name} · Module ${row.module.number}`,
        });
        meetingId = created.id;
        joinUrl = created.join_url;
      }

      // ── Calendar ────────────────────────────────────────────────────────
      const ev: EventInput = {
        calendarId,
        summary: title,
        description: [
          `${cohort.name} · Module ${row.module.number}: ${row.titleOverride ?? row.module.title}`,
          "",
          joinUrl ? `Join: ${joinUrl}` : "",
        ].filter(Boolean).join("\n"),
        location: joinUrl ?? undefined,
        start: when,
        end,
        attendees,
      };

      let eventId = row.sessionCalendarEventId;
      if (eventId) {
        const outcome = await updateCalendarEvent(token, eventId, ev);
        if (outcome === "gone") eventId = null;
      }
      if (!eventId) {
        eventId = await createCalendarEvent(token, ev);
      }

      await prisma.cohortSchedule.update({
        where: { id: row.id },
        data: {
          sessionZoomLink: joinUrl,
          sessionZoomMeetingId: meetingId,
          sessionCalendarEventId: eventId,
          sessionProvisionedAt: new Date(),
        },
      });

      results.push({
        moduleNumber: row.module.number,
        action: row.sessionZoomMeetingId ? "updated" : "created",
        ok: true,
      });
    } catch (e) {
      results.push({
        moduleNumber: row.module.number,
        action: row.sessionZoomMeetingId ? "update" : "create",
        ok: false,
        detail: e instanceof Error ? e.message : "failed",
      });
    }
  }

  // Remember the calendar once a run has actually used it.
  if (results.some(r => r.ok) && cohort.calendarId !== calendarId) {
    await prisma.cohort.update({ where: { id: cohort.id }, data: { calendarId } });
  }

  const ok = results.filter(r => r.ok).length;
  return NextResponse.json({
    calendarId,
    invited: attendees.length,
    created: results.filter(r => r.ok && r.action === "created").length,
    updated: results.filter(r => r.ok && r.action === "updated").length,
    failed: results.length - ok,
    results,
  });
}
