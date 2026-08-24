"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Trophy, Building2, Briefcase, DollarSign,
  ChevronDown, Loader2, ExternalLink, Circle, AlertTriangle,
} from "lucide-react";
import { OUTCOME_STATUSES, outcomeStatusInfo } from "@/components/crm/constants";
import { useToast } from "@/lib/toast";

interface OutcomeLead {
  id: string;
  firstName: string; lastName: string; email: string;
  outcomeStatus:      string | null;
  outcomeCompany:     string | null;
  outcomeRole:        string | null;
  outcomeSalary:      number | null;
  outcomeStartDate:   string | null;
  outcomeNotes:       string | null;
  outcomeUpdatedAt:   string | null;
  outcomeEmailSentAt: string | null;
  enrolledUser: { cohort: string | null; createdAt: string } | null;
}

interface Stats {
  total: number; placed: number; stillSearching: number;
  notLooking: number; unlogged: number; avgSalary: number | null;
}

const STATUS_FILTERS = [
  { key: "",            label: "All students" },
  { key: "UNLOGGED",    label: "No outcome logged" },
  { key: "PLACED",      label: "Placed" },
  { key: "STILL_SEARCHING", label: "Still Searching" },
  { key: "NOT_LOOKING", label: "Not Looking" },
];

export default function OutcomesPage() {
  const { success, error: toastError } = useToast();
  const [leads,        setLeads]        = useState<OutcomeLead[]>([]);
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [cohorts,      setCohorts]      = useState<string[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [cohortFilter, setCohortFilter] = useState("");
  // Outcome email sends are intentionally disabled.
  // "ENROLLED" = completed enrollment pipeline, not graduated from the program.
  // Enable sends only after a cohort has graduated (certificateIssuedAt is set).

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (statusFilter) p.set("status", statusFilter);
    if (cohortFilter) p.set("cohort", cohortFilter);
    const res  = await fetch(`/api/crm/outcomes?${p}`);
    const data = await res.json();
    setLeads(data.leads ?? []);
    setStats(data.stats ?? null);
    setCohorts(data.cohorts ?? []);
    setLoading(false);
  }, [statusFilter, cohortFilter]);

  useEffect(() => { load(); }, [load]);

  const placementRate = stats && stats.total > 0
    ? Math.round((stats.placed / stats.total) * 100)
    : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-up">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "#14211f" }}>
            <Trophy size={20} style={{ color: "#086c64" }} /> Outcomes
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "#949598" }}>Track where enrolled students land after the program</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold"
          style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#92400e" }}>
          <AlertTriangle size={13} />
          Email sends disabled — enable after cohort graduates
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Total enrolled", value: stats.total,          color: "#14211f" },
            { label: "Placed",         value: stats.placed,         color: "#059669" },
            { label: "Still searching",value: stats.stillSearching, color: "#d97706" },
            { label: "Not logging",    value: stats.unlogged,       color: "#949598" },
            { label: "Placement rate", value: `${placementRate}%`,  color: "#086c64" },
          ].map(s => (
            <div key={s.label} className="card shadow-sm p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "#949598" }}>{s.label}</p>
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {stats?.avgSalary && (
        <div className="mb-6 card shadow-sm p-4 flex items-center gap-3">
          <DollarSign size={16} style={{ color: "#086c64" }} />
          <span className="text-sm font-semibold" style={{ color: "#14211f" }}>
            Avg reported salary: <span style={{ color: "#086c64" }}>${stats.avgSalary.toLocaleString()}</span>
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-1.5">
          {STATUS_FILTERS.map(f => (
            <button key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                statusFilter === f.key
                  ? "border-transparent text-white"
                  : "border-[#e4e0d6] hover:border-[#086c64]"
              }`}
              style={statusFilter === f.key ? { background: "#086c64", color: "white" } : { color: "#5a6663" }}>
              {f.label}
            </button>
          ))}
        </div>
        {cohorts.length > 0 && (
          <div className="relative">
            <select value={cohortFilter} onChange={e => setCohortFilter(e.target.value)}
              className="text-sm border border-[#e4e0d6] rounded-lg pl-3 pr-7 py-1.5 bg-white focus:outline-none appearance-none"
              style={{ color: "#14211f" }}>
              <option value="">All cohorts</option>
              {cohorts.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#949598" }} />
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin" style={{ color: "#086c64" }} />
        </div>
      ) : leads.length === 0 ? (
        <div className="card shadow-sm p-16 text-center">
          <Trophy size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm font-semibold" style={{ color: "#949598" }}>No enrolled students match this filter</p>
        </div>
      ) : (
        <div className="card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "#e4e0d6", background: "#f8f6f1" }}>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Student</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Status</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide hidden sm:table-cell" style={{ color: "#949598" }}>Company / Role</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide hidden md:table-cell" style={{ color: "#949598" }}>Salary</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide hidden md:table-cell" style={{ color: "#949598" }}>Cohort</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide hidden lg:table-cell" style={{ color: "#949598" }}>Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "#e4e0d6" }}>
              {leads.map(lead => {
                const info = outcomeStatusInfo(lead.outcomeStatus);
                const hasOutcome = lead.outcomeStatus && lead.outcomeStatus !== "PENDING";
                return (
                  <tr key={lead.id} className="hover:bg-[#f8f6f1] transition group">
                    {/* Student */}
                    <td className="px-4 py-3">
                      <p className="font-semibold" style={{ color: "#14211f" }}>
                        {lead.firstName} {lead.lastName}
                      </p>
                      <p className="text-xs" style={{ color: "#949598" }}>{lead.email}</p>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {hasOutcome ? (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${info.color}`}>{info.label}</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs" style={{ color: "#c9c4b8" }}>
                          <Circle size={8} /> Not logged
                        </span>
                      )}
                    </td>

                    {/* Company / Role */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {lead.outcomeCompany || lead.outcomeRole ? (
                        <div>
                          {lead.outcomeCompany && (
                            <div className="flex items-center gap-1.5">
                              <Building2 size={11} style={{ color: "#949598" }} />
                              <span className="font-medium" style={{ color: "#14211f" }}>{lead.outcomeCompany}</span>
                            </div>
                          )}
                          {lead.outcomeRole && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Briefcase size={11} style={{ color: "#949598" }} />
                              <span style={{ color: "#5a6663" }}>{lead.outcomeRole}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "#c9c4b8" }}>—</span>
                      )}
                    </td>

                    {/* Salary */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      {lead.outcomeSalary ? (
                        <span className="font-medium" style={{ color: "#086c64" }}>
                          ${lead.outcomeSalary.toLocaleString()}
                        </span>
                      ) : (
                        <span style={{ color: "#c9c4b8" }}>—</span>
                      )}
                    </td>

                    {/* Cohort */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      {lead.enrolledUser?.cohort ? (
                        <span className="text-xs font-medium" style={{ color: "#5a6663" }}>{lead.enrolledUser.cohort}</span>
                      ) : (
                        <span style={{ color: "#c9c4b8" }}>—</span>
                      )}
                    </td>

                    {/* Updated */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {lead.outcomeUpdatedAt ? (
                        <span className="text-xs" style={{ color: "#949598" }}>
                          {new Date(lead.outcomeUpdatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      ) : (
                        <span style={{ color: "#c9c4b8" }}>—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition">
                        <Link href={`/leads/${lead.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold"
                          style={{ color: "#086c64" }}>
                          <ExternalLink size={12} /> Open
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
