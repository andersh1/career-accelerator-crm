/**
 * Zoom Server-to-Server OAuth client.
 *
 * A copy of the LMS's src/lib/zoom.ts, extended with update and an alternative
 * host. Deliberate, like src/lib/networking-enroll.ts: the two apps share a
 * database but not a package, and cohort sessions are built here while the LMS
 * only ever reads the link off the schedule. If this behaviour changes, change
 * it in both.
 *
 * The Zoom app is already created and authorized against the Career
 * Accelerator account. Its credentials are on the LMS Vercel project, which is
 * how the 1:1 booking route has been creating real meetings since September.
 * The same three values are needed here:
 *   ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
 *
 * Every function no-ops rather than throwing when the credentials are absent,
 * so this is safe to ship before the CRM project has them. `zoomConfigured()`
 * is exported so a caller can say so out loud instead of reporting a silent
 * success, which is the mistake the networking mirror made.
 */

const ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID ?? "";
const CLIENT_ID = process.env.ZOOM_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET ?? "";

/**
 * Who can start and record the meeting besides the account that owns it.
 *
 * `users/me` is the Career Accelerator Zoom account, so that account is the
 * host and anyone else joins as a participant, unable to start the session or
 * record it. Dan runs the sessions, so he goes on as an alternative host.
 *
 * Zoom only accepts an alternative host who is a licensed user in the SAME
 * account. If Dan is not, Zoom rejects the whole create call, so this is
 * configurable and the caller reports what Zoom said rather than failing mute.
 *
 * One variable, used twice: the same person is added to the calendar event as
 * a guest, so he has the session in his own calendar as well as the rights to
 * start it. Two variables for one human is a way to end up with a host who was
 * never invited.
 */
export const SESSION_HOST_EMAIL = process.env.SESSION_HOST_EMAIL ?? "";
const ALTERNATIVE_HOSTS = SESSION_HOST_EMAIL;

export const zoomConfigured = () =>
  ACCOUNT_ID.length > 0 && CLIENT_ID.length > 0 && CLIENT_SECRET.length > 0;

export interface ZoomMeeting {
  id: string;
  join_url: string;
  start_url: string;
  password?: string;
}

/** Exchange client credentials for a short-lived access token. */
async function getAccessToken(): Promise<string> {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ACCOUNT_ID}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`Zoom token error: ${await res.text()}`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Zoom returned no access token");
  return data.access_token;
}

/**
 * The settings every cohort session gets.
 *
 * Waiting room on and mute on entry match the 1:1 meetings, so a Fellow's
 * experience is the same whichever kind of session they join. Recording stays
 * off: a session is recorded by choice, and "record everything by default" is
 * not a decision this button should make for Dan.
 */
function meetingSettings() {
  return {
    host_video: true,
    participant_video: true,
    join_before_host: false,
    waiting_room: true,
    mute_upon_entry: true,
    auto_recording: "none",
    ...(ALTERNATIVE_HOSTS ? { alternative_hosts: ALTERNATIVE_HOSTS } : {}),
  };
}

/** Create one scheduled meeting. Returns null when Zoom is not configured. */
export async function createZoomMeeting(opts: {
  topic: string;
  startTime: Date;
  duration: number; // minutes
  agenda?: string;
  timezone?: string;
}): Promise<ZoomMeeting> {
  const token = await getAccessToken();
  const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: opts.topic,
      type: 2, // scheduled
      start_time: opts.startTime.toISOString(),
      duration: opts.duration,
      timezone: opts.timezone ?? "America/New_York",
      ...(opts.agenda ? { agenda: opts.agenda } : {}),
      settings: meetingSettings(),
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Zoom create failed (${res.status}): ${await res.text()}`);
  const m = (await res.json()) as { id: number | string; join_url: string; start_url: string; password?: string };
  return {
    id: String(m.id),
    join_url: m.join_url,
    start_url: m.start_url,
    password: m.password,
  };
}

/**
 * Move an existing meeting.
 *
 * This is the function that makes the whole feature re-runnable. A session that
 * shifts for a holiday keeps its meeting number and its join link, so the link
 * already sitting in the LMS, in a Fellow's calendar and in a sent email stays
 * correct. Creating a replacement instead would leave all three pointing at a
 * meeting that no longer matches the schedule.
 *
 * Zoom answers PATCH with 204 and no body.
 */
export async function updateZoomMeeting(
  meetingId: string,
  opts: { topic?: string; startTime?: Date; duration?: number; agenda?: string; timezone?: string },
): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(opts.topic ? { topic: opts.topic } : {}),
      ...(opts.startTime ? { start_time: opts.startTime.toISOString() } : {}),
      ...(opts.duration ? { duration: opts.duration } : {}),
      ...(opts.agenda ? { agenda: opts.agenda } : {}),
      timezone: opts.timezone ?? "America/New_York",
      settings: meetingSettings(),
    }),
    cache: "no-store",
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Zoom update failed (${res.status}): ${await res.text()}`);
  }
}

/** Fetch a meeting, to tell "deleted in Zoom" apart from "never created". */
export async function getZoomMeeting(meetingId: string): Promise<ZoomMeeting | null> {
  const token = await getAccessToken();
  const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Zoom read failed (${res.status}): ${await res.text()}`);
  const m = (await res.json()) as { id: number | string; join_url: string; start_url: string; password?: string };
  return { id: String(m.id), join_url: m.join_url, start_url: m.start_url, password: m.password };
}

/** Delete a meeting. A 404 is success: it is already gone. */
export async function deleteZoomMeeting(meetingId: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    throw new Error(`Zoom delete failed (${res.status}): ${await res.text()}`);
  }
}
