"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2, Circle, AlertCircle, Clock, TrendingUp,
  Users, Zap, AlertTriangle, Activity, ChevronRight,
  DollarSign, Loader2, RefreshCw, Target,
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
interface ActivityRecord {
  id: string; type: string; content: string | null; createdAt: string;
  lead: { id: string; firstName: string; lastName: string };
}
interface PipelineStage { count: number; value: number; }
interface CohortFill { id: string; name: string; capacity: number | null; enrolled: number; fillPct: number | null; spotsLeft: number | null; }
interface LostReason { reason: string; count: number; }
interface HomeData {
  tasks:          TaskRecord[];
  hotLeads:       LeadSummary[];
  staleLeads:     LeadSummary[];
  recentActivity: ActivityRecord[];
  pipeline:       Record<string, PipelineStage>;
  cohortFill:     CohortFill[];
  lostReasons:    LostReason[];
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
const STAGE_ORDER = ["LEAD","CONTACTED","QUALIFIED","PROPOSAL"];
const STAGE_COLOR: Record<string, string> = {
  LEAD: "bg-slate-400", CONTACTED: "bg-blue-500",
  QUALIFIED: "bg-violet-500", PROPOSAL: "bg-amber-500",
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
    const res = await fetch("/api/crm/home");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function completeTask(taskId: string, leadId: string) {
    setCompleting(taskId);
    await fetch(`/api/crm/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completedAt: new Date().toISOString() }),
    });
    setData(d => d ? {
      ...d,
      tasks: d.tasks.filter(t => t.id !== taskId),
      summary: { ...d.summary, overdueCount: Math.max(0, d.summary.overdueCount - 1) },
    } : d);
    setCompleting(null);
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = session?.user?.name?.split(" ")[0] ?? "Dan";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (!data) return null;

  const { tasks, hotLeads, staleLeads, recentActivity, pipeline, cohortFill, lostReasons, summary } = data;
  const overdueTasks = tasks.filter(t => t.dueAt && new Date(t.dueAt) < new Date(new Date().toDateString()));
  const todayTasks   = tasks.filter(t => {
    if (!t.dueAt) return false;
    const d = new Date(t.dueAt); const n = new Date(new Date().toDateString());
    return d >= n && d < new Date(n.getTime() + 86400000);
  });

  const totalPipelineValue = Object.values(pipeline).reduce((s, v) => s + v.value, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
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
          <h1 className="text-2xl font-extrabold text-slate-900">{greeting}, {firstName} 👋</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition px-3 py-2 rounded-xl hover:bg-slate-100 border border-transparent hover:border-slate-200">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Active Leads",  value: summary.active,      icon: <Users size={14} className="text-blue-400" />,    href: "/leads?stage=active" },
          { label: "Overdue Tasks", value: summary.overdueCount, icon: <AlertCircle size={14} className="text-red-400" />, href: "/tasks",  alert: summary.overdueCount > 0 },
          { label: "Stale (14d+)", value: summary.staleCount,   icon: <Clock size={14} className="text-amber-400" />,   href: "/leads",   alert: summary.staleCount > 0 },
          { label: "Pipeline $",   value: fmt$(totalPipelineValue) ?? "$0",
            icon: <DollarSign size={14} className="text-emerald-400" />, href: "/pipeline", raw: true },
        ].map(kpi => (
          <Link key={kpi.label} href={kpi.href}
            className={`rounded-2xl border p-4 hover:shadow-md transition group ${kpi.alert ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
            <div className="flex items-center gap-1.5 mb-1">{kpi.icon}</div>
            <p className={`text-xl font-extrabold ${kpi.alert ? "text-red-700" : "text-slate-900"}`}>
              {kpi.raw ? kpi.value : kpi.value}
            </p>
            <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">{kpi.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── LEFT column (2/3) ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Today's tasks */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 size={15} className="text-blue-400" /> Today&apos;s Focus
                {tasks.length > 0 && (
                  <span className="ml-1 text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{tasks.length}</span>
                )}
              </h2>
              <Link href="/tasks" className="text-xs text-slate-400 hover:text-blue-600 transition flex items-center gap-0.5">
                All tasks <ChevronRight size={11} />
              </Link>
            </div>

            {tasks.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-2xl mb-2">✅</p>
                <p className="font-semibold text-slate-700">All clear!</p>
                <p className="text-slate-400 text-sm">No overdue or due-today tasks.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {overdueTasks.length > 0 && (
                  <div className="px-5 py-2 bg-red-50">
                    <p className="text-[11px] font-bold text-red-600 uppercase tracking-wide">⚠️ Overdue ({overdueTasks.length})</p>
                  </div>
                )}
                {[...overdueTasks, ...todayTasks].slice(0, 8).map(task => {
                  const due = dueLabel(task.dueAt);
                  return (
                    <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition group">
                      <button
                        onClick={() => completeTask(task.id, task.lead.id)}
                        disabled={completing === task.id}
                        className="flex-shrink-0 text-slate-300 hover:text-emerald-500 transition"
                      >
                        {completing === task.id
                          ? <Loader2 size={16} className="animate-spin" />
                          : <Circle size={16} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{task.title}</p>
                        <Link href={`/leads/${task.lead.id}`} className="text-xs text-slate-400 hover:text-blue-600 transition truncate flex items-center gap-1">
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
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                <Zap size={15} className="text-amber-400" /> Hot Leads
              </h2>
              <Link href="/pipeline" className="text-xs text-slate-400 hover:text-blue-600 transition flex items-center gap-0.5">
                Pipeline <ChevronRight size={11} />
              </Link>
            </div>

            {hotLeads.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400 text-center">No active leads in pipeline.</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {hotLeads.map(lead => (
                  <Link key={lead.id} href={`/leads/${lead.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition group">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[lead.priority]}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-blue-600 transition">
                        {lead.firstName} {lead.lastName}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{lead.email}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stageInfo(lead.stage).color}`}>
                        {stageInfo(lead.stage).label}
                      </span>
                      {lead.dealValue && (
                        <p className="text-xs font-bold text-emerald-600 mt-0.5">{fmt$(lead.dealValue)}</p>
                      )}
                    </div>
                    <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition flex-shrink-0" />
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
                      <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-amber-700">{lead.firstName} {lead.lastName}</p>
                      <p className="text-xs text-slate-400">{lead.email}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stageInfo(lead.stage).color}`}>
                        {stageInfo(lead.stage).label}
                      </span>
                      <p className="text-xs text-amber-600 mt-0.5 font-medium">{daysAgo(lead.updatedAt)}d ago</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-300 group-hover:text-amber-500 transition flex-shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT column (1/3) ── */}
        <div className="space-y-5">

          {/* Pipeline snapshot */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="font-bold text-slate-900 flex items-center gap-2 mb-4">
              <TrendingUp size={15} className="text-blue-400" /> Pipeline
            </h2>
            <div className="space-y-3">
              {STAGE_ORDER.map(stage => {
                const s = pipeline[stage];
                if (!s) return null;
                const maxCount = Math.max(...STAGE_ORDER.map(st => pipeline[st]?.count ?? 0), 1);
                return (
                  <Link key={stage} href={`/pipeline`} className="group block">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-700">{stageInfo(stage).label}</span>
                      <span className="text-slate-400">{s.count} lead{s.count !== 1 ? "s" : ""}{s.value > 0 ? ` · ${fmt$(s.value)}` : ""}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
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
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="font-bold text-slate-900 flex items-center gap-2 mb-4">
                <Target size={15} className="text-emerald-400" /> Cohort Fill
              </h2>
              <div className="space-y-4">
                {cohortFill.map(c => (
                  <div key={c.id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-700 truncate">{c.name}</span>
                      <span className="text-slate-400 flex-shrink-0 ml-2">
                        {c.enrolled}{c.capacity ? `/${c.capacity}` : ""} enrolled
                      </span>
                    </div>
                    {c.capacity && (
                      <>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${(c.fillPct ?? 0) >= 90 ? "bg-red-400" : (c.fillPct ?? 0) >= 70 ? "bg-amber-400" : "bg-emerald-500"}`}
                            style={{ width: `${Math.min(c.fillPct ?? 0, 100)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {c.spotsLeft !== null && c.spotsLeft > 0
                            ? <span className="text-amber-600 font-semibold">{c.spotsLeft} spot{c.spotsLeft !== 1 ? "s" : ""} left</span>
                            : <span className="text-red-600 font-semibold">Full</span>
                          }
                          {" "}&mdash; {c.fillPct}% filled
                        </p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Why we lose */}
          {lostReasons.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="font-bold text-slate-900 flex items-center gap-2 mb-4">
                <AlertCircle size={15} className="text-red-400" /> Why We Lose
              </h2>
              <div className="space-y-2.5">
                {lostReasons.slice(0, 6).map(r => {
                  const total = lostReasons.reduce((s, x) => s + x.count, 0);
                  const pct   = Math.round((r.count / total) * 100);
                  return (
                    <div key={r.reason}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-700 truncate font-medium">{r.reason}</span>
                        <span className="text-slate-400 flex-shrink-0 ml-2">{r.count} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-red-300 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent activity */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                <Activity size={15} className="text-slate-400" /> Recent Activity
              </h2>
            </div>
            <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
              {recentActivity.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-400">No activity in the last 7 days.</p>
              ) : recentActivity.map(act => {
                const meta = ACTIVITY_META[act.type] ?? { icon: "📋", label: act.type };
                return (
                  <Link key={act.id} href={`/leads/${act.lead.id}`}
                    className="flex items-start gap-2.5 px-5 py-3 hover:bg-slate-50 transition">
                    <span className="text-base flex-shrink-0 mt-0.5">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">
                        {act.lead.firstName} {act.lead.lastName}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{act.content ?? meta.label}</p>
                    </div>
                    <span className="text-[10px] text-slate-300 flex-shrink-0">{timeAgo(act.createdAt)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
