"use client";

/**
 * Build a cohort's live sessions in one press.
 *
 * Creates a Zoom meeting per session, puts each on a Vantage calendar with
 * every enrolled Fellow invited, and writes the Zoom link back onto the
 * schedule, where the LMS already reads it for the session-day email and the
 * Fellow's calendar feed.
 *
 * The panel always shows what WILL happen before anything happens: which
 * calendar, who gets invited, and per session whether it will be created,
 * updated or left alone. Eight calendar invitations cannot be unsent, so the
 * cost of a wrong press is high enough to earn a preview.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Video, Loader2, CalendarPlus, AlertTriangle, Check, RefreshCw, ChevronDown, Users,
} from "lucide-react";
import { useToast } from "@/lib/toast";

interface SessionRow {
  moduleNumber: number;
  title: string;
  sessionDate: string | null;
  owned: boolean;
  hasManualLink: boolean;
  provisionedAt: string | null;
  action: string;
}

interface Info {
  cohort: { id: string; name: string; calendarId: string | null };
  hostEmail: string | null;
  connectedAs: string | null;
  calendars: { id: string; summary: string; primary: boolean }[];
  scopeOk: boolean | null;
  blockers: string[];
  fellows: { name: string | null; email: string }[];
  sessions: SessionRow[];
}

export default function SessionProvisioner({
  cohortId,
  onDone,
}: {
  cohortId: string;
  onDone?: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [calendarId, setCalendarId] = useState("");
  const [replaceManual, setReplaceManual] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/cohorts/${cohortId}/schedule/provision`);
      const data = await res.json();
      if (res.ok) {
        setInfo(data);
        setCalendarId(data.cohort?.calendarId ?? "primary");
      } else {
        setInfo(null);
      }
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  async function run() {
    if (!info) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/crm/cohorts/${cohortId}/schedule/provision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId, replaceManual }),
      });
      const d = await res.json();
      if (!res.ok) { toastError(d.error ?? "Could not build the sessions"); setResult(d.error ?? null); return; }

      const bits = [
        d.created ? `${d.created} created` : null,
        d.updated ? `${d.updated} updated` : null,
        d.failed  ? `${d.failed} failed`  : null,
      ].filter(Boolean).join(", ");
      const msg = `${bits || "Nothing changed"}. ${d.invited} ${d.invited === 1 ? "person" : "people"} invited.`;
      if (d.failed) {
        toastError(msg);
        // Name the sessions that failed, with Zoom's or Google's own wording.
        setResult(
          msg + "\n" + (d.results as { moduleNumber: number; ok: boolean; detail?: string }[])
            .filter(r => !r.ok)
            .map(r => `  Module ${r.moduleNumber}: ${r.detail ?? "failed"}`)
            .join("\n"),
        );
      } else {
        success(msg);
        setResult(msg);
      }
      await load();
      onDone?.();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl text-white"
        style={{ background: "#086c64" }}>
        <CalendarPlus size={13} /> Build sessions in Zoom and Calendar
      </button>
    );
  }

  const toCreate = info?.sessions.filter(s => s.action === "create").length ?? 0;
  const toUpdate = info?.sessions.filter(s => s.action === "update").length ?? 0;
  const skipped  = info?.sessions.filter(s => s.action.startsWith("skip")).length ?? 0;
  const blocked  = (info?.blockers.length ?? 0) > 0;

  return (
    <div className="rounded-xl border p-3 mb-2" style={{ borderColor: "#086c64", background: "white" }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "#14211f" }}>
          <Video size={13} style={{ color: "#086c64" }} /> Build sessions in Zoom and Calendar
        </p>
        <button onClick={() => setOpen(false)} className="text-[11px] font-semibold" style={{ color: "#949598" }}>
          Close
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3">
          <Loader2 size={14} className="animate-spin" style={{ color: "#086c64" }} />
          <span className="text-xs" style={{ color: "#949598" }}>Checking Zoom, Google and the schedule…</span>
        </div>
      ) : !info ? (
        <p className="text-xs" style={{ color: "#949598" }}>Could not read this cohort.</p>
      ) : (
        <>
          {/* Anything in the way, said plainly, with the fix in the sentence. */}
          {blocked && (
            <div className="rounded-lg p-2.5 mb-2" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
              {info.blockers.map((b, i) => (
                <p key={i} className="text-[11px] font-semibold flex items-start gap-1.5" style={{ color: "#92400e" }}>
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {b}
                </p>
              ))}
            </div>
          )}

          {!blocked && (
            <>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-[11px] font-semibold" style={{ color: "#5a6663" }}>Calendar</span>
                <div className="relative">
                  <select
                    value={calendarId}
                    onChange={e => setCalendarId(e.target.value)}
                    className="text-xs rounded-lg pl-2.5 pr-7 py-1.5 bg-white appearance-none"
                    style={{ border: "1px solid #e4e0d6", color: "#14211f" }}>
                    {info.calendars.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.summary}{c.primary ? " (primary)" : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#949598" }} />
                </div>
                <span className="text-[10px]" style={{ color: "#949598" }}>
                  as {info.connectedAs}
                </span>
              </div>

              <p className="text-[11px] mb-2 flex items-start gap-1.5" style={{ color: "#5a6663" }}>
                <Users size={11} className="mt-0.5 shrink-0" style={{ color: "#086c64" }} />
                <span>
                  Google will invite <strong>{info.fellows.length}</strong>{" "}
                  {info.fellows.length === 1 ? "Fellow" : "Fellows"}
                  {info.hostEmail ? ` plus ${info.hostEmail}` : ""}
                  {": "}
                  <span style={{ color: "#949598" }}>{info.fellows.map(f => f.name ?? f.email).join(", ")}</span>
                </span>
              </p>

              {/* What each session will do, before it does it. */}
              <div className="rounded-lg border mb-2" style={{ borderColor: "#e4e0d6" }}>
                {info.sessions.map(s => (
                  <div key={s.moduleNumber} className="flex items-center gap-2 px-2.5 py-1.5 border-b last:border-b-0"
                    style={{ borderColor: "#f0ede5" }}>
                    <span className="text-[11px] font-bold w-5" style={{ color: "#086c64" }}>{s.moduleNumber}</span>
                    <span className="text-[11px] flex-1 truncate" style={{ color: "#14211f" }}>{s.title}</span>
                    <span className="text-[10px]" style={{ color: "#949598" }}>
                      {s.sessionDate
                        ? new Date(s.sessionDate).toLocaleString("en-US", {
                            timeZone: "America/New_York", month: "short", day: "numeric",
                            hour: "numeric", minute: "2-digit",
                          })
                        : "no date"}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={s.action === "create"
                        ? { background: "#d1fae5", color: "#047857" }
                        : s.action === "update"
                          ? { background: "#dbeafe", color: "#1d4ed8" }
                          : { background: "#f1f5f9", color: "#64748b" }}>
                      {s.action === "create" ? "create" : s.action === "update" ? "update" : "skip"}
                    </span>
                  </div>
                ))}
              </div>

              {skipped > 0 && (
                <label className="flex items-start gap-2 mb-2 cursor-pointer">
                  <input type="checkbox" checked={replaceManual}
                    onChange={e => setReplaceManual(e.target.checked)} className="mt-0.5" />
                  <span className="text-[11px]" style={{ color: "#5a6663" }}>
                    Also replace the {skipped} link{skipped === 1 ? "" : "s"} pasted in by hand.
                    <span style={{ color: "#949598" }}> Anyone already holding one of those links loses it.</span>
                  </span>
                </label>
              )}

              <button
                onClick={run}
                disabled={busy || (toCreate + toUpdate === 0 && !replaceManual)}
                className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl text-white disabled:opacity-40"
                style={{ background: "#086c64" }}>
                {busy
                  ? <><Loader2 size={13} className="animate-spin" /> Building…</>
                  : toUpdate && !toCreate
                    ? <><RefreshCw size={13} /> Update {toUpdate} session{toUpdate === 1 ? "" : "s"}</>
                    : <><Check size={13} /> Build {toCreate + toUpdate} session{toCreate + toUpdate === 1 ? "" : "s"} and send invites</>}
              </button>
              <p className="text-[10px] mt-1.5" style={{ color: "#949598" }}>
                Safe to press again. Sessions we already made are moved, not duplicated.
              </p>
            </>
          )}

          {result && (
            <pre className="text-[11px] mt-2 font-semibold whitespace-pre-wrap" style={{ color: "#086c64" }}>{result}</pre>
          )}
        </>
      )}
    </div>
  );
}
