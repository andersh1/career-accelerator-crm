"use client";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  TrendingUp, TrendingDown, Users, UserCheck, UserX, Activity,
  DollarSign, Clock, Target, Loader2, RefreshCw, UserCircle2, Mail,
  Globe, ExternalLink, Monitor, Smartphone,
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
  nextgenBreakdown: { total: number; member: number; referral: number; untagged: number };
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
  lostReasons: { reason: string; count: number }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt$$(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `$${(n / 1000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}

function MoMBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs" style={{ color: "#949598" }}>vs last month</span>;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${up ? "text-emerald-600" : "text-red-500"}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? "+" : ""}{pct}%
    </span>
  );
}

const STAGE_LABELS: Record<string, string> = {
  LEAD: "New Lead", CONTACTED: "Contacted", STRATEGY_CALL: "Interviewed",
  OFFER_SENT: "Offer Sent", ENROLLED: "Enrolled",
};
const STAGE_COLORS: Record<string, string> = {
  LEAD: "bg-slate-400", CONTACTED: "bg-blue-500", STRATEGY_CALL: "bg-violet-500",
  OFFER_SENT: "bg-amber-500", ENROLLED: "bg-emerald-500",
};
const STAGE_LIGHT: Record<string, string> = {
  LEAD: "bg-slate-100 text-slate-600", CONTACTED: "bg-blue-50 text-blue-700",
  STRATEGY_CALL: "bg-violet-50 text-violet-700", OFFER_SENT: "bg-amber-50 text-amber-700",
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

interface TrafficTotal { pageviews: number; visitors: number }
interface TrafficDay   { timestamp: string; pageviews: number; visitors: number }
interface TrafficPage  { requestPath: string; pageviews: number; visitors: number }
interface TrafficRef   { referrerHostname: string; pageviews: number; visitors: number }
interface TrafficDevice { deviceType: string; pageviews: number; visitors: number }
interface TrafficData {
  total:     TrafficTotal;
  daily:     TrafficDay[];
  pages:     TrafficPage[];
  referrers: TrafficRef[];
  devices:   TrafficDevice[];
  since:     string;
  until:     string;
  error?:    string;
}

interface EmailStats {
  allTime: { sent: number; opened: number; rate: number };
  last30:  { sent: number; opened: number; rate: number };
  bySource: { source: string; sent: number; opened: number; rate: number }[];
  byMonth:  { month: string; label: string; sent: number; opened: number; rate: number }[];
  clicks?: {
    allTime: { total: number };
    last30:  { total: number };
  };
}

interface GrowthSummaryRow {
  source: string; label: string; leads: number; applied: number; enrolled: number;
  applyRate: number; enrollRate: number;
}
interface GrowthEvent {
  id: string; title: string; eventType: string; startsAt: string; location: string | null;
  registered: number; attended: number; applied: number; enrolled: number;
  attendRate: number; enrollRate: number;
}
interface GrowthReferral {
  code: string; referrerName: string | null; referrerEmail: string | null;
  leads: number; enrolled: number; enrollRate: number;
}
interface GrowthPromo {
  code: string; label: string | null; discountPct: number | null; active: boolean;
  leads: number; enrolled: number; enrollRate: number;
}
interface GrowthData {
  summary:    GrowthSummaryRow[];
  events:     GrowthEvent[];
  referrals:  GrowthReferral[];
  promoCodes: GrowthPromo[];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const searchParams = useSearchParams();
  const initialTab = (["pipeline","time","cohorts","reps","email","traffic","growth"].includes(searchParams.get("tab") ?? ""))
    ? searchParams.get("tab") as "pipeline" | "time" | "cohorts" | "reps" | "email" | "traffic" | "growth"
    : "pipeline";

  const [data,       setData]       = useState<AnalyticsData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<"pipeline" | "time" | "cohorts" | "reps" | "email" | "traffic" | "growth">(initialTab);
  const [emailStats, setEmailStats] = useState<EmailStats | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [traffic,       setTraffic]       = useState<TrafficData | null>(null);
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [growthData,    setGrowthData]    = useState<GrowthData | null>(null);
  const [growthLoading, setGrowthLoading] = useState(false);
  const [growthTab,     setGrowthTab]     = useState<"overview" | "events" | "referrals" | "promo">("overview");
  const [preset,        setPreset]        = useState<"all" | "30d" | "90d" | "6mo" | "1yr">("all");

  function presetToStartDate(p: string): string | null {
    const n = new Date();
    if (p === "30d")  return new Date(n.getTime() - 30 * 86400000).toISOString();
    if (p === "90d")  return new Date(n.getTime() - 90 * 86400000).toISOString();
    if (p === "6mo")  return new Date(n.getFullYear(), n.getMonth() - 6, n.getDate()).toISOString();
    if (p === "1yr")  return new Date(n.getFullYear() - 1, n.getMonth(), n.getDate()).toISOString();
    return null;
  }

  const load = useCallback(async () => {
    setLoading(true);
    const sd  = presetToStartDate(preset);
    const url = sd ? `/api/crm/analytics?startDate=${encodeURIComponent(sd)}` : "/api/crm/analytics";
    const res = await fetch(url);
    if (res.ok) setData(await res.json() as AnalyticsData);
    setLoading(false);
  }, [preset]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tab !== "email" || emailStats) return;
    setEmailLoading(true);
    fetch("/api/crm/email-open/stats")
      .then(r => r.json())
      .then((d: EmailStats) => setEmailStats(d))
      .catch(() => {})
      .finally(() => setEmailLoading(false));
  }, [tab, emailStats]);

  useEffect(() => {
    if (tab !== "traffic" || traffic) return;
    setTrafficLoading(true);
    const since = presetToStartDate(preset) ? presetToStartDate(preset)!.split("T")[0] : new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    fetch(`/api/crm/analytics/traffic?since=${since}`)
      .then(r => r.json())
      .then((d: TrafficData) => setTraffic(d))
      .catch(() => {})
      .finally(() => setTrafficLoading(false));
  }, [tab, traffic, preset]);

  useEffect(() => {
    if (tab !== "growth" || growthData) return;
    setGrowthLoading(true);
    fetch("/api/crm/analytics/growth")
      .then(r => r.json())
      .then((d: GrowthData) => setGrowthData(d))
      .catch(() => {})
      .finally(() => setGrowthLoading(false));
  }, [tab, growthData]);

  if (loading) return (
    <div className="flex items-center justify-center h-full py-40">
      <Loader2 size={28} className="animate-spin text-slate-300" />
    </div>
  );

  if (!data) return (
    <div className="p-10 text-center" style={{ color: "#949598" }}>Failed to load analytics.</div>
  );

  const { kpis, mom, funnel, sources, nextgenBreakdown, monthly, timeInStage, cohorts, reps = [], lostReasons = [] } = data;
  const maxFunnel  = Math.max(...funnel.map(f => f.count), 1);
  const maxMonthly = Math.max(...monthly.map(m => Math.max(m.leads, m.enrolled)), 1);
  const totalSrc   = sources.reduce((a, b) => a + b.count, 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-up">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#949598" }}>Vantage Career Accelerator</p>
          <h1 className="text-2xl font-display font-semibold" style={{ color: "#14211f" }}>Analytics</h1>
          <p className="text-sm mt-0.5" style={{ color: "#949598" }}>Pipeline performance & growth metrics</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Date range presets */}
          <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "#f1efe8" }}>
            {([["all", "All Time"], ["30d", "30 Days"], ["90d", "90 Days"], ["6mo", "6 Months"], ["1yr", "1 Year"]] as const).map(([key, label]) => (
              <button key={key}
                onClick={() => { setPreset(key); setEmailStats(null); }}
                className="px-3 py-1 text-xs font-semibold rounded-lg transition"
                style={{
                  background: preset === key ? "#086c64" : "transparent",
                  color: preset === key ? "#fff" : "#5a6663",
                }}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={load}
            className="flex items-center gap-1.5 text-sm font-medium border border-[#e4e0d6] px-3 py-2 rounded-xl hover:bg-[#f8f6f1] transition"
            style={{ color: "#5a6663" }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Leads",    value: kpis.total,             sub: <MoMBadge pct={mom.newMoM} />,      icon: Users       },
          { label: "Active",         value: kpis.active,            sub: <span className="text-xs" style={{ color: "#949598" }}>in pipeline</span>, icon: Activity    },
          { label: "Enrolled",       value: kpis.enrolled,          sub: <MoMBadge pct={mom.enrolledMoM} />, icon: UserCheck   },
          { label: "Win Rate",       value: `${kpis.winRate}%`,     sub: <span className="text-xs" style={{ color: "#949598" }}>{kpis.lost} lost</span>, icon: Target },
        ].map(kpi => (
          <div key={kpi.label} className="card shadow-sm p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#edf5f4" }}>
                <kpi.icon size={18} style={{ color: "#086c64" }} />
              </div>
              {kpi.sub}
            </div>
            <p className="text-2xl font-extrabold" style={{ color: "#14211f" }}>{kpi.value}</p>
            <p className="text-xs mt-0.5" style={{ color: "#949598" }}>{kpi.label}</p>
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
      <div className="card shadow-sm p-5">
        <h2 className="text-sm font-bold mb-4" style={{ color: "#14211f" }}>This Month</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "New leads",   value: mom.newThisMonth,      prev: mom.newLastMonth,      pct: mom.newMoM      },
            { label: "Enrolled",    value: mom.enrolledThisMonth, prev: mom.enrolledLastMonth, pct: mom.enrolledMoM },
          ].map(s => (
            <div key={s.label} className="flex flex-col gap-1">
              <p className="text-xs font-semibold" style={{ color: "#5a6663" }}>{s.label}</p>
              <p className="text-2xl font-extrabold" style={{ color: "#14211f" }}>{s.value}</p>
              <div className="flex items-center gap-1.5">
                <MoMBadge pct={s.pct} />
                <span className="text-xs" style={{ color: "#949598" }}>({s.prev} last mo)</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit flex-wrap" style={{ background: "#f1efe8" }}>
        {([["pipeline", "Pipeline"], ["time", "Time in Stage"], ["cohorts", "Cohorts"], ["reps", "By Rep"], ["email", "Email"], ["traffic", "🌐 Website Traffic"], ["growth", "📈 Growth"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition ${
              tab === key ? "bg-white shadow-sm" : "hover:bg-[#f8f6f1]"
            }`}
            style={{ color: tab === key ? "#14211f" : "#5a6663" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Pipeline tab ────────────────────────────────────────────────────── */}
      {tab === "pipeline" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Funnel */}
          <div className="lg:col-span-2 card shadow-sm p-6">
            <h2 className="text-sm font-bold mb-5" style={{ color: "#14211f" }}>Conversion Funnel</h2>
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
                        <span className="text-sm font-semibold" style={{ color: "#5a6663" }}>{STAGE_LABELS[stage.stage] ?? stage.stage}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {stage.weightedValue > 0 && (
                          <span className="text-xs font-semibold text-violet-600">{fmt$$(stage.weightedValue)}</span>
                        )}
                        <span className="text-xs" style={{ color: "#949598" }}>{stage.probability}%</span>
                        <span className="text-sm font-bold" style={{ color: "#14211f" }}>{stage.count}</span>
                        {convRate !== null && (
                          <span className="text-xs" style={{ color: "#949598" }}>→ {convRate}%</span>
                        )}
                      </div>
                    </div>
                    <div className="h-7 rounded-xl overflow-hidden" style={{ background: "#f1efe8" }}>
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
              <div className="mt-4 pt-4 border-t border-[#e4e0d6] flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5" style={{ color: "#5a6663" }}>
                  <UserX size={14} className="text-red-400" /> Lost leads
                </span>
                <span className="font-bold" style={{ color: "#5a6663" }}>{data.kpis.lost}</span>
              </div>
            )}
          </div>

          {/* Sources */}
          <div className="card shadow-sm p-6">
            <h2 className="text-sm font-bold mb-5" style={{ color: "#14211f" }}>Lead Sources</h2>
            {sources.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "#949598" }}>No data yet</p>
            ) : (
              <div className="space-y-3">
                {sources.map(src => {
                  const pct = totalSrc > 0 ? Math.round((src.count / totalSrc) * 100) : 0;
                  return (
                    <div key={src.key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold" style={{ color: "#5a6663" }}>{SOURCE_LABELS[src.key] ?? src.key}</span>
                        <span className="text-xs font-bold" style={{ color: "#5a6663" }}>
                          {src.count} <span className="font-normal" style={{ color: "#949598" }}>({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: "#f1efe8" }}>
                        <div className={`h-full rounded-full ${SOURCE_COLORS[src.key] ?? "bg-slate-400"}`}
                          style={{ width: `${Math.max(pct, 3)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {nextgenBreakdown && nextgenBreakdown.total > 0 && (
              <div className="mt-5 pt-4 border-t" style={{ borderColor: "#e4e0d6" }}>
                <p className="text-xs font-bold mb-3" style={{ color: "#949598" }}>3i NextGen — Member type</p>
                <div className="space-y-2">
                  {[
                    { label: "NextGen Member",       count: nextgenBreakdown.member,   color: "bg-teal-500" },
                    { label: "Unaffiliated",           count: nextgenBreakdown.referral, color: "bg-orange-400" },
                    { label: "Untagged",              count: nextgenBreakdown.untagged, color: "bg-slate-300" },
                  ].filter(r => r.count > 0).map(row => {
                    const pct = nextgenBreakdown.total > 0 ? Math.round((row.count / nextgenBreakdown.total) * 100) : 0;
                    return (
                      <div key={row.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold" style={{ color: "#5a6663" }}>{row.label}</span>
                          <span className="text-xs font-bold" style={{ color: "#5a6663" }}>
                            {row.count} <span className="font-normal" style={{ color: "#949598" }}>({pct}%)</span>
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#f1efe8" }}>
                          <div className={`h-full rounded-full ${row.color}`} style={{ width: `${Math.max(pct, 3)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Monthly volume chart */}
          <div className="lg:col-span-3 card shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-bold" style={{ color: "#14211f" }}>Monthly Volume</h2>
              <div className="flex items-center gap-4 text-xs font-semibold" style={{ color: "#5a6663" }}>
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
                  <span className="text-[10px] font-medium" style={{ color: "#949598" }}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Time in stage tab ───────────────────────────────────────────────── */}
      {tab === "time" && (
        <div className="space-y-5">
          <div className="card shadow-sm p-6">
            <h2 className="text-sm font-bold mb-1" style={{ color: "#14211f" }}>Average Days per Stage</h2>
            <p className="text-xs mb-5" style={{ color: "#949598" }}>How long leads typically spend at each pipeline stage before moving forward.</p>
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
                      <div className="flex items-center gap-4 text-xs" style={{ color: "#5a6663" }}>
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          <span className="font-bold" style={{ color: "#14211f" }}>{s.avgDaysToNext}d</span> avg to next stage
                          {s.sampleSize > 0 && <span style={{ color: "#949598" }}>({s.sampleSize} leads)</span>}
                        </span>
                        {s.avgDaysCurrent > 0 && (
                          <span style={{ color: "#949598" }}>{s.avgDaysCurrent}d currently here</span>
                        )}
                      </div>
                    </div>
                    <div className="h-4 rounded-xl overflow-hidden" style={{ background: "#f1efe8" }}>
                      <div
                        className={`h-full rounded-xl ${STAGE_COLORS[s.stage] ?? "bg-slate-400"} opacity-70 transition-all`}
                        style={{ width: `${Math.max(pct, s.avgDaysToNext > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] mt-5" style={{ color: "#949598" }}>
              Based on stage-change activity log events. Leads with no movement show 0 days-to-next.
            </p>
          </div>

          {/* Velocity insight */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {timeInStage.filter(s => s.sampleSize > 0).map(s => (
              <div key={s.stage} className="card shadow-sm p-5">
                <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${STAGE_LIGHT[s.stage]?.split(" ")[1] ?? "text-slate-500"}`}>
                  {STAGE_LABELS[s.stage]}
                </div>
                <p className="text-3xl font-extrabold" style={{ color: "#14211f" }}>{s.avgDaysToNext}<span className="text-sm font-semibold ml-1" style={{ color: "#949598" }}>days</span></p>
                <p className="text-xs mt-1" style={{ color: "#5a6663" }}>avg before moving on</p>
              </div>
            ))}
            {timeInStage.every(s => s.sampleSize === 0) && (
              <div className="col-span-3 text-center text-sm py-8" style={{ color: "#949598" }}>
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
            <div className="card shadow-sm p-16 text-center">
              <p className="text-sm" style={{ color: "#949598" }}>No cohorts found.</p>
            </div>
          ) : (
            cohorts.map(c => (
              <div key={c.id} className="card shadow-sm p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold" style={{ color: "#14211f" }}>{c.name}</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        c.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}>
                        {c.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "#5a6663" }}>
                      {c.enrolled} enrolled{c.capacity ? ` · ${c.spotsLeft} spots remaining` : " · No capacity set"}
                    </p>
                  </div>
                  <div className="text-right">
                    {c.fillPct !== null ? (
                      <>
                        <p className="text-2xl font-extrabold" style={{ color: "#14211f" }}>{c.fillPct}%</p>
                        <p className="text-xs" style={{ color: "#949598" }}>fill rate</p>
                      </>
                    ) : (
                      <span className="text-xs" style={{ color: "#949598" }}>No capacity set</span>
                    )}
                  </div>
                </div>

                {c.capacity && (
                  <div>
                    <div className="h-4 rounded-xl overflow-hidden" style={{ background: "#f1efe8" }}>
                      <div
                        className={`h-full rounded-xl transition-all ${
                          (c.fillPct ?? 0) >= 90 ? "bg-red-500" :
                          (c.fillPct ?? 0) >= 70 ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${c.fillPct ?? 0}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] mt-1.5" style={{ color: "#949598" }}>
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
            <div className="card shadow-sm p-16 text-center">
              <UserCircle2 size={28} className="mx-auto mb-3" style={{ color: "#c9c4b8" }} />
              <p className="text-sm" style={{ color: "#949598" }}>No leads are assigned yet.</p>
              <p className="text-xs mt-1" style={{ color: "#949598" }}>Assign leads to reps from the lead form or detail page.</p>
            </div>
          ) : (
            <>
              {/* Summary table */}
              <div className="card shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-[#e4e0d6]">
                  <h2 className="text-sm font-bold" style={{ color: "#14211f" }}>Rep Performance</h2>
                  <p className="text-xs mt-0.5" style={{ color: "#949598" }}>Pipeline value and conversion by team member</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#e4e0d6]" style={{ background: "#f8f6f1" }}>
                      <th className="text-left px-6 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Rep</th>
                      <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Total</th>
                      <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Active</th>
                      <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Enrolled</th>
                      <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Win Rate</th>
                      <th className="text-right px-6 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Pipeline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reps.map((rep, i) => (
                      <tr key={rep.id} className={`border-b border-[#e4e0d6]`} style={i % 2 !== 0 ? { background: "#faf9f6" } : {}}>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${
                              rep.id === "unassigned" ? "bg-slate-300" : "bg-gradient-to-br from-blue-500 to-indigo-600"
                            }`}>
                              {rep.name.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-semibold" style={{ color: rep.id === "unassigned" ? "#949598" : "#14211f", fontStyle: rep.id === "unassigned" ? "italic" : "normal" }}>
                              {rep.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold" style={{ color: "#5a6663" }}>{rep.total}</td>
                        <td className="px-4 py-3.5 text-right" style={{ color: "#5a6663" }}>{rep.active}</td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-50 text-emerald-700">
                            {rep.enrolled}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className={`text-xs font-bold ${rep.winRate >= 50 ? "text-emerald-600" : rep.winRate >= 25 ? "text-amber-600" : ""}`}
                            style={rep.winRate < 25 ? { color: "#949598" } : {}}>
                            {rep.winRate}%
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right font-semibold" style={{ color: "#5a6663" }}>{fmt$$(rep.pipeline)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bar chart: pipeline by rep */}
              <div className="card shadow-sm p-6">
                <h2 className="text-sm font-bold mb-4" style={{ color: "#14211f" }}>Pipeline Value by Rep</h2>
                <div className="space-y-3">
                  {reps.filter(r => r.id !== "unassigned").map(rep => {
                    const maxPipeline = Math.max(...reps.filter(r => r.id !== "unassigned").map(r => r.pipeline), 1);
                    const pct = (rep.pipeline / maxPipeline) * 100;
                    return (
                      <div key={rep.id}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold" style={{ color: "#5a6663" }}>{rep.name}</span>
                          <span className="text-xs font-bold" style={{ color: "#949598" }}>{fmt$$(rep.pipeline)}</span>
                        </div>
                        <div className="h-3 rounded-full overflow-hidden" style={{ background: "#f1efe8" }}>
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

      {/* ── Email tab ───────────────────────────────────────────── */}
      {tab === "email" && (
        <div className="space-y-5">
          {emailLoading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={28} className="animate-spin text-slate-300" />
            </div>
          )}
          {!emailLoading && emailStats && (
            <>
              {/* Click tracking notice */}
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                <Mail size={13} className="text-blue-500 shrink-0" />
                <p className="text-xs text-blue-700">
                  <span className="font-bold">Click tracking active</span> — links in emails now route through our tracker
                </p>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Sent (all time)",  value: emailStats.allTime.sent,       icon: Mail       },
                  { label: "Opened (all time)",       value: emailStats.allTime.opened,     icon: UserCheck  },
                  { label: "Open Rate (all time)",    value: `${emailStats.allTime.rate}%`, icon: Target     },
                  { label: "Open Rate (last 30d)",    value: `${emailStats.last30.rate}%`,  icon: TrendingUp },
                ].map(k => (
                  <div key={k.label} className="card shadow-sm p-5">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: "#edf5f4" }}>
                      <k.icon size={18} style={{ color: "#086c64" }} />
                    </div>
                    <p className="text-2xl font-extrabold" style={{ color: "#14211f" }}>{k.value}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#949598" }}>{k.label}</p>
                  </div>
                ))}
              </div>

              {/* Click KPIs */}
              {emailStats.clicks && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    {
                      label: "Clicks (all time)",
                      value: emailStats.clicks.allTime.total,
                      icon: TrendingUp,
                    },
                    {
                      label: "Clicks (last 30d)",
                      value: emailStats.clicks.last30.total,
                      icon: Activity,
                    },
                    {
                      label: "Click-to-Open Rate",
                      value: emailStats.allTime.opened > 0
                        ? `${Math.round((emailStats.clicks.allTime.total / emailStats.allTime.opened) * 100)}%`
                        : "—",
                      icon: Target,
                    },
                  ].map(k => (
                    <div key={k.label} className="card shadow-sm p-5">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: "#edf5f4" }}>
                        <k.icon size={18} style={{ color: "#086c64" }} />
                      </div>
                      <p className="text-2xl font-extrabold" style={{ color: "#14211f" }}>{k.value}</p>
                      <p className="text-xs mt-0.5" style={{ color: "#949598" }}>{k.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Last 30-day snapshot */}
              <div className="card shadow-sm p-5">
                <h2 className="text-sm font-bold mb-4" style={{ color: "#14211f" }}>Last 30 Days</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {[
                    { label: "Sent",        value: emailStats.last30.sent },
                    { label: "Opened",      value: emailStats.last30.opened },
                    { label: "Open Rate",   value: `${emailStats.last30.rate}%` },
                    {
                      label: "Clicks",
                      value: emailStats.clicks?.last30.total ?? "—",
                    },
                  ].map(s => (
                    <div key={s.label}>
                      <p className="text-xs font-semibold" style={{ color: "#5a6663" }}>{s.label}</p>
                      <p className="text-2xl font-extrabold mt-1" style={{ color: "#14211f" }}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Monthly trend */}
              {emailStats.byMonth.length > 0 && (
                <div className="card shadow-sm p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-sm font-bold" style={{ color: "#14211f" }}>6-Month Email Trend</h2>
                    <div className="flex items-center gap-4 text-xs font-semibold" style={{ color: "#5a6663" }}>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" /> Sent</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> Opened</span>
                    </div>
                  </div>
                  <div className="flex items-end gap-4 h-36">
                    {emailStats.byMonth.map(m => {
                      const maxVal = Math.max(...emailStats.byMonth.map(x => x.sent), 1);
                      return (
                        <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                          <div className="flex items-end gap-1 w-full" style={{ height: "96px" }}>
                            <div className="flex-1 flex flex-col justify-end">
                              <div title={`${m.sent} sent`}
                                className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-md transition-all"
                                style={{ height: `${Math.max((m.sent / maxVal) * 90, m.sent > 0 ? 4 : 0)}px` }} />
                            </div>
                            <div className="flex-1 flex flex-col justify-end">
                              <div title={`${m.opened} opened`}
                                className="w-full bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-md transition-all"
                                style={{ height: `${Math.max((m.opened / maxVal) * 90, m.opened > 0 ? 4 : 0)}px` }} />
                            </div>
                          </div>
                          <span className="text-[10px] font-medium" style={{ color: "#949598" }}>{m.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* By source */}
              {emailStats.bySource.length > 0 && (
                <div className="card shadow-sm p-6">
                  <h2 className="text-sm font-bold mb-4" style={{ color: "#14211f" }}>Open Rate by Source</h2>
                  <div className="space-y-3">
                    {emailStats.bySource.map(s => (
                      <div key={s.source}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold" style={{ color: "#5a6663" }}>{s.source || "Direct"}</span>
                          <span className="text-xs" style={{ color: "#5a6663" }}>
                            {s.opened}/{s.sent} opened · <span className="font-bold" style={{ color: "#14211f" }}>{s.rate}%</span>
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "#f1efe8" }}>
                          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all"
                            style={{ width: `${Math.max(s.rate, s.sent > 0 ? 2 : 0)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {emailStats.allTime.sent === 0 && (
                <div className="card shadow-sm p-16 text-center">
                  <Mail size={28} className="mx-auto mb-3" style={{ color: "#c9c4b8" }} />
                  <p className="text-sm" style={{ color: "#949598" }}>No emails logged yet.</p>
                  <p className="text-xs mt-1" style={{ color: "#949598" }}>Send emails via lead timelines or blast campaigns to track open rates.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Why We Lose ─────────────────────────────────────────── */}
      {tab === "pipeline" && lostReasons.length > 0 && (
        <div className="card shadow-sm p-6">
          <h2 className="text-sm font-bold mb-1" style={{ color: "#14211f" }}>Why We Lose</h2>
          <p className="text-xs mb-5" style={{ color: "#949598" }}>Breakdown of lost-reason tags across {kpis.lost} lost lead{kpis.lost !== 1 ? "s" : ""}</p>
          <div className="space-y-3">
            {lostReasons.map(r => {
              const pct = Math.round((r.count / kpis.lost) * 100);
              return (
                <div key={r.reason}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold truncate max-w-[60%]" style={{ color: "#5a6663" }}>{r.reason}</span>
                    <span className="text-xs" style={{ color: "#949598" }}>{r.count} lead{r.count !== 1 ? "s" : ""} · {pct}%</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "#f1efe8" }}>
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-red-400 to-rose-500 transition-all"
                      style={{ width: `${Math.max(pct, r.count > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* ── Website Traffic tab ─────────────────────────────────────────────── */}
      {tab === "traffic" && (
        <div className="space-y-5">
          {trafficLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={24} className="animate-spin" style={{ color: "#c9c4b8" }} />
            </div>
          ) : !traffic || traffic.error === "not_configured" ? (
            <div className="card shadow-sm p-10 text-center space-y-3">
              <Globe size={32} className="mx-auto" style={{ color: "#c9c4b8" }} />
              <p className="font-semibold" style={{ color: "#14211f" }}>Vercel API token not configured</p>
              <p className="text-sm max-w-md mx-auto" style={{ color: "#5a6663" }}>
                Add <code className="bg-[#f1efe8] px-1.5 py-0.5 rounded text-xs">VERCEL_API_TOKEN</code> to the CRM environment variables on Vercel, then redeploy.
                Generate a token at <strong>vercel.com → Account Settings → Tokens</strong>.
              </p>
            </div>
          ) : traffic.error === "not_enabled" ? (
            <div className="card shadow-sm p-10 text-center space-y-3">
              <Globe size={32} className="mx-auto" style={{ color: "#c9c4b8" }} />
              <p className="font-semibold" style={{ color: "#14211f" }}>Web Analytics not enabled yet</p>
              <p className="text-sm max-w-md mx-auto" style={{ color: "#5a6663" }}>
                Go to <strong>vercel.com → career-accelerator-lms → Analytics</strong> and enable Web Analytics.
                Data will start appearing within a few minutes of the first visit.
              </p>
            </div>
          ) : (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Total Page Views", value: (traffic.total?.pageviews ?? 0).toLocaleString(), icon: TrendingUp },
                  { label: "Unique Visitors",  value: (traffic.total?.visitors  ?? 0).toLocaleString(), icon: Users     },
                ].map(k => (
                  <div key={k.label} className="card shadow-sm p-5">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: "#edf5f4" }}>
                      <k.icon size={18} style={{ color: "#086c64" }} />
                    </div>
                    <p className="text-3xl font-extrabold" style={{ color: "#14211f" }}>{k.value}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#949598" }}>{k.label}</p>
                  </div>
                ))}
              </div>

              {/* Daily trend sparkline */}
              {traffic.daily && traffic.daily.length > 0 && (() => {
                const max = Math.max(...traffic.daily.map(d => d.pageviews), 1);
                return (
                  <div className="card shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-sm font-bold" style={{ color: "#14211f" }}>Daily Page Views</h2>
                      <span className="text-xs" style={{ color: "#949598" }}>{traffic.since} → {traffic.until}</span>
                    </div>
                    <div className="flex items-end gap-1 h-24">
                      {traffic.daily.map(d => {
                        const h = Math.max(4, Math.round((d.pageviews / max) * 96));
                        const date = new Date(d.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                        return (
                          <div key={d.timestamp} className="flex-1 flex flex-col items-center gap-1 group relative">
                            <div
                              className="w-full rounded-t-sm transition-all"
                              style={{ height: h, background: "#086c64", opacity: 0.8 }}
                              title={`${date}: ${d.pageviews} views, ${d.visitors} visitors`}
                            />
                            <div className="absolute bottom-full mb-1 hidden group-hover:block bg-[#14211f] text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none">
                              {date}: {d.pageviews} views · {d.visitors} visitors
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px]" style={{ color: "#949598" }}>
                        {new Date(traffic.daily[0].timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <span className="text-[10px]" style={{ color: "#949598" }}>
                        {new Date(traffic.daily[traffic.daily.length - 1].timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Top pages */}
                <div className="card shadow-sm p-6">
                  <h2 className="text-sm font-bold mb-4" style={{ color: "#14211f" }}>Top Pages</h2>
                  {(!traffic.pages || traffic.pages.length === 0) ? (
                    <p className="text-sm" style={{ color: "#949598" }}>No page data yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {traffic.pages.map(p => {
                        const max = traffic.pages[0]?.pageviews ?? 1;
                        const pct = Math.round((p.pageviews / max) * 100);
                        return (
                          <div key={p.requestPath}>
                            <div className="flex items-center justify-between mb-0.5 gap-2">
                              <span className="text-xs font-medium truncate" style={{ color: "#14211f", maxWidth: 220 }}>{p.requestPath}</span>
                              <span className="text-xs font-bold flex-shrink-0" style={{ color: "#086c64" }}>{p.pageviews.toLocaleString()}</span>
                            </div>
                            <div className="h-1.5 rounded-full" style={{ background: "#f1efe8" }}>
                              <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: "#086c64" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Top referrers */}
                <div className="card shadow-sm p-6">
                  <h2 className="text-sm font-bold mb-4" style={{ color: "#14211f" }}>Top Referrers</h2>
                  {(!traffic.referrers || traffic.referrers.length === 0) ? (
                    <p className="text-sm" style={{ color: "#949598" }}>No referrer data yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {traffic.referrers.map(r => {
                        const label = r.referrerHostname || "Direct / None";
                        const max   = traffic.referrers[0]?.pageviews ?? 1;
                        const pct   = Math.round((r.pageviews / max) * 100);
                        return (
                          <div key={r.referrerHostname ?? "direct"}>
                            <div className="flex items-center justify-between mb-0.5 gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <ExternalLink size={10} style={{ color: "#949598", flexShrink: 0 }} />
                                <span className="text-xs font-medium truncate" style={{ color: "#14211f" }}>{label}</span>
                              </div>
                              <span className="text-xs font-bold flex-shrink-0" style={{ color: "#086c64" }}>{r.pageviews.toLocaleString()}</span>
                            </div>
                            <div className="h-1.5 rounded-full" style={{ background: "#f1efe8" }}>
                              <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: "#084f4a" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Device breakdown */}
                {traffic.devices && traffic.devices.length > 0 && (
                  <div className="card shadow-sm p-6">
                    <h2 className="text-sm font-bold mb-4" style={{ color: "#14211f" }}>Devices</h2>
                    <div className="space-y-3">
                      {traffic.devices.map(d => {
                        const total = traffic.devices.reduce((a, b) => a + b.pageviews, 0);
                        const pct   = total > 0 ? Math.round((d.pageviews / total) * 100) : 0;
                        const icon  = d.deviceType?.toLowerCase().includes("mobile") ? Smartphone : Monitor;
                        const Icon  = icon;
                        return (
                          <div key={d.deviceType} className="flex items-center gap-3">
                            <Icon size={14} style={{ color: "#949598", flexShrink: 0 }} />
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-xs font-medium capitalize" style={{ color: "#14211f" }}>{d.deviceType ?? "Unknown"}</span>
                                <span className="text-xs" style={{ color: "#949598" }}>{pct}%</span>
                              </div>
                              <div className="h-1.5 rounded-full" style={{ background: "#f1efe8" }}>
                                <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: "#086c64" }} />
                              </div>
                            </div>
                            <span className="text-xs font-bold w-10 text-right" style={{ color: "#086c64" }}>{d.pageviews.toLocaleString()}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Growth tab ──────────────────────────────────────────────────────── */}
      {tab === "growth" && (
        <div className="space-y-5">
          {growthLoading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={24} className="animate-spin" style={{ color: "#c9c4b8" }} />
            </div>
          )}
          {!growthLoading && growthData && (
            <>
              {/* Sub-tabs */}
              <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "#f1efe8" }}>
                {([["overview", "Source Comparison"], ["events", "Events"], ["referrals", "Referrals"], ["promo", "Promo Codes"]] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setGrowthTab(key)}
                    className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition ${growthTab === key ? "bg-white shadow-sm" : "hover:bg-[#f8f6f1]"}`}
                    style={{ color: growthTab === key ? "#14211f" : "#5a6663" }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Overview: source comparison ── */}
              {growthTab === "overview" && (
                <div className="space-y-4">
                  <p className="text-xs" style={{ color: "#949598" }}>
                    Compare how each acquisition channel converts leads into enrolled students.
                  </p>

                  {/* Channel cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {growthData.summary.map(row => {
                      const colors: Record<string, { bg: string; text: string; bar: string }> = {
                        EVENT:    { bg: "#fffbeb", text: "#92400e", bar: "#f59e0b" },
                        REFERRAL: { bg: "#eff6ff", text: "#1e40af", bar: "#3b82f6" },
                        PROMO:    { bg: "#f5f3ff", text: "#5b21b6", bar: "#7c3aed" },
                        DIRECT:   { bg: "#f0fdf4", text: "#14532d", bar: "#22c55e" },
                      };
                      const c = colors[row.source] ?? colors.DIRECT;
                      return (
                        <div key={row.source} className="rounded-2xl border p-5 space-y-3" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                              style={{ background: c.bg, color: c.text }}>{row.label}</span>
                          </div>
                          <div>
                            <p className="text-3xl font-extrabold" style={{ color: "#14211f" }}>{row.leads}</p>
                            <p className="text-xs" style={{ color: "#949598" }}>total leads</p>
                          </div>
                          <div className="space-y-2">
                            <div>
                              <div className="flex justify-between text-[11px] mb-0.5">
                                <span style={{ color: "#5a6663" }}>Applied</span>
                                <span className="font-bold" style={{ color: "#14211f" }}>{row.applied} ({row.applyRate}%)</span>
                              </div>
                              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#f1efe8" }}>
                                <div className="h-full rounded-full transition-all" style={{ width: `${row.applyRate}%`, background: c.bar, opacity: 0.5 }} />
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between text-[11px] mb-0.5">
                                <span style={{ color: "#5a6663" }}>Enrolled</span>
                                <span className="font-bold" style={{ color: "#14211f" }}>{row.enrolled} ({row.enrollRate}%)</span>
                              </div>
                              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#f1efe8" }}>
                                <div className="h-full rounded-full transition-all" style={{ width: `${row.enrollRate}%`, background: c.bar }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Comparison table */}
                  <div className="card shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b" style={{ borderColor: "#f0ede7" }}>
                      <h2 className="text-sm font-bold" style={{ color: "#14211f" }}>Channel Comparison</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: "#f8f6f1" }}>
                            {["Channel", "Leads", "Applied", "Apply Rate", "Enrolled", "Enroll Rate"].map(h => (
                              <th key={h} className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wide" style={{ color: "#949598" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {growthData.summary.sort((a, b) => b.enrolled - a.enrolled).map((row, i) => {
                            const badgeColors: Record<string, string> = {
                              EVENT: "bg-amber-50 text-amber-700", REFERRAL: "bg-blue-50 text-blue-700",
                              PROMO: "bg-violet-50 text-violet-700", DIRECT: "bg-emerald-50 text-emerald-700",
                            };
                            return (
                              <tr key={row.source} style={{ borderTop: i > 0 ? "1px solid #f0ede7" : "none" }}>
                                <td className="px-5 py-3">
                                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badgeColors[row.source] ?? ""}`}>{row.label}</span>
                                </td>
                                <td className="px-5 py-3 font-semibold" style={{ color: "#14211f" }}>{row.leads}</td>
                                <td className="px-5 py-3" style={{ color: "#5a6663" }}>{row.applied}</td>
                                <td className="px-5 py-3">
                                  <span className="font-bold" style={{ color: row.applyRate > 30 ? "#086c64" : "#5a6663" }}>{row.applyRate}%</span>
                                </td>
                                <td className="px-5 py-3 font-bold" style={{ color: "#14211f" }}>{row.enrolled}</td>
                                <td className="px-5 py-3">
                                  <span className="font-bold text-sm" style={{ color: row.enrollRate > 20 ? "#086c64" : row.enrollRate > 10 ? "#92400e" : "#5a6663" }}>
                                    {row.enrollRate}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Events breakdown ── */}
              {growthTab === "events" && (
                <div className="space-y-4">
                  {growthData.events.length === 0 ? (
                    <div className="card shadow-sm p-12 text-center" style={{ color: "#949598" }}>
                      <p>No events yet. Create your first event to track its pipeline performance.</p>
                    </div>
                  ) : (
                    <div className="card shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b" style={{ borderColor: "#f0ede7" }}>
                        <h2 className="text-sm font-bold" style={{ color: "#14211f" }}>Events Pipeline</h2>
                        <p className="text-xs mt-0.5" style={{ color: "#949598" }}>Which events are turning registrants into enrolled students?</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr style={{ background: "#f8f6f1" }}>
                              {["Event", "Type", "Registered", "Attended", "Attend %", "Applied", "Enrolled", "Enroll %"].map(h => (
                                <th key={h} className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: "#949598" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {growthData.events.map((ev, i) => (
                              <tr key={ev.id} style={{ borderTop: i > 0 ? "1px solid #f0ede7" : "none" }}>
                                <td className="px-4 py-3">
                                  <p className="font-semibold text-xs leading-snug max-w-[180px]" style={{ color: "#14211f" }}>{ev.title}</p>
                                  <p className="text-[10px] mt-0.5" style={{ color: "#949598" }}>
                                    {new Date(ev.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                  </p>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ev.eventType === "ZOOM" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                                    {ev.eventType === "ZOOM" ? "Zoom" : "In Person"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-semibold" style={{ color: "#14211f" }}>{ev.registered}</td>
                                <td className="px-4 py-3" style={{ color: "#5a6663" }}>{ev.attended}</td>
                                <td className="px-4 py-3">
                                  <span style={{ color: ev.attendRate > 60 ? "#086c64" : "#5a6663" }}>{ev.attendRate}%</span>
                                </td>
                                <td className="px-4 py-3" style={{ color: "#5a6663" }}>{ev.applied}</td>
                                <td className="px-4 py-3 font-bold" style={{ color: "#14211f" }}>{ev.enrolled}</td>
                                <td className="px-4 py-3">
                                  <span className="font-bold" style={{ color: ev.enrollRate > 15 ? "#086c64" : ev.enrollRate > 5 ? "#92400e" : "#5a6663" }}>
                                    {ev.enrollRate}%
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Referrals breakdown ── */}
              {growthTab === "referrals" && (
                <div className="space-y-4">
                  {growthData.referrals.length === 0 ? (
                    <div className="card shadow-sm p-12 text-center" style={{ color: "#949598" }}>
                      <p>No referral leads tracked yet. Leads tagged with source "Referral" appear here.</p>
                    </div>
                  ) : (
                    <div className="card shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b" style={{ borderColor: "#f0ede7" }}>
                        <h2 className="text-sm font-bold" style={{ color: "#14211f" }}>Referral Leaderboard</h2>
                        <p className="text-xs mt-0.5" style={{ color: "#949598" }}>Students and contacts ranked by enrolled referrals</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr style={{ background: "#f8f6f1" }}>
                              {["#", "Referrer", "Code", "Leads", "Enrolled", "Conversion"].map(h => (
                                <th key={h} className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wide" style={{ color: "#949598" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {growthData.referrals.map((ref, i) => (
                              <tr key={ref.code} style={{ borderTop: i > 0 ? "1px solid #f0ede7" : "none" }}>
                                <td className="px-4 py-3 text-xs font-bold" style={{ color: "#949598" }}>#{i + 1}</td>
                                <td className="px-4 py-3">
                                  <p className="font-semibold text-xs" style={{ color: "#14211f" }}>{ref.referrerName ?? "—"}</p>
                                  {ref.referrerEmail && <p className="text-[10px]" style={{ color: "#949598" }}>{ref.referrerEmail}</p>}
                                </td>
                                <td className="px-4 py-3">
                                  <code className="text-[11px] px-2 py-0.5 rounded" style={{ background: "#f1efe8", color: "#5a6663" }}>{ref.code}</code>
                                </td>
                                <td className="px-4 py-3 font-semibold" style={{ color: "#14211f" }}>{ref.leads}</td>
                                <td className="px-4 py-3 font-bold" style={{ color: "#086c64" }}>{ref.enrolled}</td>
                                <td className="px-4 py-3">
                                  <span className="font-bold" style={{ color: ref.enrollRate > 30 ? "#086c64" : "#5a6663" }}>{ref.enrollRate}%</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Promo codes breakdown ── */}
              {growthTab === "promo" && (
                <div className="space-y-4">
                  {growthData.promoCodes.length === 0 ? (
                    <div className="card shadow-sm p-12 text-center" style={{ color: "#949598" }}>
                      <p>No promo codes yet. Create codes in Promo Codes to track their conversion performance.</p>
                    </div>
                  ) : (
                    <div className="card shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b" style={{ borderColor: "#f0ede7" }}>
                        <h2 className="text-sm font-bold" style={{ color: "#14211f" }}>Promo Code Performance</h2>
                        <p className="text-xs mt-0.5" style={{ color: "#949598" }}>Which codes are driving real enrollment?</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr style={{ background: "#f8f6f1" }}>
                              {["Code", "Label", "Discount", "Status", "Used", "Enrolled", "Conversion"].map(h => (
                                <th key={h} className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wide" style={{ color: "#949598" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {growthData.promoCodes.map((p, i) => (
                              <tr key={p.code} style={{ borderTop: i > 0 ? "1px solid #f0ede7" : "none" }}>
                                <td className="px-4 py-3">
                                  <code className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: "#f1efe8", color: "#086c64" }}>{p.code}</code>
                                </td>
                                <td className="px-4 py-3 text-xs" style={{ color: "#5a6663" }}>{p.label ?? "—"}</td>
                                <td className="px-4 py-3 text-xs font-semibold" style={{ color: "#14211f" }}>
                                  {p.discountPct != null ? `${p.discountPct}% off` : "Access code"}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                                    {p.active ? "Active" : "Inactive"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-semibold" style={{ color: "#14211f" }}>{p.leads}</td>
                                <td className="px-4 py-3 font-bold" style={{ color: "#086c64" }}>{p.enrolled}</td>
                                <td className="px-4 py-3">
                                  <span className="font-bold" style={{ color: p.enrollRate > 30 ? "#086c64" : "#5a6663" }}>{p.enrollRate}%</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

    </div>
  );
}
