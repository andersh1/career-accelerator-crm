"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2, Circle, AlertCircle, Clock, TrendingUp,
  Users, Zap, AlertTriangle, Activity, ChevronRight,
  DollarSign, Loader2, RefreshCw, Target, BookOpen,
} from "lucide-react";
import { stageInfo, ACTIVITY_META } from "@/components/crm/constants";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TaskRecord {
  id: string; title: string; dueAt: string | null; completedAt: string | null;
  lead: { id: string; firstName: string; lastName: string; stage: string; email: string };
}
interface LeadSummary {
  id: string; firstName: string; lastName: string; email: string;
  stage: string; priority: string; dealValue: number | null; updatedAt: string;
  _count?: { activities: number };
}
interface ApplicationLead {
  id: string; firstName: string; lastName: string; email: string;
  stage: string; priority: string; source: string | null; leadType: string | null; createdAt: string;
}
interface ActivityRecord {
  id: string; type: string; content: string | null; createdAt: string;
  lead: { id: string; firstName: string; lastName: string };
}
interface PipelineStage { count: number; value: number; }
interface CohortFill { id: string; name: string; capacity: number | null; enrolled: number; fillPct: number | null; spotsLeft: number | null; }
interface LostReason { reason: string; count: number; }
interface LmsCompletion {
  completedAt: string;
  userId: string;
  user: { name: string; email: string };
  section: { title: string; module: { number: number; title: string } } | null;
}
interface AtRiskStudent {
  id: string; name: string; email: string; cohort: string | null;
  progress: { completedAt: string }[];
}
interface RecentSurvey {
  submittedAt: string; overallRating: number | null; moduleId: string;
  user: { name: string };
}
interface HomeData {
  tasks:            TaskRecord[];
  newApplications:  ApplicationLead[];
  hotLeads:         LeadSummary[];
  staleLeads:       LeadSummary[];
  recentActivity: ActivityRecord[];
  pipeline:       Record<string, PipelineStage>;
  cohortFill:     CohortFill[];
  lostReasons:    LostReason[];
  lmsActivity?: {
    recentCompletions: LmsCompletion[];
    atRiskStudents:    AtRiskStudent[];
    recentSurveys:     RecentSurvey[];
  };
  summary: {
    totalLeads: number; enrolled: number; lost: number; active: number;
    overdueCount: number; todayCount: number; staleCount: number; hotCount: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt$(n: number | null) {
  if (!n) return null;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${n}`;
}
function timeAgo(dateStr: string) {
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (d < 1)   return "just now";
  if (d < 60)  return `${d}m ago`;
  if (d < 1440) return `${Math.floor(d / 60)}h ago`;
  return `${Math.floor(d / 1440)}d ago`;
}
function daysAgo(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}
function dueLabel(dueAt: string | null) {
  if (!dueAt) return null;
  const d    = new Date(dueAt);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0)   return { text: `${Math.abs(days)}d overdue`, cls: "text-red-600 bg-red-50" };
  if (days === 0) return { text: "Due today",    cls: "text-amber-600 bg-amber-50" };
  if (days === 1) return { text: "Due tomorrow", cls: "text-blue-600 bg-blue-50" };
  return null;
}

const PRIORITY_DOT: Record<string, string> = {
  URGENT: "bg-red-500", HIGH: "bg-amber-400", NORMAL: "bg-blue-400", LOW: "bg-slate-300",
};
const STAGE_ORDER = ["LEAD","CONTACTED","STRATEGY_CALL","OFFER_SENT"];
const STAGE_COLOR: Record<string, string> = {
  LEAD: "bg-slate-400", CONTACTED: "bg-blue-500",
  STRATEGY_CALL: "bg-violet-500", OFFER_SENT: "bg-amber-500",
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [data,    setData]    = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const [showDeniedBanner, setShowDeniedBanner] = useState(false);

  useEffect(() => {
    if (searchParams.get("denied") === "1") {
      setShowDeniedBanner(true);
      // Remove the query param without reload
      const url = new URL(window.location.href);
      url.searchParams.delete("denied");
      window.history.replaceState({}, "", url.toString());
      setTimeout(() => setShowDeniedBanner(false), 5000);
    }
  }, [searchParams]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/home");
      if (res.ok) setData(await res.json());
    } catch {
      // network error — keep existing data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function completeTask(taskId: string, leadId: string) {
    setCompleting(taskId);
    try {
      const res = await fetch(`/api/crm/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error("Failed");
      // Only update UI on confirmed success
      setData(d => {
        if (!d) return d;
        const task = d.tasks.find(t => t.id === taskId);
        const wasOverdue = task?.dueAt ? new Date(task.dueAt) < new Date(new Date().toDateString()) : false;
        return {
          ...d,
          tasks: d.tasks.filter(t => t.id !== taskId),
          summary: { ...d.summary, overdueCount: wasOverdue ? Math.max(0, d.summary.overdueCount - 1) : d.summary.overdueCount },
        };
      });
    } catch {
      // task stays in list — server rejected it
    } finally {
      setCompleting(null);
    }
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = session?.user?.name?.split(" ")[0] ?? "Dan";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={24} className="animate-spin" style={{ color: "#8a938f" }} />
      </div>
    );
  }

  if (!data) return null;

  const { tasks, newApplications, hotLeads, staleLeads, recentActivity, pipeline, cohortFill, lostReasons, lmsActivity, summary } = data;
  const startOfToday    = new Date(new Date().toDateString());
  const startOfTomorrow = new Date(startOfToday.getTime() + 86400000);
  const overdueTasks = tasks.filter(t => t.dueAt && new Date(t.dueAt) < startOfToday);
  const todayTasks   = tasks.filter(t => {
    if (!t.dueAt) return false;
    const d = new Date(t.dueAt);
    return d >= startOfToday && d < startOfTomorrow;
  });

  const totalPipelineValue = Object.values(pipeline).reduce((s, v) => s + v.value, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-up">
      {/* ── Access denied banner ── */}
      {showDeniedBanner && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <AlertCircle size={16} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-800 font-medium">Access denied. That page requires Admin access.</p>
        </div>
      )}
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#8a938f" }}>Vantage Career Accelerator</p>
          <h1 className="text-2xl font-display font-semibold" style={{ color: "#14211f" }}>{greeting}, {firstName} 👋</h1>
          <p className="text-sm mt-0.5" style={{ color: "#8a938f" }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-xs transition px-3 py-2 rounded-xl hover:bg-[#f8f6f1] border border-transparent hover:border-[#e4e0d6]" style={{ color: "#8a938f" }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Active Leads",  value: summary.active,      icon: <Users size={14} style={{ color: "#0a6b64" }} />,    href: "/pipeline" },
          { label: "Overdue Tasks", value: summary.overdueCount, icon: <AlertCircle size={14} className="text-red-400" />, href: "/tasks",  alert: summary.overdueCount > 0 },
          { label: "Stale (14d+)", value: summary.staleCount,   icon: <Clock size={14} className="text-amber-400" />,   href: "/leads",   alert: summary.staleCount > 0 },
          { label: "Pipeline $",   value: fmt$(totalPipelineValue) ?? "$0",
            icon: <DollarSign size={14} style={{ color: "#0a6b64" }} />, href: "/pipeline", raw: true },
        ].map(kpi => (
          <Link key={kpi.label} href={kpi.href}
            className={`rounded-2xl border p-4 hover:shadow-md transition group ${kpi.alert ? "bg-red-50 border-red-200" : "card"}`}>
            <div className="flex items-center gap-1.5 mb-1">{kpi.icon}</div>
            <p className={`text-xl font-extrabold ${kpi.alert ? "text-red-700" : ""}`} style={kpi.alert ? undefined : { color: "#14211f" }}>
              {kpi.raw ? kpi.value : kpi.value}
            </p>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: "#8a938f" }}>{kpi.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── LEFT column (2/3) ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* ── New Applications ── */}
          {newApplications.length > 0 && (
            <div className="overflow-hidden rounded-2xl border-2" style={{ borderColor: "#0a6b64", background: "white" }}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#d0e8e6", background: "#edf5f4" }}>
                <h2 className="font-bold flex items-center gap-2" style={{ color: "#084f4a" }}>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ background: "#0a6b64" }}>
                    {newApplications.length}
                  </span>
                  New Applications
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: "#d0e8e6", color: "#0a6b64" }}>
                    Not yet contacted
                  </span>
                </h2>
                <Link href="/pipeline" className="text-xs flex items-center gap-0.5 transition" style={{ color: "#0a6b64" }}>
                  View all <ChevronRight size={11} />
                </Link>
              </div>
              <div className="divide-y" style={{ borderColor: "#d0e8e6" }}>
                {newApplications.map(lead => {
                  const sourceLabel = lead.source === "3I_NEXTGEN" ? "3i NextGen" : lead.source === "WEBSITE" ? "Website" : (lead.source ?? "Web");
                  const isApp = lead.leadType === "APPLICATION";
                  return (
                    <Link key={lead.id} href={`/leads/${lead.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition group hover:bg-[#edf5f4]">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white" style={{ background: "#0a6b64" }}>
                        {lead.firstName[0]}{lead.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "#14211f" }}>
                          {lead.firstName} {lead.lastName}
                        </p>
                        <p className="text-xs truncate" style={{ color: "#5a6663" }}>{lead.email}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: isApp ? "#d0e8e6" : "#f1efe8", color: isApp ? "#084f4a" : "#5a6663" }}>
                          {isApp ? "Application" : "Waitlist"} · {sourceLabel}
                        </span>
                        <span className="text-[10px]" style={{ color: "#8a938f" }}>{timeAgo(lead.createdAt)}</span>
                        <ChevronRight size={14} style={{ color: "#c9c4b8" }} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Today's tasks */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e4e0d6]">
              <h2 className="font-bold flex items-center gap-2" style={{ color: "#14211f" }}>
                <CheckCircle2 size={15} style={{ color: "#0a6b64" }} /> Today&apos;s Focus
                {tasks.length > 0 && (
                  <span className="ml-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#edf5f4", color: "#0a6b64" }}>{tasks.length}</span>
                )}
              </h2>
              <Link href="/tasks" className="text-xs transition flex items-center gap-0.5" style={{ color: "#8a938f" }}>
                All tasks <ChevronRight size={11} />
              </Link>
            </div>

            {tasks.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-2xl mb-2">✅</p>
                <p className="font-semibold" style={{ color: "#5a6663" }}>All clear!</p>
                <p className="text-sm" style={{ color: "#8a938f" }}>No overdue or due-today tasks.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#e4e0d6]">
                {overdueTasks.length > 0 && (
                  <div className="px-5 py-2 bg-red-50">
                    <p className="text-[11px] font-bold text-red-600 uppercase tracking-wide">⚠️ Overdue ({overdueTasks.length})</p>
                  </div>
                )}
                {[...overdueTasks, ...todayTasks].slice(0, 8).map(task => {
                  const due = dueLabel(task.dueAt);
                  return (
                    <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#f8f6f1] transition group">
                      <button
                        onClick={() => completeTask(task.id, task.lead.id)}
                        disabled={completing === task.id}
                        className="flex-shrink-0 transition"
                        style={{ color: "#c9c4b8" }}
                      >
                        {completing === task.id
                          ? <Loader2 size={16} className="animate-spin" />
                          : <Circle size={16} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "#14211f" }}>{task.title}</p>
                        <Link href={`/leads/${task.lead.id}`} className="text-xs transition truncate flex items-center gap-1" style={{ color: "#8a938f" }}>
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${stageInfo(task.lead.stage).dot}`} />
                          {task.lead.firstName} {task.lead.lastName}
                        </Link>
                      </div>
                      {due && (
                        <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg ${due.cls}`}>
                          {due.text}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Hot leads */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e4e0d6]">
              <h2 className="font-bold flex items-center gap-2" style={{ color: "#14211f" }}>
                <Zap size={15} className="text-amber-400" /> Hot Leads
              </h2>
              <Link href="/pipeline" className="text-xs transition flex items-center gap-0.5" style={{ color: "#8a938f" }}>
                Pipeline <ChevronRight size={11} />
              </Link>
            </div>

            {hotLeads.length === 0 ? (
              <p className="px-5 py-6 text-sm text-center" style={{ color: "#8a938f" }}>No active leads in pipeline.</p>
            ) : (
              <div className="divide-y divide-[#e4e0d6]">
                {hotLeads.map(lead => (
                  <Link key={lead.id} href={`/leads/${lead.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-[#f8f6f1] transition group">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[lead.priority]}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate transition" style={{ color: "#14211f" }}>
                        {lead.firstName} {lead.lastName}
                      </p>
                      <p className="text-xs truncate" style={{ color: "#8a938f" }}>{lead.email}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stageInfo(lead.stage).color}`}>
                        {stageInfo(lead.stage).label}
                      </span>
                      {lead.dealValue && (
                        <p className="text-xs font-bold text-emerald-600 mt-0.5">{fmt$(lead.dealValue)}</p>
                      )}
                    </div>
                    <ChevronRight size={14} className="flex-shrink-0 transition" style={{ color: "#c9c4b8" }} />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Stale leads */}
          {staleLeads.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-amber-100 bg-amber-50">
                <h2 className="font-bold text-amber-800 flex items-center gap-2">
                  <AlertTriangle size={15} className="text-amber-500" /> Needs Attention
                  <span className="text-xs font-bold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">{staleLeads.length}</span>
                </h2>
                <p className="text-[11px] text-amber-600">Not touched in 14+ days</p>
              </div>
              <div className="divide-y divide-amber-50">
                {staleLeads.map(lead => (
                  <Link key={lead.id} href={`/leads/${lead.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-amber-50/50 transition group">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[lead.priority]}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate group-hover:text-amber-700" style={{ color: "#14211f" }}>{lead.firstName} {lead.lastName}</p>
                      <p className="text-xs" style={{ color: "#8a938f" }}>{lead.email}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stageInfo(lead.stage).color}`}>
                        {stageInfo(lead.stage).label}
                      </span>
                      <p className="text-xs text-amber-600 mt-0.5 font-medium">{daysAgo(lead.updatedAt)}d ago</p>
                    </div>
                    <ChevronRight size={14} className="transition flex-shrink-0 text-amber-300 group-hover:text-amber-500" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT column (1/3) ── */}
        <div className="space-y-5">

          {/* Pipeline snapshot */}
          <div className="card p-5">
            <Link href="/pipeline" className="flex items-center gap-2 mb-4 group">
              <TrendingUp size={15} style={{ color: "#0a6b64" }} />
              <h2 className="font-bold group-hover:underline" style={{ color: "#14211f" }}>Pipeline</h2>
              <ChevronRight size={13} className="ml-auto opacity-0 group-hover:opacity-100 transition" style={{ color: "#8a938f" }} />
            </Link>
            <div className="space-y-3">
              {STAGE_ORDER.map(stage => {
                const s = pipeline[stage];
                if (!s) return null;
                const maxCount = Math.max(...STAGE_ORDER.map(st => pipeline[st]?.count ?? 0), 1);
                return (
                  <Link key={stage} href={`/pipeline`} className="group block">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold" style={{ color: "#5a6663" }}>{stageInfo(stage).label}</span>
                      <span style={{ color: "#8a938f" }}>{s.count} lead{s.count !== 1 ? "s" : ""}{s.value > 0 ? ` · ${fmt$(s.value)}` : ""}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#e4e0d6" }}>
                      <div
                        className={`h-full rounded-full ${STAGE_COLOR[stage]} transition-all group-hover:opacity-80`}
                        style={{ width: `${Math.round((s.count / maxCount) * 100)}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Cohort fill */}
          {cohortFill.length > 0 && (
            <div className="card p-5">
              <Link href="/cohorts" className="flex items-center gap-2 mb-4 group">
                <Target size={15} className="text-emerald-400" />
                <h2 className="font-bold group-hover:underline" style={{ color: "#14211f" }}>Cohort Fill</h2>
                <ChevronRight size={13} className="ml-auto opacity-0 group-hover:opacity-100 transition" style={{ color: "#8a938f" }} />
              </Link>
              <div className="space-y-4">
                {cohortFill.map(c => (
                  <Link key={c.id} href="/cohorts" className="block group">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold truncate group-hover:underline" style={{ color: "#5a6663" }}>{c.name}</span>
                      <span className="flex-shrink-0 ml-2" style={{ color: "#8a938f" }}>
                        {c.enrolled}{c.capacity ? `/${c.capacity}` : ""} enrolled
                      </span>
                    </div>
                    {c.capacity && (
                      <>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: "#e4e0d6" }}>
                          <div
                            className={`h-full rounded-full transition-all ${(c.fillPct ?? 0) >= 90 ? "bg-red-400" : (c.fillPct ?? 0) >= 70 ? "bg-amber-400" : "bg-emerald-500"}`}
                            style={{ width: `${Math.min(c.fillPct ?? 0, 100)}%` }}
                          />
                        </div>
                        <p className="text-[10px] mt-1" style={{ color: "#8a938f" }}>
                          {c.spotsLeft !== null && c.spotsLeft > 0
                            ? <span className="text-amber-600 font-semibold">{c.spotsLeft} spot{c.spotsLeft !== 1 ? "s" : ""} left</span>
                            : <span className="text-red-600 font-semibold">Full</span>
                          }
                          {" "}&mdash; {c.fillPct}% filled
                        </p>
                      </>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Why we lose */}
          {lostReasons.length > 0 && (
            <div className="card p-5">
              <h2 className="font-bold flex items-center gap-2 mb-4" style={{ color: "#14211f" }}>
                <AlertCircle size={15} className="text-red-400" /> Why We Lose
              </h2>
              <div className="space-y-2.5">
                {lostReasons.slice(0, 6).map(r => {
                  const total = lostReasons.reduce((s, x) => s + x.count, 0);
                  const pct   = Math.round((r.count / total) * 100);
                  return (
                    <div key={r.reason}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="truncate font-medium" style={{ color: "#5a6663" }}>{r.reason}</span>
                        <span className="flex-shrink-0 ml-2" style={{ color: "#8a938f" }}>{r.count} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#e4e0d6" }}>
                        <div className="h-full bg-red-300 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent activity */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e4e0d6]">
              <h2 className="font-bold flex items-center gap-2" style={{ color: "#14211f" }}>
                <Activity size={15} style={{ color: "#8a938f" }} /> Recent Activity
              </h2>
              <Link href="/leads" className="text-xs transition flex items-center gap-0.5" style={{ color: "#8a938f" }}>
                All contacts <ChevronRight size={11} />
              </Link>
            </div>
            <div className="divide-y divide-[#e4e0d6] max-h-72 overflow-y-auto">
              {recentActivity.length === 0 ? (
                <p className="px-5 py-4 text-sm" style={{ color: "#8a938f" }}>No activity in the last 7 days.</p>
              ) : recentActivity.map(act => {
                const meta = ACTIVITY_META[act.type] ?? { icon: "📋", label: act.type };
                return (
                  <Link key={act.id} href={`/leads/${act.lead.id}`}
                    className="flex items-start gap-2.5 px-5 py-3 hover:bg-[#f8f6f1] transition">
                    <span className="text-base flex-shrink-0 mt-0.5">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: "#5a6663" }}>
                        {act.lead.firstName} {act.lead.lastName}
                      </p>
                      <p className="text-[11px] line-clamp-2" style={{ color: "#8a938f" }} title={act.content ?? meta.label}>{act.content ?? meta.label}</p>
                    </div>
                    <span className="text-[10px] flex-shrink-0" style={{ color: "#c9c4b8" }}>{timeAgo(act.createdAt)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── LMS Activity ── */}
      {lmsActivity && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={15} style={{ color: "#0a6b64" }} />
            <h2 className="font-bold" style={{ color: "#14211f" }}>LMS Activity</h2>
            <span className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: "#8a938f" }}>
              — last 7 days
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Recent completions */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b" style={{ borderColor: "#e4e0d6" }}>
                <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: "#14211f" }}>
                  <span>✅</span> Recent Activity
                  {lmsActivity.recentCompletions.length > 0 && (
                    <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#edf5f4", color: "#0a6b64" }}>
                      {lmsActivity.recentCompletions.length}
                    </span>
                  )}
                </h3>
              </div>
              {lmsActivity.recentCompletions.length === 0 ? (
                <p className="px-5 py-6 text-sm text-center" style={{ color: "#8a938f" }}>No completions in last 7 days.</p>
              ) : (
                <div className="divide-y max-h-72 overflow-y-auto" style={{ borderColor: "#e4e0d6" }}>
                  {lmsActivity.recentCompletions.slice(0, 8).map((c, i) => (
                    <div key={i} className="flex items-start gap-2.5 px-5 py-3 hover:bg-[#f8f6f1] transition">
                      <span className="text-sm flex-shrink-0 mt-0.5">✅</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: "#14211f" }}>{c.user.name}</p>
                        {c.section && (
                          <p className="text-[11px] truncate" style={{ color: "#8a938f" }}>
                            {c.section.title} · M{c.section.module.number}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] flex-shrink-0" style={{ color: "#c9c4b8" }}>{timeAgo(c.completedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* At-risk students */}
            <div className="overflow-hidden rounded-2xl border" style={{ borderColor: lmsActivity.atRiskStudents.length > 0 ? "#fde68a" : "#e4e0d6", background: "white" }}>
              <div className="px-5 py-4 border-b" style={{ borderColor: lmsActivity.atRiskStudents.length > 0 ? "#fde68a" : "#e4e0d6", background: lmsActivity.atRiskStudents.length > 0 ? "#fffbeb" : "#f8f6f1" }}>
                <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: lmsActivity.atRiskStudents.length > 0 ? "#92400e" : "#14211f" }}>
                  <span>⚠️</span> At-Risk Students
                  {lmsActivity.atRiskStudents.length > 0 && (
                    <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">
                      {lmsActivity.atRiskStudents.length}
                    </span>
                  )}
                </h3>
                <p className="text-[11px] mt-0.5" style={{ color: "#8a938f" }}>No LMS activity in 7+ days</p>
              </div>
              {lmsActivity.atRiskStudents.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <p className="text-xl mb-1">🎉</p>
                  <p className="text-sm font-semibold" style={{ color: "#0a6b64" }}>Everyone is active!</p>
                </div>
              ) : (
                <div className="divide-y max-h-72 overflow-y-auto" style={{ borderColor: "#fde68a" }}>
                  {lmsActivity.atRiskStudents.map(s => {
                    const last = s.progress[0]?.completedAt;
                    return (
                      <Link key={s.id} href={`/leads?q=${encodeURIComponent(s.email)}`}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-amber-50/50 transition group">
                        <span className="text-sm flex-shrink-0">⚠️</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate group-hover:underline" style={{ color: "#14211f" }}>{s.name}</p>
                          {s.cohort && <p className="text-[10px] truncate" style={{ color: "#8a938f" }}>{s.cohort}</p>}
                        </div>
                        <span className="text-[10px] font-semibold flex-shrink-0 text-amber-600">
                          {last ? `${daysAgo(last)}d ago` : "never"}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent surveys */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b" style={{ borderColor: "#e4e0d6" }}>
                <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: "#14211f" }}>
                  <span>📊</span> Recent Surveys
                  {lmsActivity.recentSurveys.length > 0 && (
                    <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#edf5f4", color: "#0a6b64" }}>
                      {lmsActivity.recentSurveys.length}
                    </span>
                  )}
                </h3>
              </div>
              {lmsActivity.recentSurveys.length === 0 ? (
                <p className="px-5 py-6 text-sm text-center" style={{ color: "#8a938f" }}>No surveys submitted this week.</p>
              ) : (
                <div className="divide-y max-h-72 overflow-y-auto" style={{ borderColor: "#e4e0d6" }}>
                  {lmsActivity.recentSurveys.map((s, i) => {
                    const rating = s.overallRating;
                    const ratingColor = rating !== null
                      ? rating >= 4 ? "#0a6b64" : rating === 3 ? "#d97706" : "#dc2626"
                      : "#8a938f";
                    return (
                      <div key={i} className="flex items-center gap-2.5 px-5 py-3 hover:bg-[#f8f6f1] transition">
                        {rating !== null ? (
                          <span className="text-xs font-extrabold flex-shrink-0 w-8 text-center py-0.5 rounded-lg"
                            style={{ color: ratingColor, background: `${ratingColor}18` }}>
                            {rating}/5
                          </span>
                        ) : (
                          <span className="text-base flex-shrink-0">📊</span>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate" style={{ color: "#14211f" }}>{s.user.name}</p>
                          <p className="text-[10px] truncate" style={{ color: "#8a938f" }}>
                            {timeAgo(s.submittedAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
