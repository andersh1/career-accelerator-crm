import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, TrendingUp, Users, UserCheck, UserX, Activity } from "lucide-react";

const FUNNEL_STAGES = [
  { key: "LEAD",      label: "New Lead",  color: "bg-slate-400",   bar: "bg-slate-400"   },
  { key: "CONTACTED", label: "Contacted", color: "bg-blue-500",    bar: "bg-blue-500"    },
  { key: "QUALIFIED", label: "Qualified", color: "bg-violet-500",  bar: "bg-violet-500"  },
  { key: "PROPOSAL",  label: "Proposal",  color: "bg-amber-500",   bar: "bg-amber-500"   },
  { key: "ENROLLED",  label: "Enrolled",  color: "bg-green-500",   bar: "bg-green-500"   },
];

const SOURCE_COLORS: Record<string, string> = {
  REFERRAL:     "bg-blue-500",
  LINKEDIN:     "bg-indigo-500",
  WEBSITE:      "bg-cyan-500",
  INSTAGRAM:    "bg-pink-500",
  COLD_OUTREACH:"bg-orange-500",
  EVENT:        "bg-yellow-500",
  PAID_AD:      "bg-purple-500",
  OTHER:        "bg-slate-400",
  UNKNOWN:      "bg-slate-300",
};

const SOURCE_LABELS: Record<string, string> = {
  REFERRAL: "Referral", LINKEDIN: "LinkedIn", WEBSITE: "Website",
  INSTAGRAM: "Instagram", COLD_OUTREACH: "Cold Outreach", EVENT: "Event",
  PAID_AD: "Paid Ad", OTHER: "Other", UNKNOWN: "Unknown",
};

export const metadata = { title: "Analytics — Career Accelerator CRM" };

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") redirect("/login");

  const leads = await prisma.lead.findMany({
    select: { stage: true, source: true, priority: true, createdAt: true },
  });

  // Funnel
  const funnel = FUNNEL_STAGES.map(s => ({
    ...s,
    count: leads.filter(l => l.stage === s.key).length,
  }));
  const maxCount = Math.max(...funnel.map(s => s.count), 1);

  // Source breakdown
  const sourceMap: Record<string, number> = {};
  for (const l of leads) {
    const src = l.source ?? "UNKNOWN";
    sourceMap[src] = (sourceMap[src] ?? 0) + 1;
  }
  const sources = Object.entries(sourceMap)
    .map(([key, count]) => ({ key, count, label: SOURCE_LABELS[key] ?? key }))
    .sort((a, b) => b.count - a.count);
  const totalWithSource = sources.reduce((a, b) => a + b.count, 0);

  // Monthly (last 6 months)
  const monthMap: Record<string, number> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    monthMap[d.toISOString().slice(0, 7)] = 0;
  }
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  for (const l of leads.filter(l => l.createdAt >= sixMonthsAgo)) {
    const key = l.createdAt.toISOString().slice(0, 7);
    if (key in monthMap) monthMap[key]++;
  }
  const monthly = Object.entries(monthMap).map(([month, count]) => ({
    month, count,
    label: new Date(month + "-01").toLocaleDateString("en-US", { month: "short" }),
  }));
  const maxMonthly = Math.max(...monthly.map(m => m.count), 1);

  // KPIs
  const total    = leads.length;
  const enrolled = leads.filter(l => l.stage === "ENROLLED").length;
  const lost     = leads.filter(l => l.stage === "LOST").length;
  const active   = total - enrolled - lost;
  const winRate  = total > 0 ? Math.round((enrolled / total) * 100) : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/pipeline" className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 transition">
              <ArrowLeft size={14} /> Pipeline
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">CRM Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Conversion funnel and lead source breakdown.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/pipeline" className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
            Pipeline
          </Link>
          <Link href="/leads" className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
            All Leads
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Leads", value: total,       icon: Users,      color: "text-slate-700",  bg: "bg-slate-100"  },
          { label: "Active",      value: active,      icon: Activity,   color: "text-blue-700",   bg: "bg-blue-50"    },
          { label: "Enrolled",    value: enrolled,    icon: UserCheck,  color: "text-green-700",  bg: "bg-green-50"   },
          { label: "Win Rate",    value: `${winRate}%`, icon: TrendingUp, color: "text-violet-700", bg: "bg-violet-50" },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl ${kpi.bg} flex items-center justify-center flex-shrink-0`}>
              <kpi.icon size={18} className={kpi.color} />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-slate-900">{kpi.value}</p>
              <p className="text-xs text-slate-500">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Funnel */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <h2 className="text-sm font-bold text-slate-900 mb-5">Conversion Funnel</h2>
          <div className="space-y-3">
            {funnel.map((stage, i) => {
              const pct = (stage.count / maxCount) * 100;
              const convRate = i < funnel.length - 1 && funnel[i].count > 0
                ? Math.round((funnel[i + 1].count / funnel[i].count) * 100)
                : null;
              return (
                <div key={stage.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                      <span className="text-sm font-semibold text-slate-700">{stage.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-900">{stage.count}</span>
                      {convRate !== null && (
                        <span className="text-xs text-slate-400">→ {convRate}% convert</span>
                      )}
                    </div>
                  </div>
                  <div className="h-8 bg-slate-100 rounded-xl overflow-hidden">
                    <div
                      className={`h-full rounded-xl transition-all ${stage.bar} opacity-80`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {lost > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
              <span className="text-slate-500 flex items-center gap-1.5">
                <UserX size={14} className="text-red-400" /> Lost leads
              </span>
              <span className="font-bold text-slate-700">{lost}</span>
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
                const pct = totalWithSource > 0 ? Math.round((src.count / totalWithSource) * 100) : 0;
                const barColor = SOURCE_COLORS[src.key] ?? "bg-slate-400";
                return (
                  <div key={src.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-600">{src.label}</span>
                      <span className="text-xs font-bold text-slate-700">
                        {src.count} <span className="text-slate-400 font-normal">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(pct, 3)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Monthly volume */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h2 className="text-sm font-bold text-slate-900 mb-5">Monthly Lead Volume</h2>
        <div className="flex items-end gap-3 h-32">
          {monthly.map(m => (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5">
              <span className="text-xs font-bold text-slate-600">{m.count > 0 ? m.count : ""}</span>
              <div className="w-full bg-slate-100 rounded-lg overflow-hidden flex flex-col justify-end" style={{ height: "80px" }}>
                <div
                  className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-lg transition-all"
                  style={{ height: `${Math.max((m.count / maxMonthly) * 100, m.count > 0 ? 5 : 0)}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 font-medium">{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
