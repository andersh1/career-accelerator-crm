"use client";
import { useEffect, useState } from "react";
import { Loader2, BookOpen, CheckCircle2, Clock, AlertCircle, BarChart3, Calendar } from "lucide-react";

interface ModuleRow {
  moduleId: string;
  number: number;
  title: string;
  sections: number;
  completed: number;
  pct: number;
  submission: { status: string; submittedAt: string } | null;
  attended: boolean | null;
}

interface LMSData {
  user: { name: string; email: string; cohort: string | null; createdAt: string };
  completionPct: number;
  totalSections: number;
  doneSections: number;
  submissionSummary: {
    total: number; pending: number; approved: number;
    needsRevision: number; reviewed: number;
  };
  moduleBreakdown: ModuleRow[];
  lastActive: string | null;
}

const SUB_COLOR: Record<string, string> = {
  PENDING:        "bg-amber-100 text-amber-700",
  APPROVED:       "bg-emerald-100 text-emerald-700",
  NEEDS_REVISION: "bg-red-100 text-red-700",
  REVIEWED:       "bg-blue-100 text-blue-700",
};

export default function StudentProgressPanel({ leadId }: { leadId: string }) {
  const [data,    setData]    = useState<LMSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    fetch(`/api/crm/leads/${leadId}/lms-progress`)
      .then(r => r.ok ? r.json() : Promise.reject("not found"))
      .then(setData)
      .catch(() => setError("Could not load LMS data"))
      .finally(() => setLoading(false));
  }, [leadId]);

  if (loading) return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex items-center justify-center gap-2 text-slate-400">
      <Loader2 size={16} className="animate-spin" />
      <span className="text-sm">Loading LMS data…</span>
    </div>
  );

  if (error || !data) return null;

  const { completionPct, doneSections, totalSections, submissionSummary, moduleBreakdown, lastActive } = data;

  const ringColor = completionPct >= 75 ? "#16a34a" : completionPct >= 40 ? "#2563eb" : "#f59e0b";

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <BarChart3 size={15} className="text-blue-600" />
        <p className="text-sm font-bold text-slate-900">LMS Progress</p>
        {lastActive && (
          <span className="ml-auto text-[11px] text-slate-400 flex items-center gap-1">
            <Clock size={10} /> Last active {new Date(lastActive).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        {/* Overall progress ring + stats */}
        <div className="flex items-center gap-5">
          {/* SVG ring */}
          <div className="relative flex-shrink-0">
            <svg width="72" height="72" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="30" fill="none" stroke="#f1f5f9" strokeWidth="8" />
              <circle
                cx="36" cy="36" r="30"
                fill="none" stroke={ringColor} strokeWidth="8"
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

          {/* Stats */}
          <div className="flex-1 grid grid-cols-2 gap-2">
            <div className="text-center p-2.5 bg-slate-50 rounded-xl">
              <p className="text-lg font-bold text-slate-900">{doneSections}</p>
              <p className="text-[10px] text-slate-500">of {totalSections} sections</p>
            </div>
            <div className="text-center p-2.5 bg-amber-50 rounded-xl">
              <p className="text-lg font-bold text-amber-700">{submissionSummary.pending}</p>
              <p className="text-[10px] text-amber-600">pending review</p>
            </div>
            <div className="text-center p-2.5 bg-emerald-50 rounded-xl">
              <p className="text-lg font-bold text-emerald-700">{submissionSummary.approved}</p>
              <p className="text-[10px] text-emerald-600">approved</p>
            </div>
            <div className="text-center p-2.5 bg-red-50 rounded-xl">
              <p className="text-lg font-bold text-red-700">{submissionSummary.needsRevision}</p>
              <p className="text-[10px] text-red-600">needs revision</p>
            </div>
          </div>
        </div>

        {/* Per-module breakdown */}
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">Module Breakdown</p>
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
                    {mod.attended === true  && <span title="Attended"><Calendar size={11} className="text-emerald-500" /></span>}
                    {mod.attended === false && <span title="Absent"><Calendar size={11} className="text-red-400" /></span>}
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
          </div>
        </div>
      </div>
    </div>
  );
}
