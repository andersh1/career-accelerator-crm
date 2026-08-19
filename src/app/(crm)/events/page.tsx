"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus, Calendar, Loader2, Users, ExternalLink, Video, MapPin,
  Copy, Check, TrendingUp, ChevronRight, ArrowRight, Target, UserCheck,
  Bell, Clock, AlertTriangle, Filter, X,
} from "lucide-react";

interface Funnel {
  registered: number; attended: number; applied: number; enrolled: number; parents: number;
}

interface Event {
  id: string; slug: string; title: string; description: string | null;
  eventType: string; speakerName: string | null; location: string | null;
  startsAt: string; endsAt: string | null; timezone: string;
  visibility: string; active: boolean;
  _count: { registrations: number };
  funnel: Funnel;
}

function formatDate(iso: string, tz: string, compact = false) {
  if (compact) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZone: tz,
    });
  }
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: tz,
  });
}

function pct(a: number, b: number) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}

function countdown(iso: string): { label: string; urgent: boolean; warn: boolean } {
  const diff = new Date(iso).getTime() - Date.now();
  const hours = diff / 3600000;
  const days  = Math.floor(diff / 86400000);
  if (hours < 0)  return { label: "Ended",        urgent: false, warn: false };
  if (hours < 2)  return { label: "Starting soon", urgent: true,  warn: true  };
  if (hours < 48) return { label: `In ${Math.round(hours)}h`,   urgent: true,  warn: true  };
  if (days  < 7)  return { label: `In ${days}d`,   urgent: false, warn: true   };
  return             { label: `In ${days}d`,        urgent: false, warn: false  };
}

function CopyLink({ slug, size = "sm" }: { slug: string; size?: "sm" | "lg" }) {
  const [copied, setCopied] = useState(false);
  const url = `https://crm.vantagecareer.co/public/events/${slug}`;
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  if (size === "lg") {
    return (
      <button onClick={copy}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-colors hover:bg-slate-50"
        style={{ borderColor: "#e4e0d6", color: copied ? "#0a6b64" : "#5a6663" }}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied!" : "Copy link"}
      </button>
    );
  }
  return (
    <button onClick={copy} title="Copy registration link"
      className="p-1.5 rounded-lg transition-colors hover:bg-slate-100 flex items-center gap-1 text-[11px] font-medium"
      style={{ color: copied ? "#0a6b64" : "#8a938f" }}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "#f1efe8" }}>
      <div className="h-full rounded-full" style={{ width: `${pct(value, max)}%`, background: color }} />
    </div>
  );
}

function FunnelViz({ totals }: { totals: { registered: number; attended: number; applied: number; enrolled: number } }) {
  const steps = [
    { label: "Registered", value: totals.registered, color: "#14211f", bg: "#f8f6f1" },
    { label: "Attended",   value: totals.attended,   color: "#0a6b64", bg: "#edf5f4" },
    { label: "Applied",    value: totals.applied,    color: "#2563eb", bg: "#eff6ff" },
    { label: "Enrolled",   value: totals.enrolled,   color: "#7c3aed", bg: "#f5f3ff" },
  ];
  const max = totals.registered || 1;
  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const w = Math.max(pct(s.value, max), s.value > 0 ? 8 : 0);
        const conv = i > 0 ? pct(steps[i].value, steps[i - 1].value) : null;
        return (
          <div key={s.label} className="flex items-center gap-3">
            <span className="text-xs font-semibold w-20 text-right shrink-0" style={{ color: "#8a938f" }}>{s.label}</span>
            <div className="flex-1 relative h-8 flex items-center">
              <div className="h-8 rounded-xl flex items-center px-3 transition-all"
                style={{ width: `${w}%`, minWidth: s.value > 0 ? 60 : 0, background: s.bg, border: `1.5px solid ${s.color}20` }}>
                <span className="text-sm font-extrabold" style={{ color: s.color }}>{s.value}</span>
              </div>
            </div>
            {conv !== null && (
              <span className="text-xs font-bold w-12 shrink-0" style={{ color: conv > 50 ? "#0a6b64" : conv > 20 ? "#92400e" : "#8a938f" }}>
                {conv}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EventRow({ e, compact }: { e: Event; compact?: boolean }) {
  const isZoom  = e.eventType === "ZOOM";
  const TypeIcon = isZoom ? Video : MapPin;
  return (
    <div className={`flex items-center gap-4 py-3.5 px-5 border-b last:border-0 hover:bg-[#faf9f6] transition-colors ${compact ? "opacity-80" : ""}`}
      style={{ borderColor: "#f0ede7" }}>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isZoom ? "bg-blue-50" : "bg-amber-50"}`}>
        <TypeIcon size={14} style={{ color: isZoom ? "#2563eb" : "#92400e" }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold truncate" style={{ color: "#14211f" }}>{e.title}</p>
          {e.speakerName && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "#f1efe8", color: "#5a6663" }}>
              {e.speakerName}
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5" style={{ color: "#8a938f" }}>{formatDate(e.startsAt, e.timezone, true)}</p>
      </div>
      <div className="hidden sm:flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <Users size={11} style={{ color: "#8a938f" }} />
          <span className="text-xs font-bold" style={{ color: "#14211f" }}>{e.funnel.registered}</span>
        </div>
        {e.funnel.registered > 0 && (
          <div className="hidden md:flex flex-col gap-1">
            <MiniBar value={e.funnel.attended} max={e.funnel.registered} color="#0a6b64" />
            <MiniBar value={e.funnel.enrolled} max={e.funnel.registered} color="#7c3aed" />
          </div>
        )}
        {e.funnel.enrolled > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#f5f3ff", color: "#7c3aed" }}>
            {e.funnel.enrolled} enrolled
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <CopyLink slug={e.slug} />
        <a href={`https://crm.vantagecareer.co/public/events/${e.slug}`} target="_blank" rel="noreferrer"
          className="p-1.5 rounded-lg transition-colors hover:bg-slate-100"
          style={{ color: "#8a938f" }} title="View public page">
          <ExternalLink size={12} />
        </a>
        <Link href={`/events/${e.id}`}
          className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors hover:bg-[#edf5f4]"
          style={{ color: "#0a6b64" }}>
          Manage <ChevronRight size={11} />
        </Link>
      </div>
    </div>
  );
}

// ── Next Up hero card ─────────────────────────────────────────────────────────
function NextUpCard({ e }: { e: Event }) {
  const isZoom   = e.eventType === "ZOOM";
  const { label: cdLabel, urgent, warn } = countdown(e.startsAt);

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: warn ? (urgent ? "#fca5a5" : "#fde68a") : "#e4e0d6", background: "#fff" }}>
      {/* Alert banner for events within 7 days */}
      {warn && (
        <div className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold"
          style={{ background: urgent ? "#fef2f2" : "#fffbeb", color: urgent ? "#dc2626" : "#92400e" }}>
          {urgent ? <AlertTriangle size={13} /> : <Bell size={13} />}
          {urgent
            ? `This event is ${cdLabel.toLowerCase()} — make sure reminders are sent and attendance is ready to mark.`
            : `Event is coming up ${cdLabel.toLowerCase()} — send your 7-day reminder from the event page if you haven't yet.`}
        </div>
      )}

      <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-5">
        {/* Left: event meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isZoom ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-800"}`}>
              {isZoom ? "Zoom" : "In-Person"}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: urgent ? "#fef2f2" : warn ? "#fffbeb" : "#edf5f4", color: urgent ? "#dc2626" : warn ? "#92400e" : "#0a6b64" }}>
              {cdLabel}
            </span>
          </div>
          <h2 className="text-lg font-extrabold leading-tight" style={{ color: "#14211f" }}>{e.title}</h2>
          <div className="flex items-center gap-1.5 mt-1">
            <Clock size={11} style={{ color: "#8a938f" }} />
            <p className="text-xs" style={{ color: "#8a938f" }}>{formatDate(e.startsAt, e.timezone)}</p>
          </div>
          {e.speakerName && (
            <p className="text-xs mt-1 font-medium" style={{ color: "#5a6663" }}>Speaker: {e.speakerName}</p>
          )}
        </div>

        {/* Center: registrant stat */}
        <div className="flex sm:flex-col items-center sm:items-center gap-4 sm:gap-1 px-5 border-t sm:border-t-0 sm:border-l pt-4 sm:pt-0"
          style={{ borderColor: "#f0ede7" }}>
          <div className="text-center">
            <p className="text-3xl font-extrabold" style={{ color: "#14211f" }}>{e.funnel.registered}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#8a938f" }}>Registered</p>
          </div>
          {e.funnel.enrolled > 0 && (
            <div className="text-center">
              <p className="text-lg font-extrabold" style={{ color: "#7c3aed" }}>{e.funnel.enrolled}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#8a938f" }}>Enrolled</p>
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex sm:flex-col gap-2 flex-wrap sm:shrink-0">
          <Link href={`/events/${e.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "#0a6b64" }}>
            Manage event <ChevronRight size={14} />
          </Link>
          <CopyLink slug={e.slug} size="lg" />
          <a href={`https://crm.vantagecareer.co/public/events/${e.slug}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-colors hover:bg-slate-50"
            style={{ borderColor: "#e4e0d6", color: "#5a6663" }}>
            <ExternalLink size={14} /> View page
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EventsPage() {
  const [events,       setEvents]       = useState<Event[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [filterEventId, setFilterEventId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/crm/events").then(r => r.json()).then(setEvents).finally(() => setLoading(false));
  }, []);

  const now            = new Date();
  const thirtyDaysAgo  = new Date(now.getTime() - 30 * 86400000);
  const filteredEvent  = filterEventId ? events.find(e => e.id === filterEventId) ?? null : null;

  const upcoming = events.filter(e => new Date(e.startsAt) >= now).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const past     = events.filter(e => new Date(e.startsAt) < now).sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
  const nextUp   = upcoming[0] ?? null;
  const restUpcoming = upcoming.slice(1);

  // KPI source: single event or all events
  const kpiSource = filteredEvent ? [filteredEvent] : events;

  const totals = kpiSource.reduce(
    (acc, e) => ({
      registered: acc.registered + e.funnel.registered,
      attended:   acc.attended   + e.funnel.attended,
      applied:    acc.applied    + e.funnel.applied,
      enrolled:   acc.enrolled   + e.funnel.enrolled,
    }),
    { registered: 0, attended: 0, applied: 0, enrolled: 0 }
  );

  // 30-day slice: events that started in the last 30 days (only relevant for "All events" view)
  const recent30 = events.filter(e => {
    const d = new Date(e.startsAt);
    return d >= thirtyDaysAgo && d <= now;
  });
  const totals30 = recent30.reduce(
    (acc, e) => ({
      registered: acc.registered + e.funnel.registered,
      attended:   acc.attended   + e.funnel.attended,
      applied:    acc.applied    + e.funnel.applied,
      enrolled:   acc.enrolled   + e.funnel.enrolled,
    }),
    { registered: 0, attended: 0, applied: 0, enrolled: 0 }
  );

  const attendRate   = totals.registered   ? pct(totals.attended,   totals.registered)   : 0;
  const attendRate30 = totals30.registered ? pct(totals30.attended, totals30.registered) : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#8a938f" }}>Vantage Career Accelerator</p>
          <h1 className="text-2xl font-bold" style={{ color: "#14211f" }}>Events</h1>
          <p className="text-sm mt-0.5" style={{ color: "#8a938f" }}>Dinners, webinars, and panels — from RSVP to enrolled.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/analytics?tab=growth"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors hover:bg-slate-50"
            style={{ borderColor: "#e4e0d6", color: "#5a6663" }}>
            <TrendingUp size={13} /> Analytics
          </Link>
          <Link href="/events/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ background: "#0a6b64" }}>
            <Plus size={15} /> New Event
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={22} className="animate-spin" style={{ color: "#0a6b64" }} />
        </div>
      ) : (
        <>
          {/* ── Next Up hero ── */}
          {nextUp ? (
            <NextUpCard e={nextUp} />
          ) : (
            <div className="rounded-2xl border-2 border-dashed flex items-center justify-between px-6 py-5"
              style={{ borderColor: "#e4e0d6" }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: "#14211f" }}>No upcoming events</p>
                <p className="text-xs mt-0.5" style={{ color: "#8a938f" }}>Schedule a dinner or webinar to start filling your pipeline.</p>
              </div>
              <Link href="/events/new"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shrink-0"
                style={{ background: "#0a6b64" }}>
                <Plus size={14} /> New Event
              </Link>
            </div>
          )}

          {/* ── Event filter ── */}
          {events.length > 1 && (
            <div className="flex items-center gap-2">
              <div className="relative flex items-center">
                <Filter size={13} className="absolute left-3 pointer-events-none" style={{ color: "#8a938f" }} />
                <select
                  value={filterEventId ?? ""}
                  onChange={e => setFilterEventId(e.target.value || null)}
                  className="pl-8 pr-8 py-2 rounded-xl border text-xs font-semibold outline-none focus:border-teal-600 appearance-none cursor-pointer"
                  style={{ borderColor: filterEventId ? "#0a6b64" : "#e4e0d6", color: filterEventId ? "#0a6b64" : "#5a6663", background: filterEventId ? "#edf5f4" : "#fff" }}>
                  <option value="">All Events ({events.length})</option>
                  <optgroup label="Upcoming">
                    {upcoming.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                  </optgroup>
                  {past.length > 0 && (
                    <optgroup label="Past">
                      {past.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
              {filterEventId && (
                <button onClick={() => setFilterEventId(null)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors hover:bg-slate-50"
                  style={{ borderColor: "#e4e0d6", color: "#5a6663" }}>
                  <X size={11} /> Clear filter
                </button>
              )}
              {filteredEvent && (
                <Link href={`/events/${filteredEvent.id}`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors hover:bg-[#edf5f4]"
                  style={{ borderColor: "#e4e0d6", color: "#0a6b64" }}>
                  Open event →
                </Link>
              )}
            </div>
          )}

          {/* ── KPI row ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: "Total Registered", value: totals.registered, delta: totals30.registered,
                icon: Users, color: "#14211f", bg: "#f8f6f1",
              },
              {
                label: "Attendance Rate", value: `${attendRate}%`, delta: attendRate30,
                deltaLabel: `${attendRate30}% last 30d`, icon: UserCheck, color: "#0a6b64", bg: "#edf5f4",
              },
              {
                label: "Applied", value: totals.applied, delta: totals30.applied,
                icon: Target, color: "#2563eb", bg: "#eff6ff",
              },
              {
                label: "Enrolled", value: totals.enrolled, delta: totals30.enrolled,
                icon: TrendingUp, color: "#7c3aed", bg: "#f5f3ff",
              },
            ].map(({ label, value, delta, deltaLabel, icon: Icon, color, bg }) => (
              <div key={label} className="rounded-2xl border p-5 flex flex-col gap-3" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: bg }}>
                  <Icon size={16} style={{ color }} />
                </div>
                <div>
                  <p className="text-2xl font-extrabold" style={{ color }}>{value}</p>
                  <p className="text-xs font-semibold mt-0.5" style={{ color: "#8a938f" }}>{label}</p>
                  {!filterEventId && delta !== undefined && delta > 0 && (
                    <p className="text-[10px] font-semibold mt-1.5 px-1.5 py-0.5 rounded-full inline-block"
                      style={{ background: bg, color }}>
                      +{deltaLabel ?? delta} last 30d
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

            {/* ── Upcoming events (rest after Next Up) ── */}
            <div className="lg:col-span-3 rounded-2xl border overflow-hidden" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#f0ede7", background: "#f8f6f1" }}>
                <div className="flex items-center gap-2">
                  <Calendar size={14} style={{ color: "#0a6b64" }} />
                  <span className="text-sm font-bold" style={{ color: "#14211f" }}>
                    {restUpcoming.length > 0 ? "More Upcoming" : "Upcoming Events"}
                  </span>
                  {restUpcoming.length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#edf5f4", color: "#0a6b64" }}>{restUpcoming.length}</span>
                  )}
                </div>
                <Link href="/events/new" className="text-xs font-semibold flex items-center gap-1" style={{ color: "#0a6b64" }}>
                  <Plus size={11} /> New
                </Link>
              </div>
              {restUpcoming.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm" style={{ color: "#8a938f" }}>
                    {nextUp ? "No other events scheduled" : "No upcoming events"}
                  </p>
                  <Link href="/events/new" className="text-xs font-semibold mt-1 inline-flex items-center gap-1" style={{ color: "#0a6b64" }}>
                    Schedule one <ArrowRight size={10} />
                  </Link>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "#f0ede7" }}>
                  {restUpcoming.map(e => <EventRow key={e.id} e={e} />)}
                </div>
              )}
            </div>

            {/* ── Pipeline funnel ── */}
            <div className="lg:col-span-2 rounded-2xl border p-5" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={14} style={{ color: "#0a6b64" }} />
                <span className="text-sm font-bold" style={{ color: "#14211f" }}>Registration Pipeline</span>
              </div>
              {totals.registered === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: "#8a938f" }}>Registrations will appear here once events go live.</p>
              ) : (
                <FunnelViz totals={totals} />
              )}
              {totals.registered > 0 && (
                <div className="mt-4 pt-4 border-t space-y-2" style={{ borderColor: "#f0ede7" }}>
                  {[
                    { label: "Show up rate",   a: totals.attended, b: totals.registered },
                    { label: "Attend → apply", a: totals.applied,  b: totals.attended   },
                    { label: "Apply → enroll", a: totals.enrolled, b: totals.applied    },
                  ].map(({ label, a, b }) => {
                    const p = pct(a, b);
                    return (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: "#8a938f" }}>{label}</span>
                        <span className="text-[11px] font-bold" style={{ color: p > 50 ? "#0a6b64" : p > 25 ? "#92400e" : "#5a6663" }}>{p}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <Link href="/analytics?tab=growth"
                className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl transition-colors hover:bg-[#edf5f4]"
                style={{ color: "#0a6b64" }}>
                Full analytics <ArrowRight size={11} />
              </Link>
            </div>
          </div>

          {/* ── Past events ── */}
          {past.length > 0 && (
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
              <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: "#f0ede7", background: "#f8f6f1" }}>
                <span className="text-sm font-bold" style={{ color: "#14211f" }}>Past Events</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#f1efe8", color: "#8a938f" }}>{past.length}</span>
                {totals30.enrolled > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-auto" style={{ background: "#f5f3ff", color: "#7c3aed" }}>
                    {totals30.enrolled} enrolled in last 30d
                  </span>
                )}
              </div>
              <div className="divide-y" style={{ borderColor: "#f0ede7" }}>
                {past.map(e => <EventRow key={e.id} e={e} compact />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
