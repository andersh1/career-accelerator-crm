"use client";
import { useEffect, useState } from "react";
import {
  Loader2, BookOpen, CheckCircle2, Clock, BarChart3,
  Calendar, ClipboardList, ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";

interface PreworkAnswer { question: string; answer: string }
interface Prework       { submittedAt: string; answers: PreworkAnswer[] }
interface Booking       { startTime: string; endTime: string; status: string }

interface ModuleRow {
  moduleId:   string;
  number:     number;
  title:      string;
  sections:   number;
  completed:  number;
  pct:        number;
  submission: { status: string; submittedAt: string } | null;
  attended:   boolean | null;
  prework:    Prework | null;
  booking:    Booking | null;
}

interface LMSData {
  user:              { id: string; name: string; email: string; cohort: string | null; createdAt: string };
  completionPct:     number;
  totalSections:     number;
  doneSections:      number;
  submissionSummary: { total: number; pending: number; approved: number; needsRevision: number; reviewed: number };
  preworkSummary:    { submitted: number; total: number };
  bookingSummary:    { booked: number; total: number };
  moduleBreakdown:   ModuleRow[];
  lastActive:        string | null;
}

const SUB_COLOR: Record<string, string> = {
  PENDING:        "bg-amber-100 text-amber-700",
  APPROVED:       "bg-emerald-100 text-emerald-700",
  NEEDS_REVISION: "bg-red-100 text-red-700",
  REVIEWED:       "bg-blue-100 text-blue-700",
};

function fmtDate(iso: string | Date) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDateTime(iso: string | Date) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function StudentProgressPanel({ leadId }: { leadId: string }) {
  const [data,        setData]        = useState<LMSData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [expandedMod, setExpandedMod] = useState<string | null>(null);
  const [activeTab,   setActiveTab]   = useState<"progress" | "prework" | "1on1">("progress");

  useEffect(() => {
    fetch(`/api/crm/leads/${leadId}/lms-progress`)
      .then(r => r.ok ? r.json() : Promise.reject("not found"))
      .then(setData)
      .catch(() => setError("Could not load LMS data"))
      .finally(() => setLoading(false));
  }, [leadId]);

  if (loading) return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex items-center justify-center gap-2 text-slate-400">
      <Loader2 size={16} className="animate-spin" /><span className="text-sm">Loading LMS data…</span>
    </div>
  );

  if (error || !data) return null;

  const {
    completionPct, doneSections, totalSections,
    submissionSummary, preworkSummary, bookingSummary,
    moduleBreakdown, lastActive,
  } = data;

  const ringColor = completionPct >= 75 ? "#16a34a" : completionPct >= 40 ? "#2563eb" : "#f59e0b";

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <BarChart3 size={15} className="text-blue-600" />
        <p className="text-sm font-bold text-slate-900">LMS Record</p>
        {lastActive && (
          <span className="ml-auto text-[11px] text-slate-400 flex items-center gap-1">
            <Clock size={10} /> Last active {fmtDate(lastActive)}
          </span>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Overall progress ring + stats */}
        <div className="flex items-center gap-5">
          <div className="relative flex-shrink-0">
            <svg width="72" height="72" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="30" fill="none" stroke="#f1f5f9" strokeWidth="8" />
              <circle
                cx="36" cy="36" r="30" fill="none" stroke={ringColor} strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 30}`}
                strokeDashoffset={`${2 * Math.PI * 30 * (1 - completionPct / 100)}`}
                transform="rotate(-90 36 36)"
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-extrabold text-slate-900">{completionPct}%</span>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-3 gap-2">
            <div className="text-center p-2 bg-slate-50 rounded-xl">
              <p className="text-base font-bold text-slate-900">{doneSections}<span className="text-xs text-slate-400">/{totalSections}</span></p>
              <p className="text-[10px] text-slate-500">sections</p>
            </div>
            <div className="text-center p-2 bg-violet-50 rounded-xl">
              <p className="text-base font-bold text-violet-700">{preworkSummary.submitted}<span className="text-xs text-violet-400">/{preworkSummary.total}</span></p>
              <p className="text-[10px] text-violet-600">prework</p>
            </div>
            <div className="text-center p-2 bg-blue-50 rounded-xl">
              <p className="text-base font-bold text-blue-700">{bookingSummary.booked}<span className="text-xs text-blue-400">/{bookingSummary.total}</span></p>
              <p className="text-[10px] text-blue-600">1-on-1s</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {([
            ["progress", "Progress",  BookOpen],
            ["prework",  "Prework",   ClipboardList],
            ["1on1",     "1-on-1s",   Calendar],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}>
              <Icon size={11} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Progress tab ── */}
        {activeTab === "progress" && (
          <div className="space-y-2">
            {moduleBreakdown.map(mod => (
              <div key={mod.moduleId}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-bold text-slate-500 flex-shrink-0">M{mod.number}</span>
                    <span className="text-xs text-slate-700 truncate">{mod.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    {mod.submission && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${SUB_COLOR[mod.submission.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {mod.submission.status === "NEEDS_REVISION" ? "REVISION" : mod.submission.status}
                      </span>
                    )}
                    {mod.attended === true  && <span title="Attended session"><Calendar size={10} className="text-emerald-500" /></span>}
                    {mod.attended === false && <span title="Absent"><Calendar size={10} className="text-red-400" /></span>}
                    {mod.prework && <span title="Prework submitted"><ClipboardList size={10} className="text-violet-500" /></span>}
                    {mod.booking && <span title={`1-on-1: ${fmtDateTime(mod.booking.startTime)}`}><CheckCircle2 size={10} className="text-blue-500" /></span>}
                    <span className="text-[11px] font-semibold text-slate-500">{mod.pct}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${mod.pct === 100 ? "bg-emerald-500" : mod.pct > 0 ? "bg-blue-500" : "bg-slate-200"}`}
                    style={{ width: `${mod.pct}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="pt-2 grid grid-cols-4 gap-1.5 text-center">
              {[
                { label: "Pending",  val: submissionSummary.pending,       cls: "bg-amber-50  text-amber-700"   },
                { label: "Approved", val: submissionSummary.approved,      cls: "bg-emerald-50 text-emerald-700" },
                { label: "Revision", val: submissionSummary.needsRevision, cls: "bg-red-50    text-red-700"     },
                { label: "Reviewed", val: submissionSummary.reviewed,      cls: "bg-blue-50   text-blue-700"    },
              ].map(({ label, val, cls }) => (
                <div key={label} className={`rounded-xl p-2 ${cls}`}>
                  <p className="text-base font-bold">{val}</p>
                  <p className="text-[10px] font-medium">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Prework tab ── */}
        {activeTab === "prework" && (
          <div className="space-y-2">
            {moduleBreakdown.map(mod => {
              const isOpen = expandedMod === mod.moduleId;
              return (
                <div key={mod.moduleId} className="border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedMod(isOpen ? null : mod.moduleId)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition text-left"
                  >
                    <span className="text-[11px] font-bold text-slate-400 flex-shrink-0 w-6">M{mod.number}</span>
                    <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{mod.title}</span>
                    {mod.prework ? (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <CheckCircle2 size={12} className="text-violet-500" />
                        <span className="text-[10px] font-semibold text-violet-600">
                          {fmtDate(mod.prework.submittedAt)}
                        </span>
                        {isOpen ? <ChevronUp size={11} className="text-slate-400" /> : <ChevronDown size={11} className="text-slate-400" />}
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400 flex-shrink-0">Not submitted</span>
                    )}
                  </button>

                  {isOpen && mod.prework && (
                    <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3 bg-slate-50/50">
                      {/* Link to full call sheet on LMS */}
                      <a
                        href={`https://career-accelerator-lms.vercel.app/admin/prework/${mod.moduleId}/student/${data.user.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg transition"
                      >
                        <ExternalLink size={10} />
                        Open Full Call Sheet
                      </a>

                      {mod.prework.answers.map((ans, i) => (
                        <div key={i}>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                            Q{i + 1} — {ans.question}
                          </p>
                          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap bg-white border border-slate-100 rounded-lg px-3 py-2">
                            {ans.answer || <span className="italic text-slate-300">No answer</span>}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── 1-on-1 tab ── */}
        {activeTab === "1on1" && (
          <div className="space-y-2">
            {moduleBreakdown.map(mod => (
              <div key={mod.moduleId}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                  mod.booking ? "bg-blue-50/50 border-blue-200" : "bg-slate-50 border-slate-200"
                }`}>
                <span className="text-[11px] font-bold text-slate-400 flex-shrink-0 w-6">M{mod.number}</span>
                <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{mod.title}</span>
                {mod.booking ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0 text-right">
                    <CheckCircle2 size={12} className="text-blue-500" />
                    <div>
                      <p className="text-[10px] font-bold text-blue-700">
                        {new Date(mod.booking.startTime).toLocaleDateString("en-US", {
                          weekday: "short", month: "short", day: "numeric",
                        })}
                      </p>
                      <p className="text-[10px] text-blue-500">
                        {new Date(mod.booking.startTime).toLocaleTimeString("en-US", {
                          hour: "numeric", minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-400 flex-shrink-0">Not booked</span>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
              <span>{bookingSummary.booked} of {bookingSummary.total} modules booked</span>
              <span className={bookingSummary.booked === bookingSummary.total ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                {bookingSummary.booked === bookingSummary.total ? "All booked ✓" : `${bookingSummary.total - bookingSummary.booked} remaining`}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
