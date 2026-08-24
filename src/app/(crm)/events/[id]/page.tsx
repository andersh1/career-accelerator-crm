"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, Users, Trash2, ToggleLeft, ToggleRight, ExternalLink,
  Download, CheckCircle2, Circle, Copy, Check, Video, MapPin,
  Bell, Mail, UserCheck, UserX, Zap, TrendingUp, BarChart2, Target,
  ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import { useToast } from "@/lib/toast";

interface Registration {
  id: string; firstName: string; lastName: string; email: string;
  phone: string | null; contactType: string; referralCode: string | null;
  utmSource: string | null; utmMedium: string | null; utmCampaign: string | null;
  attendedAt: string | null; createdAt: string;
}

interface Funnel {
  registered: number; attended: number; applied: number; enrolled: number;
  parents: number; students: number;
}

interface Event {
  id: string; slug: string; title: string; description: string | null;
  eventType: string;
  speakerName: string | null; speakerTitle: string | null; speakerBio: string | null;
  speakerImageUrl: string | null;
  location: string | null; venueAddress: string | null; meetingUrl: string | null;
  startsAt: string; endsAt: string | null; timezone: string;
  maxCapacity: number | null; visibility: string; active: boolean;
  reminderSent7d: boolean; reminderSent24h: boolean; followUpSent: boolean;
  confirmationMessage: string | null;
  registrations: Registration[];
  _count: { registrations: number };
  funnel: Funnel;
}

interface BenchmarkEvent {
  id: string;
  funnel: { registered: number; attended: number; applied: number; enrolled: number };
}

function formatDate(iso: string, tz: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: tz,
  });
}

function pct(a: number, b: number) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}

function avg(arr: number[]) {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

// ── SVG sparkline for registration timeline ───────────────────────────────────
function Sparkline({ data }: { data: { date: string; count: number }[] }) {
  if (data.length < 2) return <p className="text-xs text-center py-6" style={{ color: "#949598" }}>Not enough data for a timeline yet.</p>;
  const max   = Math.max(...data.map(d => d.count), 1);
  const W = 280, H = 60, pad = 4;
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
    const y = H - pad - ((d.count / max) * (H - pad * 2));
    return `${x},${y}`;
  });
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#086c64" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#086c64" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`${pad},${H} ${pts.join(" ")} ${W - pad},${H}`}
        fill="url(#sparkFill)"
      />
      <polyline points={pts.join(" ")} fill="none" stroke="#086c64" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => {
        const [x, y] = pts[i].split(",").map(Number);
        return d.count > 0 ? (
          <circle key={i} cx={x} cy={y} r="2.5" fill="#086c64" />
        ) : null;
      })}
    </svg>
  );
}

// ── Rate card ─────────────────────────────────────────────────────────────────
function RateCard({
  label, value, sublabel, color, bg, benchmark,
}: {
  label: string; value: number; sublabel: string; color: string; bg: string; benchmark?: number;
}) {
  const diff = benchmark !== undefined ? value - benchmark : null;
  const DiffIcon = diff === null ? null : diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  const diffColor = diff === null ? "" : diff > 2 ? "#086c64" : diff < -2 ? "#dc2626" : "#949598";

  return (
    <div className="rounded-2xl border p-4 flex flex-col gap-2" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: bg }}>
        <Target size={14} style={{ color }} />
      </div>
      <div>
        <div className="flex items-end gap-2">
          <p className="text-2xl font-extrabold leading-none" style={{ color }}>{value}%</p>
          {DiffIcon && diff !== null && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold mb-0.5" style={{ color: diffColor }}>
              <DiffIcon size={10} />{Math.abs(diff)}%
            </span>
          )}
        </div>
        <p className="text-[11px] font-semibold mt-0.5" style={{ color: "#949598" }}>{label}</p>
        <p className="text-[10px] mt-0.5" style={{ color: "#b5b9b7" }}>{sublabel}</p>
        {benchmark !== undefined && (
          <p className="text-[10px] mt-1" style={{ color: "#b5b9b7" }}>avg {benchmark}% across events</p>
        )}
      </div>
    </div>
  );
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [event, setEvent]         = useState<Event | null>(null);
  const [loading, setLoading]     = useState(true);
  const [deleting, setDeleting]   = useState(false);
  const [togglingReg, setTogglingReg] = useState<string | null>(null);
  const [sending, setSending]     = useState<string | null>(null);
  const [copied, setCopied]       = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "students" | "parents">("all");
  const [mainTab, setMainTab]     = useState<"registrants" | "analytics">("registrants");
  const [markingAll, setMarkingAll]   = useState(false);
  const [sequences, setSequences]     = useState<{ id: string; name: string }[] | null>(null);
  const [seqId, setSeqId]             = useState("");
  const [attendedOnly, setAttendedOnly] = useState(true);
  const [enrolling, setEnrolling]     = useState(false);
  const [benchmarkEvents, setBenchmarkEvents] = useState<BenchmarkEvent[] | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/crm/events/${id}`).then(r => r.json()).then(setEvent).finally(() => setLoading(false));
  }, [id]);

  // Lazy-load benchmark when analytics tab opens
  useEffect(() => {
    if (mainTab === "analytics" && !benchmarkEvents && !benchmarkLoading) {
      setBenchmarkLoading(true);
      fetch("/api/crm/events")
        .then(r => r.json())
        .then((all: BenchmarkEvent[]) => setBenchmarkEvents(all.filter(e => e.id !== id)))
        .finally(() => setBenchmarkLoading(false));
    }
  }, [mainTab, benchmarkEvents, benchmarkLoading, id]);

  async function toggleActive() {
    if (!event) return;
    const res = await fetch(`/api/crm/events/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !event.active }),
    });
    if (res.ok) setEvent(e => e ? { ...e, active: !e.active } : e);
  }

  async function del() {
    if (!event) return;
    if (!confirm(`Delete "${event.title}"? All registrations will be lost.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/crm/events/${id}`, { method: "DELETE" });
    if (res.ok) { success("Event deleted"); router.push("/events"); }
    else { toastError("Failed to delete"); setDeleting(false); }
  }

  async function toggleAttended(regId: string, attended: boolean) {
    setTogglingReg(regId);
    const res = await fetch(`/api/crm/events/${id}/registrations/${regId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attended }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEvent(e => e ? {
        ...e,
        registrations: e.registrations.map(r => r.id === regId ? { ...r, attendedAt: updated.attendedAt } : r),
        funnel: {
          ...e.funnel,
          attended: e.registrations.filter(r => r.id === regId ? attended : r.attendedAt).length,
        },
      } : e);
    }
    setTogglingReg(null);
  }

  async function markAllAttended(attended: boolean) {
    if (!event) return;
    setMarkingAll(true);
    const res = await fetch(`/api/crm/events/${id}/attend-all`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attended }),
    });
    if (res.ok) {
      const now = attended ? new Date().toISOString() : null;
      setEvent(e => e ? {
        ...e,
        registrations: e.registrations.map(r => ({ ...r, attendedAt: now })),
        funnel: { ...e.funnel, attended: attended ? e.funnel.registered : 0 },
      } : e);
      success(attended ? "Marked all as attended" : "Cleared all attendance");
    } else { toastError("Failed to update attendance"); }
    setMarkingAll(false);
  }

  async function loadSequences() {
    if (sequences) return;
    const res = await fetch("/api/crm/sequences");
    if (res.ok) setSequences(await res.json());
  }

  async function enrollInSequence() {
    if (!seqId) return;
    setEnrolling(true);
    const res = await fetch(`/api/crm/events/${id}/enroll-sequence`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequenceId: seqId, attendedOnly }),
    });
    const d = await res.json();
    if (res.ok) {
      success(`Enrolled ${d.enrolled} lead${d.enrolled !== 1 ? "s" : ""} in sequence${d.skipped > 0 ? ` (${d.skipped} already enrolled)` : ""}`);
    } else { toastError(d.error ?? "Failed to enroll"); }
    setEnrolling(false);
  }

  async function sendReminder(type: "SEVEN_DAY" | "ONE_DAY" | "FOLLOW_UP") {
    setSending(type);
    const res = await fetch(`/api/crm/events/${id}/remind`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    const d = await res.json();
    if (res.ok) {
      success(`Sent to ${d.sent} registrant${d.sent !== 1 ? "s" : ""}`);
      setEvent(e => e ? {
        ...e,
        reminderSent7d:  type === "SEVEN_DAY" ? true : e.reminderSent7d,
        reminderSent24h: type === "ONE_DAY"   ? true : e.reminderSent24h,
        followUpSent:    type === "FOLLOW_UP" ? true : e.followUpSent,
      } : e);
    } else { toastError(d.error ?? "Failed to send"); }
    setSending(null);
  }

  function copyLink() {
    navigator.clipboard.writeText(`https://crm.vantagecareer.co/public/events/${event?.slug}`).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }

  function exportCSV() {
    if (!event) return;
    const rows = [
      ["First Name", "Last Name", "Email", "Phone", "Type", "Attended", "UTM Source", "UTM Medium", "UTM Campaign", "Referral Code", "Registered At"],
      ...event.registrations.map(r => [
        r.firstName, r.lastName, r.email, r.phone ?? "",
        r.contactType, r.attendedAt ? "Yes" : "No",
        r.utmSource ?? "", r.utmMedium ?? "", r.utmCampaign ?? "",
        r.referralCode ?? "", new Date(r.createdAt).toLocaleString(),
      ]),
    ];
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${event.slug}-registrants.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 size={24} className="animate-spin" style={{ color: "#086c64" }} /></div>;
  if (!event)  return <div className="p-8 text-center" style={{ color: "#949598" }}>Event not found.</div>;

  const isZoom   = event.eventType === "ZOOM";
  const TypeIcon = isZoom ? Video : MapPin;
  const isPast   = new Date(event.startsAt) < new Date();

  const filteredRegs = event.registrations.filter(r => {
    if (activeTab === "students") return r.contactType === "STUDENT";
    if (activeTab === "parents")  return r.contactType === "PARENT";
    return true;
  });

  // ── Conversion rates ──────────────────────────────────────────────────────
  const attendRate  = pct(event.funnel.attended, event.funnel.registered);
  const applyRate   = pct(event.funnel.applied,  event.funnel.attended);
  const enrollRate  = pct(event.funnel.enrolled, event.funnel.applied);
  const overallRate = pct(event.funnel.enrolled, event.funnel.registered);

  // ── Benchmark: averages across all other events ───────────────────────────
  const bmAttendRates  = (benchmarkEvents ?? []).map(e => pct(e.funnel.attended, e.funnel.registered)).filter((_, i) => (benchmarkEvents ?? [])[i].funnel.registered > 0);
  const bmApplyRates   = (benchmarkEvents ?? []).map(e => pct(e.funnel.applied,  e.funnel.attended)).filter((_, i) => (benchmarkEvents ?? [])[i].funnel.attended > 0);
  const bmEnrollRates  = (benchmarkEvents ?? []).map(e => pct(e.funnel.enrolled, e.funnel.applied)).filter((_, i) => (benchmarkEvents ?? [])[i].funnel.applied > 0);
  const bmOverallRates = (benchmarkEvents ?? []).map(e => pct(e.funnel.enrolled, e.funnel.registered)).filter((_, i) => (benchmarkEvents ?? [])[i].funnel.registered > 0);
  const hasBenchmark = (benchmarkEvents?.length ?? 0) > 0;

  // ── Registration timeline (by day) ────────────────────────────────────────
  const timelineMap: Record<string, number> = {};
  event.registrations.forEach(r => {
    const day = r.createdAt.slice(0, 10);
    timelineMap[day] = (timelineMap[day] ?? 0) + 1;
  });
  // Fill gaps between first registration and today
  const timelineData: { date: string; count: number }[] = [];
  if (event.registrations.length > 0) {
    const firstDay = new Date(Math.min(...event.registrations.map(r => new Date(r.createdAt).getTime())));
    const lastDay  = isPast ? new Date(event.startsAt) : new Date();
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      timelineData.push({ date: key, count: timelineMap[key] ?? 0 });
    }
  }

  // ── UTM source breakdown ──────────────────────────────────────────────────
  const sourceMap: Record<string, number> = {};
  event.registrations.forEach(r => {
    const src = r.utmSource?.toLowerCase() || "direct";
    sourceMap[src] = (sourceMap[src] ?? 0) + 1;
  });
  const sources = Object.entries(sourceMap)
    .sort((a, b) => b[1] - a[1])
    .map(([src, count]) => ({ src, count, pct: pct(count, event.funnel.registered) }));

  // ── Audience conversion (students vs parents) ─────────────────────────────
  const studentRegs = event.registrations.filter(r => r.contactType === "STUDENT");
  const parentRegs  = event.registrations.filter(r => r.contactType === "PARENT");
  const studentAttended = studentRegs.filter(r => r.attendedAt).length;
  const parentAttended  = parentRegs.filter(r => r.attendedAt).length;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/events" className="inline-flex items-center gap-1.5 text-sm mb-4" style={{ color: "#5a6663" }}>
        <ArrowLeft size={14} /> All events
      </Link>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${isZoom ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
              <TypeIcon size={9} />{isZoom ? "Zoom" : "In Person"}
            </span>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${event.visibility === "PUBLIC" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
              {event.visibility === "PUBLIC" ? "Public" : "Students only"}
            </span>
            {!event.active && <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Inactive</span>}
            {isPast && <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Past</span>}
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "#14211f" }}>{event.title}</h1>
          <p className="text-sm mt-1" style={{ color: "#5a6663" }}>{formatDate(event.startsAt, event.timezone)}</p>
          {isZoom
            ? event.meetingUrl && <a href={event.meetingUrl} target="_blank" rel="noreferrer" className="text-sm font-medium" style={{ color: "#086c64" }}>{event.meetingUrl}</a>
            : <p className="text-sm" style={{ color: "#949598" }}>{[event.location, event.venueAddress].filter(Boolean).join(" · ")}</p>
          }
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <button onClick={copyLink}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors hover:bg-slate-50"
            style={{ borderColor: "#e4e0d6", color: copied ? "#086c64" : "#5a6663" }}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied!" : "Copy link"}
          </button>
          <button onClick={toggleActive}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors hover:bg-slate-50"
            style={{ borderColor: "#e4e0d6", color: event.active ? "#086c64" : "#949598" }}
            title={event.active ? "Click to deactivate — hides the registration page" : "Click to activate — makes registration page live"}>
            {event.active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
            {event.active ? "Active" : "Inactive"}
          </button>
          <a href={`https://crm.vantagecareer.co/public/events/${event.slug}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors hover:bg-slate-50"
            style={{ borderColor: "#e4e0d6", color: "#5a6663" }}>
            <ExternalLink size={13} /> View page
          </a>
          <button onClick={del} disabled={deleting}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors hover:bg-red-50"
            style={{ borderColor: "#e4e0d6", color: "#dc2626" }}>
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete
          </button>
        </div>
      </div>

      {/* ── Conversion rate KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <RateCard label="Attendance Rate"  value={attendRate}  sublabel="Registered → Attended" color="#086c64" bg="#edf5f4" benchmark={hasBenchmark ? avg(bmAttendRates)  : undefined} />
        <RateCard label="Apply Rate"       value={applyRate}   sublabel="Attended → Applied"    color="#2563eb" bg="#eff6ff" benchmark={hasBenchmark ? avg(bmApplyRates)   : undefined} />
        <RateCard label="Enroll Rate"      value={enrollRate}  sublabel="Applied → Enrolled"    color="#7c3aed" bg="#f5f3ff" benchmark={hasBenchmark ? avg(bmEnrollRates)  : undefined} />
        <RateCard label="Overall Conv."    value={overallRate} sublabel="Registered → Enrolled" color="#14211f" bg="#f8f6f1" benchmark={hasBenchmark ? avg(bmOverallRates) : undefined} />
      </div>

      {/* ── Pipeline funnel ── */}
      <div className="rounded-2xl border p-5 mb-5" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-4" style={{ color: "#949598" }}>Pipeline Funnel</p>
        <div className="space-y-2.5">
          {[
            { label: "Registered", value: event.funnel.registered, color: "#14211f", bg: "#f8f6f1" },
            { label: "Attended",   value: event.funnel.attended,   color: "#086c64", bg: "#edf5f4" },
            { label: "Applied",    value: event.funnel.applied,    color: "#2563eb", bg: "#eff6ff" },
            { label: "Enrolled",   value: event.funnel.enrolled,   color: "#7c3aed", bg: "#f5f3ff" },
          ].map((s, i, arr) => {
            const max = event.funnel.registered || 1;
            const w   = Math.max(pct(s.value, max), s.value > 0 ? 6 : 0);
            const conv = i > 0 ? pct(s.value, arr[i - 1].value) : null;
            return (
              <div key={s.label} className="flex items-center gap-3">
                <span className="text-xs font-semibold w-20 text-right shrink-0" style={{ color: "#949598" }}>{s.label}</span>
                <div className="flex-1 h-9 flex items-center">
                  <div className="h-9 rounded-xl flex items-center px-3 transition-all"
                    style={{ width: `${w}%`, minWidth: s.value > 0 ? 56 : 0, background: s.bg, border: `1.5px solid ${s.color}20` }}>
                    <span className="text-sm font-extrabold" style={{ color: s.color }}>{s.value}</span>
                  </div>
                </div>
                {conv !== null && (
                  <span className="text-xs font-bold w-10 shrink-0" style={{ color: conv > 50 ? "#086c64" : conv > 20 ? "#92400e" : "#949598" }}>{conv}%</span>
                )}
              </div>
            );
          })}
        </div>
        {/* Parent / student split */}
        {(event.funnel.parents > 0 || event.funnel.students > 0) && (
          <div className="flex items-center gap-4 mt-4 pt-4 border-t" style={{ borderColor: "#f0ede7" }}>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              <span style={{ color: "#5a6663" }}>{event.funnel.students} Student{event.funnel.students !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
              <span style={{ color: "#5a6663" }}>{event.funnel.parents} Parent{event.funnel.parents !== 1 ? "s" : ""}</span>
            </div>
            {event.maxCapacity && (
              <div className="text-xs ml-auto" style={{ color: "#949598" }}>
                Capacity: {event.funnel.registered}/{event.maxCapacity}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Email Reminders + Sequence (side by side) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {/* Reminders */}
        <div className="rounded-2xl border p-5" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "#949598" }}>Email Reminders</p>
          <div className="space-y-2">
            {[
              { type: "SEVEN_DAY" as const, label: "7-Day Reminder", sent: event.reminderSent7d, desc: "All registrants" },
              { type: "ONE_DAY"   as const, label: "24-Hr Reminder", sent: event.reminderSent24h, desc: "All registrants" },
              { type: "FOLLOW_UP" as const, label: "Post-Event",      sent: event.followUpSent,   desc: "Attended only" },
            ].map(({ type, label, sent, desc }) => (
              <div key={type} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border" style={{ borderColor: "#e4e0d6", background: sent ? "#f0fdf4" : "#faf9f6" }}>
                <div>
                  <p className="text-xs font-semibold" style={{ color: "#14211f" }}>{label}</p>
                  <p className="text-[10px]" style={{ color: "#949598" }}>{desc}</p>
                </div>
                {sent ? (
                  <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full shrink-0">Sent</span>
                ) : (
                  <button onClick={() => sendReminder(type)} disabled={!!sending || event.registrations.length === 0}
                    className="p-1.5 rounded-lg transition-colors hover:bg-teal-50 shrink-0" style={{ color: "#086c64" }}>
                    {sending === type ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                  </button>
                )}
              </div>
            ))}
          </div>
          {event.registrations.length === 0 && <p className="text-xs mt-2" style={{ color: "#949598" }}>No registrants yet.</p>}
        </div>

        {/* Sequence auto-enroll */}
        <div className="rounded-2xl border p-5" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={13} style={{ color: "#086c64" }} />
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Auto-Enroll in Sequence</p>
          </div>
          <p className="text-xs mb-4" style={{ color: "#5a6663" }}>Bulk-enroll registrants into a follow-up email sequence. Already-enrolled leads are skipped.</p>
          <div className="space-y-3">
            <select value={seqId} onChange={e => setSeqId(e.target.value)} onFocus={loadSequences}
              className="w-full px-3 py-2 rounded-xl border text-sm outline-none focus:border-teal-500" style={{ borderColor: "#e4e0d6" }}>
              <option value="">— pick a sequence —</option>
              {sequences?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="flex items-center gap-2">
              <div className="flex rounded-xl border overflow-hidden text-xs font-semibold flex-1" style={{ borderColor: "#e4e0d6" }}>
                {[
                  { v: true,  label: "Attended only" },
                  { v: false, label: "All registrants" },
                ].map(({ v, label }) => (
                  <button key={label} type="button" onClick={() => setAttendedOnly(v)}
                    className="px-3 py-2 flex-1 transition-colors"
                    style={{ background: attendedOnly === v ? "#086c64" : "transparent", color: attendedOnly === v ? "#fff" : "#5a6663" }}>
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={enrollInSequence} disabled={!seqId || enrolling || event.registrations.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: "#086c64" }}>
                {enrolling ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />} Enroll
              </button>
            </div>
          </div>
          {event.registrations.length === 0 && <p className="text-xs mt-2" style={{ color: "#949598" }}>No registrants yet.</p>}
        </div>
      </div>

      {/* ── Main tab bar: Registrants | Analytics ── */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#e4e0d6" }}>
        {/* Tab header */}
        <div className="flex items-center border-b" style={{ borderColor: "#e4e0d6", background: "#f8f6f1" }}>
          {[
            { key: "registrants" as const, label: `Registrants (${event.funnel.registered})`, icon: Users },
            { key: "analytics"   as const, label: "Analytics",                                icon: BarChart2 },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setMainTab(key)}
              className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors"
              style={{
                borderBottomColor: mainTab === key ? "#086c64" : "transparent",
                color: mainTab === key ? "#086c64" : "#949598",
                background: "transparent",
              }}>
              <Icon size={14} />{label}
            </button>
          ))}

          {/* Registrant tab actions — right side */}
          {mainTab === "registrants" && event.registrations.length > 0 && (
            <div className="ml-auto flex items-center gap-2 pr-4">
              {/* Sub-tabs */}
              <div className="flex items-center rounded-lg border overflow-hidden text-xs font-semibold" style={{ borderColor: "#e4e0d6" }}>
                {([
                  { key: "all",      label: `All (${event.funnel.registered})` },
                  { key: "students", label: `Students (${event.funnel.students})` },
                  { key: "parents",  label: `Parents (${event.funnel.parents})` },
                ] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => setActiveTab(key)}
                    className="px-3 py-1.5 transition-colors"
                    style={{ background: activeTab === key ? "#086c64" : "transparent", color: activeTab === key ? "#fff" : "#5a6663" }}>
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={() => markAllAttended(true)} disabled={markingAll}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border hover:bg-emerald-50 transition-colors"
                style={{ borderColor: "#e4e0d6", color: "#086c64" }}>
                {markingAll ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />} Mark all attended
              </button>
              <button onClick={exportCSV}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border hover:bg-white transition-colors"
                style={{ borderColor: "#e4e0d6", color: "#5a6663" }}>
                <Download size={12} /> Export CSV
              </button>
            </div>
          )}
        </div>

        {/* ── Registrants tab ── */}
        {mainTab === "registrants" && (
          filteredRegs.length === 0 ? (
            <div className="text-center py-12" style={{ color: "#949598" }}>
              <p className="font-medium">{event.registrations.length === 0 ? "No registrations yet" : `No ${activeTab === "students" ? "students" : "parents"} registered`}</p>
              {event.registrations.length === 0 && <p className="text-sm mt-1">Share the event link to start collecting sign-ups.</p>}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#faf9f6", borderBottom: "1px solid #e4e0d6" }}>
                  <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Name</th>
                  <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide hidden sm:table-cell" style={{ color: "#949598" }}>Email</th>
                  <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide hidden sm:table-cell" style={{ color: "#949598" }}>Type</th>
                  <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Attended</th>
                </tr>
              </thead>
              <tbody>
                {filteredRegs.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : "#faf9f6", borderBottom: i < filteredRegs.length - 1 ? "1px solid #f0ede7" : "none" }}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-sm" style={{ color: "#14211f" }}>{r.firstName} {r.lastName}</p>
                      <p className="text-xs" style={{ color: "#949598" }}>{new Date(r.createdAt).toLocaleDateString()}{r.utmSource ? ` · ${r.utmSource}` : ""}</p>
                    </td>
                    <td className="px-4 py-3 text-xs hidden sm:table-cell" style={{ color: "#5a6663" }}>{r.email}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${r.contactType === "PARENT" ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-blue-700"}`}>
                        {r.contactType === "PARENT" ? "Parent" : "Student"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleAttended(r.id, !r.attendedAt)} disabled={togglingReg === r.id}
                        className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
                        style={{ color: r.attendedAt ? "#086c64" : "#c9cac9" }}>
                        {togglingReg === r.id ? <Loader2 size={14} className="animate-spin" /> : r.attendedAt ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                        {r.attendedAt ? "Attended" : "No-show"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {/* ── Analytics tab ── */}
        {mainTab === "analytics" && (
          <div className="p-5 space-y-6">
            {benchmarkLoading && (
              <div className="flex items-center gap-2 text-xs" style={{ color: "#949598" }}>
                <Loader2 size={12} className="animate-spin" /> Loading benchmark data…
              </div>
            )}

            {/* Registration timeline */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "#949598" }}>Registration Timeline</p>
              {timelineData.length > 0 ? (
                <>
                  <Sparkline data={timelineData} />
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px]" style={{ color: "#b5b9b7" }}>{timelineData[0]?.date}</span>
                    <span className="text-[10px]" style={{ color: "#b5b9b7" }}>{timelineData[timelineData.length - 1]?.date}</span>
                  </div>
                  <p className="text-xs mt-2" style={{ color: "#5a6663" }}>
                    {event.funnel.registered} registrations over {timelineData.length} day{timelineData.length !== 1 ? "s" : ""}.
                    {(() => {
                      const peak = timelineData.reduce((a, b) => a.count > b.count ? a : b, { date: "", count: 0 });
                      return peak.count > 1 ? ` Peak day: ${new Date(peak.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} (${peak.count} sign-ups).` : "";
                    })()}
                  </p>
                </>
              ) : (
                <p className="text-sm py-4" style={{ color: "#949598" }}>No registrations yet.</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* UTM source breakdown */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "#949598" }}>Traffic Sources</p>
                {sources.length === 0 ? (
                  <p className="text-sm" style={{ color: "#949598" }}>No data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {sources.map(({ src, count, pct: p }) => (
                      <div key={src}>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs font-semibold capitalize" style={{ color: "#14211f" }}>{src}</span>
                          <span className="text-xs font-bold" style={{ color: "#5a6663" }}>{count} <span style={{ color: "#949598" }}>({p}%)</span></span>
                        </div>
                        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "#f1efe8" }}>
                          <div className="h-full rounded-full" style={{ width: `${p}%`, background: "#086c64" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Audience split */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "#949598" }}>Audience Breakdown</p>
                {event.funnel.registered === 0 ? (
                  <p className="text-sm" style={{ color: "#949598" }}>No registrations yet.</p>
                ) : (
                  <div className="space-y-3">
                    {[
                      { label: "Students", total: studentRegs.length, attended: studentAttended, color: "#2563eb", bg: "#eff6ff" },
                      { label: "Parents",  total: parentRegs.length,  attended: parentAttended,  color: "#7c3aed", bg: "#f5f3ff" },
                    ].map(({ label, total, attended, color, bg }) => (
                      <div key={label} className="p-3 rounded-xl" style={{ background: bg }}>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs font-bold" style={{ color }}>{label}</span>
                          <span className="text-xs font-semibold" style={{ color }}>{total} registered</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px]" style={{ color }}>
                          <span>{attended} attended ({pct(attended, total)}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Benchmark comparison */}
            {hasBenchmark && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "#949598" }}>
                  Benchmark vs. Your {benchmarkEvents!.length} Other Event{benchmarkEvents!.length !== 1 ? "s" : ""}
                </p>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#e4e0d6" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "#f8f6f1" }}>
                        <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Metric</th>
                        <th className="text-right px-4 py-2.5 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>This Event</th>
                        <th className="text-right px-4 py-2.5 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Your Avg</th>
                        <th className="text-right px-4 py-2.5 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "Attendance Rate",  current: attendRate,  benchmark: avg(bmAttendRates)  },
                        { label: "Apply Rate",        current: applyRate,   benchmark: avg(bmApplyRates)   },
                        { label: "Enroll Rate",       current: enrollRate,  benchmark: avg(bmEnrollRates)  },
                        { label: "Overall Conv.",     current: overallRate, benchmark: avg(bmOverallRates) },
                      ].map(({ label, current, benchmark: bm }, i) => {
                        const diff = current - bm;
                        const diffColor = diff > 2 ? "#086c64" : diff < -2 ? "#dc2626" : "#949598";
                        return (
                          <tr key={label} style={{ background: i % 2 === 0 ? "#fff" : "#faf9f6", borderTop: "1px solid #f0ede7" }}>
                            <td className="px-4 py-2.5 text-xs font-semibold" style={{ color: "#14211f" }}>{label}</td>
                            <td className="px-4 py-2.5 text-xs font-bold text-right" style={{ color: "#14211f" }}>{current}%</td>
                            <td className="px-4 py-2.5 text-xs text-right" style={{ color: "#5a6663" }}>{bm}%</td>
                            <td className="px-4 py-2.5 text-xs font-bold text-right" style={{ color: diffColor }}>
                              {diff > 0 ? `+${diff}%` : diff < 0 ? `${diff}%` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
