"use client";

/**
 * The Term tab: a university class's twenty-eight meetings.
 *
 * It takes the place of the Schedule tab for a UNIVERSITY cohort, rather than
 * sitting next to it. A class has one calendar, and offering both tabs would
 * invite somebody to fill in module rows that nothing reads, then wonder why the
 * dates in the LMS disagree with the dates on this screen.
 *
 * Generate always previews. The table shows what each meeting would become and,
 * on a regeneration, the date it has now, so a shift of the whole term reads as
 * a list of moves rather than a wall of dates to check by eye.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Check, AlertTriangle, CalendarDays, Video } from "lucide-react";

interface TermSession {
  id: string;
  sequence: number;
  kind: "ORIENTATION" | "WORKSHOP" | "LAB" | "DEMO_DAY";
  labKind: "SPRINT" | "STUDIO" | "JUDGMENT" | null;
  title: string;
  moduleNumber: number | null;
  moduleTitle: string | null;
  startsAt: string | null;
  preworkDue: string | null;
  minutes: number | null;
  location: string | null;
  zoomLink: string | null;
  provisionedAt: string | null;
  attendanceMarked: number;
}

interface PreviewRow {
  sequence: number;
  week: number;
  weekLabel: string;
  kind: TermSession["kind"];
  labKind: TermSession["labKind"];
  title: string;
  moduleNumber: number | null;
  startsAt: string;
  preworkDue: string;
  provisioned: boolean;
  currentStartsAt: string | null;
  isNew: boolean;
}

const KIND_LABEL: Record<TermSession["kind"], string> = {
  ORIENTATION: "Orientation",
  WORKSHOP:    "Workshop",
  LAB:         "Skills Lab",
  DEMO_DAY:    "Demo Day",
};

/** Eastern, because that is the only timezone this course happens in. */
function fmt(iso: string | null, opts: Intl.DateTimeFormatOptions = {}) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", ...opts,
  });
}

/** A naive ET string from the planner, formatted without re-interpreting it. */
function fmtNaive(naive: string) {
  const [date, time] = naive.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  const [hh, mm] = time.split(":").map(Number);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${weekday} ${month} ${d}, ${h12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
}

export default function TermTab({ cohortId, cohortName }: { cohortId: string; cohortName: string }) {
  const [sessions, setSessions] = useState<TermSession[] | null>(null);
  const [loading,  setLoading]  = useState(true);

  const [firstMeeting, setFirstMeeting] = useState("2027-01-12T14:00");
  const [secondOffset, setSecondOffset] = useState(2);
  const [minutes,      setMinutes]      = useState(75);
  const [location,     setLocation]     = useState("");
  const [zoomLink,     setZoomLink]     = useState("");

  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [errors,  setErrors]  = useState<string[]>([]);
  const [busy,    setBusy]    = useState(false);
  const [result,  setResult]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/crm/cohorts/${cohortId}/term`);
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions);
    }
    setLoading(false);
  }, [cohortId]);

  useEffect(() => { void load(); }, [load]);

  async function generate(apply: boolean) {
    setBusy(true);
    setResult(null);
    const res = await fetch(`/api/crm/cohorts/${cohortId}/term/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstMeeting,
        secondDayOffset: secondOffset,
        minutes,
        location: location.trim() || null,
        zoomLink: zoomLink.trim() || null,
        apply,
      }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setErrors(data.errors ?? [data.error ?? "Could not build the term."]);
      setPreview(null);
      return;
    }
    if (apply) {
      setPreview(null);
      setErrors([]);
      setResult(
        `Wrote ${data.written} meetings.` +
        (data.provisionedLeftAlone?.length ? ` ${data.provisionedLeftAlone.length} already have a Zoom room, so their links were left alone.` : "") +
        (data.orphans?.length ? ` Meetings ${data.orphans.join(", ")} are outside this term and were left in place, not deleted.` : ""),
      );
      await load();
      return;
    }
    setPreview(data.rows);
    setErrors(data.errors ?? []);
  }

  const moves = preview?.filter(r => !r.isNew && r.currentStartsAt &&
    new Date(r.currentStartsAt).getTime() !== new Date(`${r.startsAt}:00`).getTime()) ?? [];

  return (
    <div className="px-5 py-4 space-y-4">
      <p className="text-xs" style={{ color: "#5a6663" }}>
        <strong>{cohortName}</strong> is a university class: fourteen teaching weeks, two meetings a week,
        twenty-eight in all. Tuesday is the Workshop and Thursday is the Skills Lab. The shape of the term
        comes from the curriculum map, so this only asks for the first class and fills in the rest, spring
        break included.
      </p>

      {/* Generator */}
      <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: "#e4e0d6", background: "white" }}>
        <div className="flex items-center gap-2">
          <CalendarDays size={14} style={{ color: "#086c64" }} />
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "#086c64" }}>
            Lay out the term
          </span>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs" style={{ color: "#5a6663" }}>
            First class
            <input
              type="datetime-local"
              value={firstMeeting}
              onChange={e => setFirstMeeting(e.target.value.slice(0, 16))}
              className="mt-1 block px-3 py-2 text-sm rounded-xl focus:outline-none"
              style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
            />
          </label>
          <label className="text-xs" style={{ color: "#5a6663" }}>
            Second day
            <select
              value={secondOffset}
              onChange={e => setSecondOffset(Number(e.target.value))}
              className="mt-1 block px-3 py-2 text-sm rounded-xl focus:outline-none"
              style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
            >
              <option value={1}>the next day</option>
              <option value={2}>two days later (Tue and Thu)</option>
              <option value={3}>three days later (Mon and Thu)</option>
            </select>
          </label>
          <label className="text-xs" style={{ color: "#5a6663" }}>
            Minutes
            <input
              type="number"
              min={30}
              max={180}
              value={minutes}
              onChange={e => setMinutes(Number(e.target.value))}
              className="mt-1 block w-24 px-3 py-2 text-sm rounded-xl focus:outline-none"
              style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
            />
          </label>
          <label className="text-xs flex-1 min-w-[180px]" style={{ color: "#5a6663" }}>
            Room (optional)
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Farrell Hall 123"
              className="mt-1 block w-full px-3 py-2 text-sm rounded-xl focus:outline-none"
              style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
            />
          </label>
        </div>

        <label className="text-xs block" style={{ color: "#5a6663" }}>
          Zoom link for every meeting (optional, and only used on meetings that do not have one yet)
          <input
            value={zoomLink}
            onChange={e => setZoomLink(e.target.value)}
            placeholder="https://zoom.us/j/…"
            className="mt-1 block w-full px-3 py-2 text-sm rounded-xl focus:outline-none"
            style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
          />
        </label>

        <div className="flex gap-2">
          <button
            onClick={() => void generate(false)}
            disabled={busy || !firstMeeting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl transition disabled:opacity-40"
            style={{ border: "1px solid #086c64", color: "#086c64" }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CalendarDays size={14} />}
            Preview the term
          </button>
          {preview && errors.length === 0 && (
            <button
              onClick={() => void generate(true)}
              disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-xl transition disabled:opacity-40"
              style={{ background: "#086c64" }}
            >
              <Check size={14} />
              Save these {preview.length} meetings
            </button>
          )}
        </div>

        {errors.length > 0 && (
          <div className="rounded-xl p-3 text-xs space-y-1" style={{ background: "#fdf2f2", color: "#8a1c1c" }}>
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle size={13} /> This term cannot be saved yet
            </div>
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        {result && (
          <div className="rounded-xl p-3 text-xs" style={{ background: "#f0f7f6", color: "#086c64" }}>{result}</div>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#e4e0d6" }}>
          <div className="px-3 py-2 text-xs font-bold uppercase tracking-wide flex items-center justify-between"
               style={{ background: "#f8f6f1", color: "#086c64" }}>
            <span>Preview — {preview.length} meetings across {new Set(preview.map(r => r.week)).size} weeks</span>
            {moves.length > 0 && (
              <span style={{ color: "#8a5a1c" }}>{moves.length} existing meeting(s) would move</span>
            )}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: "#949598" }}>
                <th className="text-left px-3 py-1.5 font-semibold">#</th>
                <th className="text-left px-3 py-1.5 font-semibold">Week</th>
                <th className="text-left px-3 py-1.5 font-semibold">When</th>
                <th className="text-left px-3 py-1.5 font-semibold">Kind</th>
                <th className="text-left px-3 py-1.5 font-semibold">Title</th>
                <th className="text-left px-3 py-1.5 font-semibold">Pre-work due</th>
              </tr>
            </thead>
            <tbody>
              {preview.map(r => {
                const moved = !r.isNew && r.currentStartsAt &&
                  new Date(r.currentStartsAt).getTime() !== new Date(`${r.startsAt}:00`).getTime();
                return (
                  <tr key={r.sequence} className="border-t" style={{ borderColor: "#f0ede5" }}>
                    <td className="px-3 py-1.5" style={{ color: "#949598" }}>{r.sequence}</td>
                    <td className="px-3 py-1.5" style={{ color: "#5a6663" }}>
                      {r.week}
                      {r.moduleNumber !== null && <span style={{ color: "#949598" }}> · M{r.moduleNumber}</span>}
                    </td>
                    <td className="px-3 py-1.5" style={{ color: "#14211f" }}>
                      {fmtNaive(r.startsAt)}
                      {moved && (
                        <span className="block" style={{ color: "#8a5a1c" }}>
                          was {fmt(r.currentStartsAt, { weekday: "short", hour: "numeric", minute: "2-digit" })}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5" style={{ color: "#5a6663" }}>
                      {KIND_LABEL[r.kind]}
                      {r.labKind && <span style={{ color: "#949598" }}> · {r.labKind.toLowerCase()}</span>}
                    </td>
                    <td className="px-3 py-1.5" style={{ color: "#14211f" }}>{r.title}</td>
                    <td className="px-3 py-1.5" style={{ color: "#5a6663" }}>{fmtNaive(r.preworkDue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* What is saved now */}
      {loading && <p className="text-xs" style={{ color: "#949598" }}>Loading the term…</p>}

      {!loading && sessions && sessions.length === 0 && !preview && (
        <p className="text-xs" style={{ color: "#949598" }}>
          No meetings saved yet. Preview the term above, read it, then save.
        </p>
      )}

      {!loading && sessions && sessions.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#e4e0d6" }}>
          <div className="px-3 py-2 text-xs font-bold uppercase tracking-wide"
               style={{ background: "#f8f6f1", color: "#086c64" }}>
            Saved — {sessions.length} meetings
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: "#949598" }}>
                <th className="text-left px-3 py-1.5 font-semibold">#</th>
                <th className="text-left px-3 py-1.5 font-semibold">When</th>
                <th className="text-left px-3 py-1.5 font-semibold">Kind</th>
                <th className="text-left px-3 py-1.5 font-semibold">Title</th>
                <th className="text-left px-3 py-1.5 font-semibold">Room</th>
                <th className="text-left px-3 py-1.5 font-semibold">Zoom</th>
                <th className="text-left px-3 py-1.5 font-semibold">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} className="border-t" style={{ borderColor: "#f0ede5" }}>
                  <td className="px-3 py-1.5" style={{ color: "#949598" }}>{s.sequence}</td>
                  <td className="px-3 py-1.5" style={{ color: "#14211f" }}>
                    {fmt(s.startsAt, { weekday: "short", hour: "numeric", minute: "2-digit" })}
                  </td>
                  <td className="px-3 py-1.5" style={{ color: "#5a6663" }}>
                    {KIND_LABEL[s.kind]}
                    {s.labKind && <span style={{ color: "#949598" }}> · {s.labKind.toLowerCase()}</span>}
                  </td>
                  <td className="px-3 py-1.5" style={{ color: "#14211f" }}>{s.title}</td>
                  <td className="px-3 py-1.5" style={{ color: "#5a6663" }}>{s.location ?? "—"}</td>
                  <td className="px-3 py-1.5">
                    {s.zoomLink
                      ? <Video size={13} style={{ color: s.provisionedAt ? "#086c64" : "#949598" }} />
                      : <span style={{ color: "#949598" }}>—</span>}
                  </td>
                  <td className="px-3 py-1.5" style={{ color: s.attendanceMarked ? "#14211f" : "#949598" }}>
                    {s.attendanceMarked ? `${s.attendanceMarked} marked` : "not marked"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
