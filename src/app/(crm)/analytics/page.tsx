"use client";
import { useEffect, useState, useCallback } from "react";
import {
  TrendingUp, TrendingDown, Users, UserCheck, UserX, Activity,
  DollarSign, Clock, Target, Loader2, RefreshCw, UserCircle2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  kpis: {
    total: number; enrolled: number; lost: number; active: number;
    winRate: number; pipelineValue: number; avgDeal: number; weightedPipeline: number;
  };
  mom: {
    newThisMonth: number; newLastMonth: number; newMoM: number | null;
    enrolledThisMonth: number; enrolledLastMonth: number; enrolledMoM: number | null;
  };
  funnel: { stage: string; count: number; value: number; probability: number; weightedValue: number }[];
  sources: { key: string; count: number; value: number }[];
  monthly: { month: string; label: string; leads: number; enrolled: number; revenue: number }[];
  timeInStage: { stage: string; avgDaysToNext: number; avgDaysCurrent: number; sampleSize: number }[];
  cohorts: {
    id: string; name: string; isActive: boolean; capacity: number | null;
    enrolled: number; fillPct: number | null; spotsLeft: number | null;
  }[];
  reps: {
    id: string; name: string; total: number; active: number; enrolled: number;
    lost: number; pipeline: number; revenue: number; winRate: number;
  }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt$$(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `$${(n / 1000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}

function MoMBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-slate-400">vs last month</span>;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${up ? "text-emerald-600" : "text-red-500"}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? "+" : ""}{pct}%
    </span>
  );
}

const STAGE_LABELS: Record<string, string> = {
  LEAD: "New Lead", CONTACTED: "Contacted", QUALIFIED: "Qualified",
  PROPOSAL: "Proposal", ENROLLED: "Enrolled",
};
const STAGE_COLORS: Record<string, string> = {
  LEAD: "bg-slate-400", CONTACTED: "bg-blue-500", QUALIFIED: "bg-violet-500",
  PROPOSAL: "bg-amber-500", ENROLLED: "bg-emerald-500",
};
const STAGE_LIGHT: Record<string, string> = {
  LEAD: "bg-slate-100 text-slate-600", CONTACTED: "bg-blue-50 text-blue-700",
  QUALIFIED: "bg-violet-50 text-violet-700", PROPOSAL: "bg-amber-50 text-amber-700",
  ENROLLED: "bg-emerald-50 text-emerald-700",
};

const SOURCE_LABELS: Record<string, string> = {
  REFERRAL: "Referral", LINKEDIN: "LinkedIn", WEBSITE: "Website",
  INSTAGRAM: "Instagram", COLD_OUTREACH: "Cold Outreach", EVENT: "Event",
  PAID_AD: "Paid Ad", OTHER: "Other", UNKNOWN: "Unknown",
};
const SOURCE_COLORS: Record<string, string> = {
  REFERRAL: "bg-blue-500", LINKEDIN: "bg-indigo-500", WEBSITE: "bg-cyan-500",
  INSTAGRAM: "bg-pink-500", COLD_OUTREACH: "bg-orange-500", EVENT: "bg-yellow-500",
  PAID_AD: "bg-purple-500", OTHER: "bg-slate-400", UNKNOWN: "bg-slate-300",
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [data,    setData]    = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<"pipeline" | "time" | "cohorts" | "reps">("pipeline");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/crm/analytics");
    if (res.ok) setData(await res.json() as AnalyticsData);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center h-full py-40">
      <Loader2 size={28} className="animate-spin text-slate-300" />
    </div>
  );

  if (!data) return (
    <div className="p-10 text-center text-slate-400">Failed to load analytics.</div>
  );

  const { kpis, mom, funnel, sources, monthly, timeInStage, cohorts, reps = [] } = data;
  const maxFunnel  = Math.max(...funnel.map(f => f.count), 1);
  const maxMonthly = Math.max(...monthly.map(m => Math.max(m.leads, m.enrolled)), 1);
  const totalSrc   = sources.reduce((a, b) => a + b.count, 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Pipeline performance & growth metrics</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 border border-slate-200 px-3 py-2 rounded-xl hover:bg-slate-50 transition">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Leads",    value: kpis.total,             sub: <MoMBadge pct={mom.newMoM} />,      icon: Users,       bg: "bg-slate-100",   ic: "text-slate-700" },
          { label: "Active",         value: kpis.active,            sub: <span className="text-xs text-slate-400">in pipeline</span>, icon: Activity,    bg: "bg-blue-50",    ic: "text-blue-700" },
          { label: "Enrolled",       value: kpis.enrolled,          sub: <MoMBadge pct={mom.enrolledMoM} />, icon: UserCheck,   bg: "bg-emerald-50", ic: "text-emerald-700" },
          { label: "Win Rate",       value: `${kpis.winRate}%`,     sub: <span className="text-xs text-slate-400">{kpis.lost} lost</span>, icon: Target, bg: "bg-violet-50",  ic: "text-violet-700" },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center`}>
                <kpi.icon size={18} className={kpi.ic} />
              </div>
              {kpi.sub}
            </div>
            <p className="text-2xl font-extrabold text-slate-900">{kpi.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Revenue KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign size={16} className="opacity-70" />
            <span className="text-xs font-bold uppercase tracking-wide opacity-70">Gross Pipeline</span>
          </div>
          <p className="text-3xl font-extrabold">{fmt$$(kpis.pipelineValue)}</p>
          <p className="text-xs opacity-60 mt-1">All non-lost deal values</p>
        </div>
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="opacity-70" />
            <span className="text-xs font-bold uppercase tracking-wide opacity-70">Weighted Forecast</span>
          </div>
          <p className="text-3xl font-extrabold">{fmt$$(kpis.weightedPipeline)}</p>
          <p className="text-xs opacity-60 mt-1">× close probability per stage</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="opacity-70" />
            <span className="text-xs font-bold uppercase tracking-wide opacity-70">Avg Deal (Enrolled)</span>
          </div>
          <p className="text-3xl font-extrabold">{fmt$$(kpis.avgDeal)}</p>
          <p className="text-xs opacity-60 mt-1">{kpis.enrolled} enrolled leads</p>
        </div>
      </div>

      {/* This month snapshot */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
        <h2 className="text-sm font-bold text-slate-900 mb-4">This Month</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "New leads",   value: mom.newThisMonth,      prev: mom.newLastMonth,      pct: mom.newMoM      },
            { label: "Enrolled",    value: mom.enrolledThisMonth, prev: mom.enrolledLastMonth, pct: mom.enrolledMoM },
          ].map(s => (
            <div key={s.label} className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-slate-500">{s.label}</p>
              <p className="text-2xl font-extrabold text-slate-900">{s.value}</p>
              <div className="flex items-center gap-1.5">
                <MoMBadge pct={s.pct} />
                <span className="text-xs text-slate-400">({s.prev} last mo)</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {([["pipeline", "Pipeline"], ["time", "Time in Stage"], ["cohorts", "Cohorts"], ["reps", "By Rep"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition ${
              tab === key ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Pipeline tab ────────────────────────────────────────────────────── */}
      {tab === "pipeline" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Funnel */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <h2 className="text-sm font-bold text-slate-900 mb-5">Conversion Funnel</h2>
            <div className="space-y-4">
              {funnel.map((stage, i) => {
                const pct       = (stage.count / maxFunnel) * 100;
                const convRate  = i < funnel.length - 1 && funnel[i].count > 0
                  ? Math.round((funnel[i + 1].count / funnel[i].count) * 100)
                  : null;
                return (
                  <div key={stage.stage}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${STAGE_COLORS[stage.stage] ?? "bg-slate-400"}`} />
                        <span className="text-sm font-semibold text-slate-700">{STAGE_LABELS[stage.stage] ?? stage.stage}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {stage.weightedValue > 0 && (
                          <span className="text-xs font-semibold text-violet-600">{fmt$$(stage.weightedValue)}</span>
                        )}
                        <span className="text-xs text-slate-400">{stage.probability}%</span>
                        <span className="text-sm font-bold text-slate-900">{stage.count}</span>
                        {convRate !== null && (
                          <span className="text-xs text-slate-400">→ {convRate}%</span>
                        )}
                      </div>
                    </div>
                    <div className="h-7 bg-slate-100 rounded-xl overflow-hidden">
                      <div
                        className={`h-full rounded-xl transition-all ${STAGE_COLORS[stage.stage] ?? "bg-slate-400"} opacity-80`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {data.kpis.lost > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <UserX size={14} className="text-red-400" /> Lost leads
                </span>
                <span className="font-bold text-slate-700">{data.kpis.lost}</span>
              </div>
            )}
          </div>

          {/* Sources */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <h2 className="text-sm font-bold text-slate-900 mb-5">Lead Sources</h2>
            {sources.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No data yet</p>
            ) : (
              <div className="space-y-3">
                {sources.map(src => {
                  const pct = totalSrc > 0 ? Math.round((src.count / totalSrc) * 100) : 0;
                  return (
                    <div key={src.key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-600">{SOURCE_LABELS[src.key] ?? src.key}</span>
                        <span className="text-xs font-bold text-slate-700">
                          {src.count} <span className="text-slate-400 font-normal">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${SOURCE_COLORS[src.key] ?? "bg-slate-400"}`}
                          style={{ width: `${Math.max(pct, 3)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Monthly volume chart */}
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-bold text-slate-900">Monthly Volume</h2>
              <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" /> New leads</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> Enrolled</span>
              </div>
            </div>
            <div className="flex items-end gap-4 h-36">
              {monthly.map(m => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="flex items-end gap-1 w-full" style={{ height: "96px" }}>
                    <div className="flex-1 flex flex-col justify-end">
                      <div title={`${m.leads} leads`}
                        className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-md transition-all"
                        style={{ height: `${Math.max((m.leads / maxMonthly) * 90, m.leads > 0 ? 4 : 0)}px` }} />
                    </div>
                    <div className="flex-1 flex flex-col justify-end">
                      <div title={`${m.enrolled} enrolled`}
                        className="w-full bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-md transition-all"
                        style={{ height: `${Math.max((m.enrolled / maxMonthly) * 90, m.enrolled > 0 ? 4 : 0)}px` }} />
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Time in stage tab ───────────────────────────────────────────────── */}
      {tab === "time" && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <h2 className="text-sm font-bold text-slate-900 mb-1">Average Days per Stage</h2>
            <p className="text-xs text-slate-400 mb-5">How long leads typically spend at each pipeline stage before moving forward.</p>
            <div className="space-y-5">
              {timeInStage.map(s => {
                const maxDays = Math.max(...timeInStage.map(x => x.avgDaysToNext), 1);
                const pct     = maxDays > 0 ? (s.avgDaysToNext / maxDays) * 100 : 0;
                return (
                  <div key={s.stage}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STAGE_LIGHT[s.stage] ?? "bg-slate-100 text-slate-600"}`}>
                          {STAGE_LABELS[s.stage] ?? s.stage}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          <span className="font-bold text-slate-700">{s.avgDaysToNext}d</span> avg to next stage
                          {s.sampleSize > 0 && <span className="text-slate-400">({s.sampleSize} leads)</span>}
                        </span>
                        {s.avgDaysCurrent > 0 && (
                          <span className="text-slate-400">{s.avgDaysCurrent}d currently here</span>
                        )}
                      </div>
                    </div>
                    <div className="h-4 bg-slate-100 rounded-xl overflow-hidden">
                      <div
                        className={`h-full rounded-xl ${STAGE_COLORS[s.stage] ?? "bg-slate-400"} opacity-70 transition-all`}
                        style={{ width: `${Math.max(pct, s.avgDaysToNext > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-5">
              Based on stage-change activity log events. Leads with no movement show 0 days-to-next.
            </p>
          </div>

          {/* Velocity insight */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {timeInStage.filter(s => s.sampleSize > 0).map(s => (
              <div key={s.stage} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${STAGE_LIGHT[s.stage]?.split(" ")[1] ?? "text-slate-500"}`}>
                  {STAGE_LABELS[s.stage]}
                </div>
                <p className="text-3xl font-extrabold text-slate-900">{s.avgDaysToNext}<span className="text-sm font-semibold text-slate-400 ml-1">days</span></p>
                <p className="text-xs text-slate-500 mt-1">avg before moving on</p>
              </div>
            ))}
            {timeInStage.every(s => s.sampleSize === 0) && (
              <div className="col-span-3 text-center text-slate-400 text-sm py-8">
                No stage-change history yet. Move leads through stages to see velocity data.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Cohorts tab ─────────────────────────────────────────────────────── */}
      {tab === "cohorts" && (
        <div className="space-y-4">
          {cohorts.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-16 text-center">
              <p className="text-slate-400 text-sm">No cohorts found.</p>
            </div>
          ) : (
            cohorts.map(c => (
              <div key={c.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900">{c.name}</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        c.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}>
                        {c.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {c.enrolled} enrolled{c.capacity ? ` · ${c.spotsLeft} spots remaining` : " · No capacity set"}
                    </p>
                  </div>
                  <div className="text-right">
                    {c.fillPct !== null ? (
                      <>
                        <p className="text-2xl font-extrabold text-slate-900">{c.fillPct}%</p>
                        <p className="text-xs text-slate-400">fill rate</p>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">No capacity set</span>
                    )}
                  </div>
                </div>

                {c.capacity && (
                  <div>
                    <div className="h-4 bg-slate-100 rounded-xl overflow-hidden">
                      <div
                        className={`h-full rounded-xl transition-all ${
                          (c.fillPct ?? 0) >= 90 ? "bg-red-500" :
                          (c.fillPct ?? 0) >= 70 ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${c.fillPct ?? 0}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1.5">
                      <span>0</span>
                      <span>{c.enrolled} / {c.capacity}</span>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
      {/* ── Reps tab ────────────────────────────────────────────────────────── */}
      {tab === "reps" && (
        <div className="space-y-4">
          {reps.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-16 text-center">
              <UserCircle2 size={28} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-400 text-sm">No leads are assigned yet.</p>
              <p className="text-slate-400 text-xs mt-1">Assign leads to reps from the lead form or detail page.</p>
            </div>
          ) : (
            <>
              {/* Summary table */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-slate-900">Rep Performance</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Pipeline value and conversion by team member</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Rep</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Total</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Active</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Enrolled</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Win Rate</th>
                      <th className="text-right px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Pipeline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reps.map((rep, i) => (
                      <tr key={rep.id} className={`border-b border-slate-50 ${i % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${
                              rep.id === "unassigned" ? "bg-slate-300" : "bg-gradient-to-br from-blue-500 to-indigo-600"
                            }`}>
                              {rep.name.slice(0, 2).toUpperCase()}
                            </div>
                            <span className={`font-semibold ${rep.id === "unassigned" ? "text-slate-400 italic" : "text-slate-900"}`}>
                              {rep.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-slate-700">{rep.total}</td>
                        <td className="px-4 py-3.5 text-right text-slate-600">{rep.active}</td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="inline-flex items-center justify-center px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full">
                            {rep.enrolled}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className={`text-xs font-bold ${rep.winRate >= 50 ? "text-emerald-600" : rep.winRate >= 25 ? "text-amber-600" : "text-slate-500"}`}>
                            {rep.winRate}%
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right font-semibold text-slate-700">{fmt$$(rep.pipeline)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bar chart: pipeline by rep */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <h2 className="text-sm font-bold text-slate-900 mb-4">Pipeline Value by Rep</h2>
                <div className="space-y-3">
                  {reps.filter(r => r.id !== "unassigned").map(rep => {
                    const maxPipeline = Math.max(...reps.filter(r => r.id !== "unassigned").map(r => r.pipeline), 1);
                    const pct = (rep.pipeline / maxPipeline) * 100;
                    return (
                      <div key={rep.id}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-700">{rep.name}</span>
                          <span className="text-xs font-bold text-slate-500">{fmt$$(rep.pipeline)}</span>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all"
                            style={{ width: `${Math.max(pct, rep.pipeline > 0 ? 2 : 0)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
