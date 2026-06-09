"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Search, Filter, ArrowUpDown, ExternalLink, Loader2, ChevronDown } from "lucide-react";
import { STAGES, SOURCES, stageInfo, sourceLabel } from "@/components/crm/constants";
import LeadForm from "@/components/crm/LeadForm";
import { useToast } from "@/lib/toast";

interface Lead {
  id: string; firstName: string; lastName: string; email: string;
  company: string | null; jobTitle: string | null; stage: string;
  source: string | null; priority: string; tags: string[];
  createdAt: string; updatedAt: string;
  enrolledUser: { id: string; name: string } | null;
  _count: { activities: number };
}

const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export default function LeadsPage() {
  const { success: _success } = useToast();
  const [leads,        setLeads]        = useState<Lead[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [stageFilter,  setStageFilter]  = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [sortBy,       setSortBy]       = useState<"updatedAt" | "createdAt" | "name" | "priority">("updatedAt");
  const [showForm,     setShowForm]     = useState(false);
  const [showFilters,  setShowFilters]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (stageFilter)  params.set("stage",  stageFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    if (search)       params.set("q",      search);
    const res  = await fetch(`/api/crm/leads?${params}`);
    const data = await res.json();
    if (Array.isArray(data)) setLeads(data);
    setLoading(false);
  }, [stageFilter, sourceFilter, search]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const sorted = [...leads].sort((a, b) => {
    if (sortBy === "name")      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    if (sortBy === "priority")  return (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);
    if (sortBy === "createdAt") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const priorityColor: Record<string, string> = {
    URGENT: "bg-red-200 text-red-800",
    HIGH:   "bg-red-100 text-red-700",
    NORMAL: "bg-blue-50 text-blue-600",
    LOW:    "bg-slate-100 text-slate-500",
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">All Leads</h1>
          <p className="text-sm text-slate-500 mt-0.5">{leads.length} lead{leads.length !== 1 ? "s" : ""} total</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/pipeline" className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
            Pipeline
          </Link>
          <Link href="/analytics" className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
            Analytics
          </Link>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition shadow-sm">
            <Plus size={15} /> Add Lead
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, company…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={() => setShowFilters(v => !v)}
          className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border transition ${
            showFilters || stageFilter || sourceFilter
              ? "bg-blue-50 text-blue-700 border-blue-200"
              : "text-slate-500 border-slate-200 hover:bg-slate-50"
          }`}>
          <Filter size={14} /> Filters
          {(stageFilter || sourceFilter) && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 ml-0.5" />}
        </button>
        <button
          onClick={() => setSortBy(prev => {
            const opts: typeof sortBy[] = ["updatedAt", "createdAt", "name", "priority"];
            const i = opts.indexOf(prev);
            return opts[(i + 1) % opts.length];
          })}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition">
          <ArrowUpDown size={13} />
          {sortBy === "updatedAt" ? "Last updated" : sortBy === "createdAt" ? "Date added" : sortBy === "name" ? "Name" : "Priority"}
          <ChevronDown size={12} />
        </button>
      </div>

      {showFilters && (
        <div className="flex gap-3 mb-5 flex-wrap p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Stage</label>
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All stages</option>
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Source</label>
            <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All sources</option>
              {SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          {(stageFilter || sourceFilter) && (
            <button onClick={() => { setStageFilter(""); setSourceFilter(""); }}
              className="self-end text-xs text-slate-400 hover:text-slate-600 transition px-2 py-1.5">
              Clear filters
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-16 text-center">
          <p className="text-slate-400 text-sm">No leads match your filters.</p>
          <button onClick={() => setShowForm(true)}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">
            Add your first lead
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Company</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Stage</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Source</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Priority</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden xl:table-cell">Updated</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(lead => {
                const stg = stageInfo(lead.stage);
                return (
                  <tr key={lead.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-[10px] font-bold">
                            {lead.firstName[0]}{lead.lastName[0]}
                          </span>
                        </div>
                        <div>
                          <Link href={`/leads/${lead.id}`}
                            className="font-semibold text-slate-900 hover:text-blue-600 transition">
                            {lead.firstName} {lead.lastName}
                          </Link>
                          <p className="text-xs text-slate-400 truncate max-w-[180px]">{lead.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 hidden md:table-cell">
                      {lead.company ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${stg.color}`}>
                        {stg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 hidden lg:table-cell text-xs">
                      {sourceLabel(lead.source ?? "")}
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${priorityColor[lead.priority] ?? priorityColor.NORMAL}`}>
                        {lead.priority}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-400 hidden xl:table-cell">
                      {new Date(lead.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link href={`/leads/${lead.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition">
                        Open <ExternalLink size={11} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <LeadForm
          onClose={() => setShowForm(false)}
          onSaved={(lead) => setLeads(prev => [lead as Lead, ...prev])}
        />
      )}
    </div>
  );
}
