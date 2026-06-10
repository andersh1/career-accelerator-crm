"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus, Search, Filter, ArrowUpDown, ExternalLink, Loader2,
  ChevronDown, Upload, Trash2, Tag, MoveRight, CheckSquare, Square,
  BookmarkPlus, Bookmark, X, AlertTriangle, Sparkles,
} from "lucide-react";
import { STAGES, SOURCES, stageInfo, sourceLabel } from "@/components/crm/constants";
import LeadForm from "@/components/crm/LeadForm";
import CsvImportModal from "@/components/crm/CsvImportModal";
import { useToast } from "@/lib/toast";
import { scoreColor } from "@/lib/scoring";

interface Lead {
  id: string; firstName: string; lastName: string; email: string;
  company: string | null; jobTitle: string | null; stage: string;
  source: string | null; priority: string; tags: string[]; score: number;
  dealValue: number | null; createdAt: string; updatedAt: string;
  enrolledUser: { id: string; name: string } | null;
  _count: { activities: number };
}

interface SavedFilter { name: string; stage: string; source: string; priority: string; }

const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
const PRIORITIES = ["URGENT", "HIGH", "NORMAL", "LOW"];
const PRIORITY_COLOR: Record<string, string> = {
  URGENT: "bg-red-200 text-red-800",
  HIGH:   "bg-red-100 text-red-700",
  NORMAL: "bg-blue-50 text-blue-600",
  LOW:    "bg-slate-100 text-slate-500",
};

const LS_KEY = "crm_saved_filters_v1";
function loadSaved(): SavedFilter[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as SavedFilter[]; }
  catch { return []; }
}
function saveToDisk(filters: SavedFilter[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(filters));
}

function fmt$(n: number | null) {
  if (!n) return null;
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`;
}

export default function LeadsPage() {
  const { success, error: toastError } = useToast();
  const [leads,        setLeads]        = useState<Lead[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [stageFilter,  setStageFilter]  = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [sortBy,       setSortBy]       = useState<"updatedAt" | "createdAt" | "name" | "priority" | "score">("score");
  const [showForm,     setShowForm]     = useState(false);
  const [showFilters,  setShowFilters]  = useState(false);
  const [showImport,   setShowImport]   = useState(false);

  // Bulk actions
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [bulkAction,  setBulkAction]  = useState<"stage" | "priority" | "tag" | "delete" | "">("");
  const [bulkValue,   setBulkValue]   = useState("");
  const [tagInput,    setTagInput]    = useState("");
  const [bulkWorking, setBulkWorking] = useState(false);

  // Saved filters
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName,       setSaveName]       = useState("");

  // Duplicate alert
  const [dupCount, setDupCount] = useState(0);
  const [dupOpen,  setDupOpen]  = useState(false);
  const [dupGroups, setDupGroups] = useState<{
    reason: string;
    leads: { id: string; firstName: string; lastName: string; email: string; stage: string }[];
  }[]>([]);

  useEffect(() => {
    setSavedFilters(loadSaved());
    // Check for duplicates in background
    fetch("/api/crm/leads/duplicates")
      .then(r => r.json())
      .then((d: { count: number; groups: typeof dupGroups }) => { setDupCount(d.count); setDupGroups(d.groups); })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (stageFilter)    params.set("stage",    stageFilter);
    if (sourceFilter)   params.set("source",   sourceFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (search)         params.set("q",        search);
    const res  = await fetch(`/api/crm/leads?${params}`);
    const data = await res.json();
    if (Array.isArray(data)) setLeads(data);
    setLoading(false);
    setSelected(new Set());
  }, [stageFilter, sourceFilter, priorityFilter, search]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const sorted = [...leads].sort((a, b) => {
    if (sortBy === "score")     return (b.score ?? 0) - (a.score ?? 0);
    if (sortBy === "name")      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    if (sortBy === "priority")  return (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);
    if (sortBy === "createdAt") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  // ── Selection ───────────────────────────────────────────────────────────────
  const allSelected  = sorted.length > 0 && sorted.every(l => selected.has(l.id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(sorted.map(l => l.id)));
  }
  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function applyBulk() {
    if (!bulkAction || selected.size === 0) return;
    if (bulkAction === "delete" && !confirm(`Delete ${selected.size} lead${selected.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    if (bulkAction === "tag" && !tagInput.trim()) { toastError("Enter a tag name."); return; }
    setBulkWorking(true);
    const payload: Record<string, unknown> = { ids: Array.from(selected), action: bulkAction };
    if (bulkAction === "stage"    && bulkValue)       payload.value = bulkValue;
    if (bulkAction === "priority" && bulkValue)       payload.value = bulkValue;
    if (bulkAction === "tag"      && tagInput.trim()) payload.tag   = tagInput.trim();
    const res = await fetch("/api/crm/leads/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (res.ok) {
      success(`Updated ${selected.size} lead${selected.size !== 1 ? "s" : ""} ✓`);
      setBulkAction(""); setBulkValue(""); setTagInput("");
      await load();
    } else { toastError("Bulk action failed."); }
    setBulkWorking(false);
  }

  // ── Saved filters ───────────────────────────────────────────────────────────
  const hasActiveFilters = !!(stageFilter || sourceFilter || priorityFilter);

  function applySaved(sf: SavedFilter) {
    setStageFilter(sf.stage);
    setSourceFilter(sf.source);
    setPriorityFilter(sf.priority);
  }
  function deleteSaved(name: string) {
    const next = savedFilters.filter(f => f.name !== name);
    setSavedFilters(next); saveToDisk(next);
  }
  function saveCurrentFilter() {
    if (!saveName.trim()) return;
    const next = [...savedFilters.filter(f => f.name !== saveName.trim()), {
      name: saveName.trim(), stage: stageFilter, source: sourceFilter, priority: priorityFilter,
    }];
    setSavedFilters(next); saveToDisk(next);
    setSaveDialogOpen(false); setSaveName("");
    success("Filter saved ✓");
  }
  function clearFilters() { setStageFilter(""); setSourceFilter(""); setPriorityFilter(""); }

  const sortLabels: Record<string, string> = {
    score: "Score", updatedAt: "Last updated", createdAt: "Date added", name: "Name", priority: "Priority",
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Duplicate alert */}
      {dupCount > 0 && !dupOpen && (
        <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-2xl text-sm">
          <AlertTriangle size={16} className="text-amber-500 shrink-0" />
          <span className="font-semibold">{dupCount} possible duplicate{dupCount !== 1 ? "s" : ""} detected</span>
          <button onClick={() => setDupOpen(true)}
            className="ml-auto text-xs font-bold underline hover:text-amber-900 transition">
            Review →
          </button>
        </div>
      )}

      {/* Duplicate modal */}
      {dupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-500" /> Possible Duplicates
              </h2>
              <button onClick={() => setDupOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              {dupGroups.map((group, i) => (
                <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                    {group.reason}
                  </div>
                  {group.leads.map(lead => {
                    const stg = stageInfo(lead.stage);
                    return (
                      <div key={lead.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                          <span className="text-white text-[9px] font-bold">{lead.firstName[0]}{lead.lastName[0]}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{lead.firstName} {lead.lastName}</p>
                          <p className="text-xs text-slate-400 truncate">{lead.email}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stg.color}`}>{stg.label}</span>
                        <Link href={`/leads/${lead.id}`} onClick={() => setDupOpen(false)}
                          className="text-xs font-semibold text-blue-600 hover:underline shrink-0">
                          Open
                        </Link>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">All Leads</h1>
          <p className="text-sm text-slate-500 mt-0.5">{leads.length} lead{leads.length !== 1 ? "s" : ""} total</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/pipeline" className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
            Pipeline
          </Link>
          <Link href="/analytics" className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
            Analytics
          </Link>
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-600 border border-slate-200 px-3 py-2 rounded-xl hover:bg-slate-50 transition">
            <Upload size={14} /> Import CSV
          </button>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition shadow-sm">
            <Plus size={15} /> Add Lead
          </button>
        </div>
      </div>

      {/* Saved filter chips */}
      {savedFilters.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
            <Bookmark size={10} /> Views
          </span>
          {savedFilters.map(sf => (
            <div key={sf.name}
              className="flex items-center gap-1 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-full px-3 py-1 hover:border-blue-300 transition">
              <button onClick={() => applySaved(sf)} className="hover:text-blue-700">{sf.name}</button>
              <button onClick={() => deleteSaved(sf.name)} className="text-slate-300 hover:text-red-400 transition ml-1">
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

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
            showFilters || hasActiveFilters
              ? "bg-blue-50 text-blue-700 border-blue-200"
              : "text-slate-500 border-slate-200 hover:bg-slate-50"
          }`}>
          <Filter size={14} /> Filters
          {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 ml-0.5" />}
        </button>

        <button
          onClick={() => {
            const opts: Array<typeof sortBy> = ["score", "updatedAt", "createdAt", "name", "priority"];
            setSortBy(prev => opts[(opts.indexOf(prev) + 1) % opts.length]);
          }}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition">
          {sortBy === "score" ? <Sparkles size={13} className="text-amber-500" /> : <ArrowUpDown size={13} />}
          {sortLabels[sortBy]}
          <ChevronDown size={12} />
        </button>

        {/* Save current filter */}
        {hasActiveFilters && (
          <button onClick={() => setSaveDialogOpen(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition">
            <BookmarkPlus size={14} /> Save view
          </button>
        )}
      </div>

      {/* Save filter dialog */}
      {saveDialogOpen && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
          <input
            autoFocus
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && saveCurrentFilter()}
            placeholder="Name this view (e.g. Hot Leads)"
            className="flex-1 text-sm border border-blue-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={saveCurrentFilter}
            className="text-sm font-semibold bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition">
            Save
          </button>
          <button onClick={() => setSaveDialogOpen(false)}
            className="text-sm text-slate-400 hover:text-slate-600 transition">
            Cancel
          </button>
        </div>
      )}

      {/* Filter panel */}
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
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Priority</label>
            <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All priorities</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters}
              className="self-end text-xs text-slate-400 hover:text-slate-600 transition px-2 py-1.5">
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {someSelected && (
        <div className="mb-4 flex items-center gap-3 bg-blue-600 text-white px-5 py-3 rounded-2xl shadow-lg flex-wrap">
          <span className="text-sm font-bold shrink-0">{selected.size} selected</span>
          <div className="flex items-center gap-2 flex-wrap flex-1">
            <div className="flex items-center gap-1">
              <MoveRight size={14} className="shrink-0 opacity-70" />
              <select
                value={bulkAction === "stage" ? bulkValue : ""}
                onChange={e => { setBulkAction("stage"); setBulkValue(e.target.value); }}
                className="text-xs bg-white/20 border border-white/30 text-white rounded-lg px-2 py-1.5 focus:outline-none">
                <option value="" disabled>Move to stage…</option>
                {STAGES.map(s => <option key={s.key} value={s.key} className="text-slate-900">{s.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <CheckSquare size={14} className="shrink-0 opacity-70" />
              <select
                value={bulkAction === "priority" ? bulkValue : ""}
                onChange={e => { setBulkAction("priority"); setBulkValue(e.target.value); }}
                className="text-xs bg-white/20 border border-white/30 text-white rounded-lg px-2 py-1.5 focus:outline-none">
                <option value="" disabled>Set priority…</option>
                {PRIORITIES.map(p => <option key={p} value={p} className="text-slate-900">{p}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <Tag size={14} className="shrink-0 opacity-70" />
              <input
                placeholder="Add tag…"
                value={bulkAction === "tag" ? tagInput : ""}
                onChange={e => { setBulkAction("tag"); setTagInput(e.target.value); }}
                onKeyDown={e => e.key === "Enter" && applyBulk()}
                className="text-xs bg-white/20 border border-white/30 text-white placeholder-white/60 rounded-lg px-2 py-1.5 focus:outline-none w-28"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={applyBulk} disabled={bulkWorking || !bulkAction}
              className="text-xs font-bold bg-white text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition disabled:opacity-40">
              {bulkWorking ? "Working…" : "Apply"}
            </button>
            <button
              onClick={() => { setBulkAction("delete"); setTimeout(applyBulk, 0); }}
              className="text-xs font-bold bg-red-500 hover:bg-red-400 text-white px-3 py-1.5 rounded-lg transition flex items-center gap-1">
              <Trash2 size={12} /> Delete
            </button>
            <button onClick={() => setSelected(new Set())}
              className="text-xs text-white/70 hover:text-white px-2 py-1 transition">
              Clear
            </button>
          </div>
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
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="pl-5 pr-2 py-3">
                    <button onClick={toggleAll} className="text-slate-400 hover:text-blue-600 transition">
                      {allSelected ? <CheckSquare size={15} className="text-blue-600" /> : <Square size={15} />}
                    </button>
                  </th>
                  <th className="text-left px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Company</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Stage</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Source</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden xl:table-cell">Priority</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden xl:table-cell">Deal</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">
                    <span className="flex items-center gap-1"><Sparkles size={11} className="text-amber-400" />Score</span>
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(lead => {
                  const stg        = stageInfo(lead.stage);
                  const isSelected = selected.has(lead.id);
                  return (
                    <tr key={lead.id}
                      className={`border-b border-slate-50 transition-colors ${
                        isSelected ? "bg-blue-50/60" : "hover:bg-slate-50/60"
                      }`}>
                      <td className="pl-5 pr-2 py-3.5">
                        <button onClick={() => toggleOne(lead.id)}
                          className="text-slate-300 hover:text-blue-600 transition">
                          {isSelected ? <CheckSquare size={15} className="text-blue-600" /> : <Square size={15} />}
                        </button>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isSelected ? "bg-blue-600" : "bg-gradient-to-br from-blue-500 to-indigo-600"
                          }`}>
                            <span className="text-white text-[10px] font-bold">
                              {lead.firstName[0]}{lead.lastName[0]}
                            </span>
                          </div>
                          <div>
                            <Link href={`/leads/${lead.id}`}
                              className="font-semibold text-slate-900 hover:text-blue-600 transition block">
                              {lead.firstName} {lead.lastName}
                            </Link>
                            <p className="text-xs text-slate-400 truncate max-w-[160px]">{lead.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 hidden lg:table-cell text-sm">
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
                      <td className="px-5 py-3.5 hidden xl:table-cell">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_COLOR[lead.priority] ?? PRIORITY_COLOR.NORMAL}`}>
                          {lead.priority}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-slate-600 hidden xl:table-cell">
                        {fmt$(lead.dealValue) ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${scoreColor(lead.score ?? 0)}`}>
                          {lead.score ?? 0}
                        </span>
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

          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {sorted.map(lead => {
              const stg        = stageInfo(lead.stage);
              const isSelected = selected.has(lead.id);
              return (
                <div key={lead.id}
                  className={`bg-white border rounded-2xl shadow-sm p-4 flex items-center gap-3 transition ${
                    isSelected ? "border-blue-300 bg-blue-50/40" : "border-slate-200"
                  }`}>
                  <button onClick={() => toggleOne(lead.id)} className="text-slate-300 hover:text-blue-600 transition shrink-0">
                    {isSelected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                  </button>
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                    <span className="text-white text-[10px] font-bold">{lead.firstName[0]}{lead.lastName[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/leads/${lead.id}`}
                      className="font-semibold text-slate-900 hover:text-blue-600 transition block truncate text-sm">
                      {lead.firstName} {lead.lastName}
                    </Link>
                    <p className="text-xs text-slate-400 truncate">{lead.email}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stg.color}`}>{stg.label}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${scoreColor(lead.score ?? 0)}`}>
                        ⚡ {lead.score}
                      </span>
                    </div>
                  </div>
                  <Link href={`/leads/${lead.id}`} className="shrink-0 p-2 rounded-xl hover:bg-slate-100 transition">
                    <ExternalLink size={14} className="text-slate-400" />
                  </Link>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showForm && (
        <LeadForm
          onClose={() => setShowForm(false)}
          onSaved={(lead) => setLeads(prev => [lead as Lead, ...prev])}
        />
      )}
      {showImport && (
        <CsvImportModal onClose={() => setShowImport(false)} onImported={load} />
      )}
    </div>
  );
}
