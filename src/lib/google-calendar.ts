/**
 * Google Calendar, acting as a connected Vantage admin.
 *
 * Reuses the OAuth the CRM already has. `/api/auth/gmail` stores a refresh
 * token per admin in User.gmailRefreshToken, and the gmail-sync crons already
 * trade it for access tokens. The only thing added for calendar work is a
 * scope on that consent screen, which means one reconnect in Settings rather
 * than a second OAuth app.
 *
 * Events are created as the admin, on a calendar they can write to, with every
 * enrolled Fellow as a guest and `sendUpdates: all`, so GOOGLE sends the
 * invitation. That matters beyond convenience: it is the same mechanism as
 * building the event by hand today, so the invite arrives from the Vantage
 * Career calendar exactly as Fellows already expect, and it is not a marketing
 * send that would need its own approval.
 *
 * Guests can see each other, which is Google's default and Caleb's call: a
 * cohort already knows who is in it.
 */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";

export const googleConfigured = () => CLIENT_ID.length > 0 && CLIENT_SECRET.length > 0;

/** The scope a token needs before it can write events. */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export interface CalendarAttendee {
  email: string;
  displayName?: string;
}

/** Trade a stored refresh token for a short-lived access token. */
export async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!data.access_token) {
    /**
     * Name the two failures that look identical from the outside. An
     * `invalid_grant` means the admin revoked access or changed their
     * password, and the fix is reconnecting in Settings. Anything else is a
     * client misconfiguration, and reconnecting will not help.
     */
    const why = data.error === "invalid_grant"
      ? "Google rejected the stored token. Reconnect the Google account in Settings."
      : `${data.error ?? "unknown error"}: ${data.error_description ?? ""}`;
    throw new Error(`Google token exchange failed. ${why}`);
  }
  return data.access_token;
}

/**
 * Whether this token can actually write events.
 *
 * Worth one call before writing eight. A token minted before the calendar
 * scope was added will refresh happily and then fail on the first insert, by
 * which point some meetings exist and some do not. Checking first turns that
 * into one clear message that names the fix.
 */
export async function hasCalendarScope(accessToken: string): Promise<boolean> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    { cache: "no-store" },
  );
  if (!res.ok) return false;
  const info = (await res.json()) as { scope?: string };
  return (info.scope ?? "").split(/\s+/).includes(CALENDAR_SCOPE);
}

export interface CalendarRef {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
}

/**
 * The calendars this admin can write to, for the picker.
 *
 * Filtered to writer and owner, because an event cannot be created on a
 * calendar the account only reads. Offering one would produce a 403 at the
 * worst moment.
 */
export async function listWritableCalendars(accessToken: string): Promise<CalendarRef[]> {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=250",
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Could not list calendars (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as {
    items?: { id: string; summary: string; primary?: boolean; accessRole: string }[];
  };
  return (data.items ?? []).map(c => ({
    id: c.id,
    summary: c.summary,
    primary: !!c.primary,
    accessRole: c.accessRole,
  }));
}

export interface EventInput {
  calendarId: string;
  summary: string;
  description: string;
  location?: string;
  start: Date;
  end: Date;
  attendees: CalendarAttendee[];
  timezone?: string;
}

/**
 * Create an event and let Google send the invitations.
 *
 * `sendUpdates=all` is the line that makes this the user's existing workflow
 * rather than a new one: Google emails every guest an invitation they can
 * accept, from the Vantage Career calendar.
 */
export async function createCalendarEvent(token: string, ev: EventInput): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(ev.calendarId)}/events?sendUpdates=all&conferenceDataVersion=0`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody(ev)),
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`Calendar create failed (${res.status}): ${await res.text()}`);
  const created = (await res.json()) as { id: string };
  return created.id;
}

/**
 * Update an event in place, so a moved session does not become a second entry
 * in everybody's calendar. Google emails guests the change itself.
 *
 * A 404 or 410 means the event was deleted in Google by hand. The caller
 * treats that as "create a fresh one" rather than an error, because somebody
 * tidying their calendar should not break the button.
 */
export async function updateCalendarEvent(
  token: string,
  eventId: string,
  ev: EventInput,
): Promise<"updated" | "gone"> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(ev.calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody(ev)),
      cache: "no-store",
    },
  );
  if (res.status === 404 || res.status === 410) return "gone";
  if (!res.ok) throw new Error(`Calendar update failed (${res.status}): ${await res.text()}`);
  return "updated";
}

/** Cancel an event and tell the guests. */
export async function deleteCalendarEvent(
  token: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok && res.status !== 204 && res.status !== 404 && res.status !== 410) {
    throw new Error(`Calendar delete failed (${res.status}): ${await res.text()}`);
  }
}

function eventBody(ev: EventInput) {
  const tz = ev.timezone ?? "America/New_York";
  return {
    summary: ev.summary,
    description: ev.description,
    ...(ev.location ? { location: ev.location } : {}),
    start: { dateTime: ev.start.toISOString(), timeZone: tz },
    end: { dateTime: ev.end.toISOString(), timeZone: tz },
    attendees: ev.attendees.map(a => ({
      email: a.email,
      ...(a.displayName ? { displayName: a.displayName } : {}),
    })),
    guestsCanModify: false,
    guestsCanInviteOthers: false,
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 },
        { method: "popup", minutes: 30 },
      ],
    },
  };
}
