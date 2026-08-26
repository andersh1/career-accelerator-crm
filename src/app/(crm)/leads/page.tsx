"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus, Search, Filter, ArrowUpDown, ExternalLink, Loader2,
  ChevronDown, Upload, Download, Trash2, Tag, MoveRight, CheckSquare, Square,
  BookmarkPlus, Bookmark, X, AlertTriangle, Sparkles, Merge,
} from "lucide-react";
import { STAGES, SOURCES, NEXTGEN_SUB_SOURCES, stageInfo, sourceLabel } from "@/components/crm/constants";
import LeadForm from "@/components/crm/LeadForm";
import CsvImportModal from "@/components/crm/CsvImportModal";
import { useToast } from "@/lib/toast";
import { scoreColor } from "@/lib/scoring";

interface Lead {
  id: string; firstName: string; lastName: string; email: string;
  company: string | null; jobTitle: string | null; stage: string;
  source: string | null; priority: string; tags: string[]; score: number;
  dealValue: number | null; createdAt: string; updatedAt: string;
  assignedTo: string | null;
  enrolledUser: { id: string; name: string } | null;
  _count: { activities: number };
}

interface SavedFilter { name: string; stage: string; source: string; subSource?: string; priority: string; assignedTo?: string; }
interface AdminUser { id: string; name: string | null; email: string; }

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

function timeSince(iso: string): { text: string; cls: string } {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return { text: "Today",     cls: "text-emerald-600" };
  if (days === 1) return { text: "Yesterday", cls: "text-blue-600" };
  if (days < 7)  return { text: `${days}d ago`, cls: "text-slate-500" };
  if (days < 30) return { text: `${Math.floor(days / 7)}w ago`, cls: "text-slate-400" };
  return { text: `${Math.floor(days / 30)}mo ago`, cls: "text-red-400" };
}

export default function LeadsPage() {
  const { success, error: toastError } = useToast();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [leads,        setLeads]        = useState<Lead[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState(searchParams.get("q") ?? "");
  const [stageFilter,      setStageFilter]      = useState(searchParams.get("stage") ?? "");
  const [sourceFilter,     setSourceFilter]     = useState(searchParams.get("source") ?? "");
  const [subSourceFilter,  setSubSourceFilter]  = useState(searchParams.get("subSource") ?? "");
  const [priorityFilter,   setPriorityFilter]   = useState(searchParams.get("priority") ?? "");
  const [assignedToFilter, setAssignedToFilter] = useState(searchParams.get("assignedTo") ?? "");
  const [adminUsers,       setAdminUsers]       = useState<AdminUser[]>([]);
  const usersLoaded = useRef(false);
  const [sortBy,       setSortBy]       = useState<"updatedAt" | "createdAt" | "name" | "priority" | "score">("score");
  const [sortDir,      setSortDir]      = useState<"desc" | "asc">("desc");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [quickFilter,  setQuickFilter]  = useState<"" | "hot" | "stale" | "unassigned">("");
  const [showForm,        setShowForm]        = useState(false);
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

  // Merge
  const [mergeKeepId,   setMergeKeepId]   = useState<string | null>(null);
  const [mergeMergeId,  setMergeMergeId]  = useState<string | null>(null);
  const [merging,       setMerging]       = useState(false);

  // Quick inline stage change
  const [stagingLeadId, setStagingLeadId] = useState<string | null>(null);
  // Mobile stage bottom-sheet
  const [mobileStageLeadId, setMobileStageLeadId] = useState<string | null>(null);
  // Mobile header overflow menu
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function quickStageChange(leadId: string, newStage: string) {
    setStagingLeadId(null);
    setMobileStageLeadId(null);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: newStage } : l));
    await fetch(`/api/crm/leads/${leadId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    });
  }

  // Recycle Bin
  const [binOpen,    setBinOpen]    = useState(false);
  const [binLeads,   setBinLeads]   = useState<{ id: string; firstName: string; lastName: string; email: string; company: string | null; stage: string; deletedAt: string }[]>([]);
  const [binLoading, setBinLoading] = useState(false);

  async function loadBin() {
    setBinLoading(true);
    try {
      const res = await fetch("/api/crm/leads/deleted");
      if (res.ok) setBinLeads(await res.json());
    } finally { setBinLoading(false); }
  }

  async function binAction(id: string, action: "restore" | "purge") {
    await fetch("/api/crm/leads/deleted", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    await loadBin();
    if (action === "restore") await load();
  }

  useEffect(() => {
    setSavedFilters(loadSaved());
    if (!usersLoaded.current) {
      usersLoaded.current = true;
      fetch("/api/crm/users").then(r => r.json()).then((d) => {
        if (Array.isArray(d)) setAdminUsers(d);
      }).catch(() => {});
    }
    fetch("/api/crm/leads/duplicates")
      .then(r => r.json())
      .then((d: { count: number; groups: typeof dupGroups }) => { setDupCount(d.count); setDupGroups(d.groups); })
      .catch(() => {});
  }, []);

  // Sync filters to URL so views are bookmarkable / shareable
  useEffect(() => {
    const p = new URLSearchParams();
    if (search)           p.set("q",          search);
    if (stageFilter)      p.set("stage",      stageFilter);
    if (sourceFilter)     p.set("source",     sourceFilter);
    if (subSourceFilter)  p.set("subSource",  subSourceFilter);
    if (priorityFilter)   p.set("priority",   priorityFilter);
    if (assignedToFilter) p.set("assignedTo", assignedToFilter);
    const qs = p.toString();
    router.replace(qs ? `/leads?${qs}` : "/leads", { scroll: false });
  }, [search, stageFilter, sourceFilter, subSourceFilter, priorityFilter, assignedToFilter, router]);

  // Keyboard shortcut: press N to open Add Lead form
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "n" && e.key !== "N") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      e.preventDefault();
      setShowForm(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function mergeLeads() {
    if (!mergeKeepId || !mergeMergeId) return;
    setMerging(true);
    const res = await fetch("/api/crm/leads/merge", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepId: mergeKeepId, mergeId: mergeMergeId }),
    });
    if (res.ok) {
      success("Leads merged ✓");
      setMergeKeepId(null); setMergeMergeId(null);
      setDupOpen(false);
      fetch("/api/crm/leads/duplicates")
        .then(r => r.json())
        .then((d: { count: number; groups: typeof dupGroups }) => { setDupCount(d.count); setDupGroups(d.groups); })
        .catch(() => {});
      await load();
    } else {
      toastError("Merge failed.");
    }
    setMerging(false);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (stageFilter)      params.set("stage",      stageFilter);
    if (sourceFilter)     params.set("source",     sourceFilter);
    if (subSourceFilter)  params.set("subSource",  subSourceFilter);
    if (priorityFilter)   params.set("priority",   priorityFilter);
    if (assignedToFilter) params.set("assignedTo", assignedToFilter);
    if (search)           params.set("q",          search);
    params.set("all", "true");
    const res  = await fetch(`/api/crm/leads?${params}`);
    const data = await res.json();
    setLeads(Array.isArray(data) ? data : (data.leads ?? []));
    setLoading(false);
    setSelected(new Set());
  }, [stageFilter, sourceFilter, subSourceFilter, priorityFilter, assignedToFilter, search]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  // Background refresh — pause when tab is hidden so we don't burn requests
  useEffect(() => {
    const INTERVAL = 30_000;
    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (!timer) timer = setInterval(load, INTERVAL);
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }
    function onVisibility() {
      document.hidden ? stop() : start();
    }

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  const STALE_MS = 14 * 24 * 60 * 60 * 1000;
  const quickFiltered = leads.filter(l => {
    if (quickFilter === "hot")        return (l.score ?? 0) >= 70;
    if (quickFilter === "stale")      return Date.now() - new Date(l.updatedAt).getTime() > STALE_MS;
    if (quickFilter === "unassigned") return !l.assignedTo;
    return true;
  });

  const sorted = [...quickFiltered].sort((a, b) => {
    let cmp: number;
    if      (sortBy === "score")     cmp = (b.score ?? 0) - (a.score ?? 0);
    else if (sortBy === "name")      cmp = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    else if (sortBy === "priority")  cmp = (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);
    else if (sortBy === "createdAt") cmp = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    else                             cmp = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    return sortDir === "asc" ? -cmp : cmp;
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
  const hasActiveFilters = !!(stageFilter || sourceFilter || subSourceFilter || priorityFilter || assignedToFilter);

  function applySaved(sf: SavedFilter) {
    setStageFilter(sf.stage);
    setSourceFilter(sf.source);
    setSubSourceFilter(sf.subSource ?? "");
    setPriorityFilter(sf.priority);
    setAssignedToFilter(sf.assignedTo ?? "");
  }
  function deleteSaved(name: string) {
    const next = savedFilters.filter(f => f.name !== name);
    setSavedFilters(next); saveToDisk(next);
  }
  function saveCurrentFilter() {
    if (!saveName.trim()) return;
    const next = [...savedFilters.filter(f => f.name !== saveName.trim()), {
      name: saveName.trim(), stage: stageFilter, source: sourceFilter, subSource: subSourceFilter,
      priority: priorityFilter, assignedTo: assignedToFilter,
    }];
    setSavedFilters(next); saveToDisk(next);
    setSaveDialogOpen(false); setSaveName("");
    success("Filter saved ✓");
  }
  function clearFilters() { setStageFilter(""); setSourceFilter(""); setSubSourceFilter(""); setPriorityFilter(""); setAssignedToFilter(""); }

  const sortLabels: Record<string, string> = {
    score: "Score", updatedAt: "Last updated", createdAt: "Date added", name: "Name", priority: "Priority",
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-up">

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
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e4e0d6]">
              <h2 className="font-bold flex items-center gap-2" style={{ color: "#14211f" }}>
                <AlertTriangle size={16} className="text-amber-500" /> Possible Duplicates
              </h2>
              <button onClick={() => setDupOpen(false)} className="p-1.5 rounded-lg hover:bg-[#f8f6f1] transition">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              {/* Merge confirmation bar */}
              {mergeKeepId && mergeMergeId && (
                <div className="border rounded-xl px-4 py-3 flex items-center gap-3 text-sm" style={{ background: "#edf5f4", borderColor: "#086c64" }}>
                  <Merge size={14} style={{ color: "#086c64" }} className="shrink-0" />
                  <span className="flex-1" style={{ color: "#086c64" }}>Keep the first lead selected, merge the second into it.</span>
                  <button onClick={mergeLeads} disabled={merging}
                    className="text-xs font-bold disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                    style={{ background: "#086c64" }}>
                    {merging ? <Loader2 size={12} className="animate-spin" /> : <Merge size={12} />}
                    {merging ? "Merging…" : "Confirm merge"}
                  </button>
                  <button onClick={() => { setMergeKeepId(null); setMergeMergeId(null); }}
                    className="transition" style={{ color: "#949598" }}><X size={14} /></button>
                </div>
              )}
              {dupGroups.map((group, i) => (
                <div key={i} className="border border-[#e4e0d6] rounded-xl overflow-hidden">
                  <div className="px-4 py-2 text-xs font-bold uppercase tracking-wide border-b border-[#e4e0d6]" style={{ background: "#f8f6f1", color: "#949598" }}>
                    {group.reason}
                  </div>
                  {group.leads.map(lead => {
                    const stg = stageInfo(lead.stage);
                    const isKeep  = mergeKeepId  === lead.id;
                    const isMerge = mergeMergeId === lead.id;
                    return (
                      <div key={lead.id} className={`flex items-center gap-3 px-4 py-3 border-b border-[#e4e0d6] last:border-0 transition ${isKeep ? "bg-green-50" : isMerge ? "bg-red-50" : ""}`}>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#edf5f4" }}>
                          <span className="text-[9px] font-bold" style={{ color: "#086c64" }}>{lead.firstName[0]}{lead.lastName[0]}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: "#14211f" }}>{lead.firstName} {lead.lastName}</p>
                          <p className="text-xs truncate" style={{ color: "#949598" }}>{lead.email}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stg.color}`}>{stg.label}</span>
                        {isKeep  && <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Keep</span>}
                        {isMerge && <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">Merge</span>}
                        {!isKeep && !isMerge && (
                          <button
                            onClick={() => {
                              if (!mergeKeepId) setMergeKeepId(lead.id);
                              else if (!mergeMergeId && lead.id !== mergeKeepId) setMergeMergeId(lead.id);
                            }}
                            className="text-xs font-semibold border border-[#e4e0d6] px-2 py-0.5 rounded-lg transition flex items-center gap-1"
                            style={{ color: "#5a6663" }}>
                            <Merge size={10} /> Select
                          </button>
                        )}
                        <Link href={`/leads/${lead.id}`} onClick={() => setDupOpen(false)}
                          className="text-xs font-semibold hover:underline shrink-0" style={{ color: "#086c64" }}>
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
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#949598" }}>Vantage Career Accelerator</p>
          <h1 className="text-xl sm:text-2xl font-display font-semibold" style={{ color: "#14211f" }}>All Leads</h1>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: "#949598" }}>{leads.length} lead{leads.length !== 1 ? "s" : ""} total</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Desktop actions */}
          <div className="hidden sm:flex items-center gap-2 flex-wrap">
            <Link href="/pipeline" className="px-3 py-2 text-sm font-medium border border-[#e4e0d6] rounded-xl hover:bg-[#f8f6f1] transition" style={{ color: "#5a6663" }}>
              Pipeline
            </Link>
            <Link href="/analytics" className="px-3 py-2 text-sm font-medium border border-[#e4e0d6] rounded-xl hover:bg-[#f8f6f1] transition" style={{ color: "#5a6663" }}>
              Analytics
            </Link>
            <button onClick={() => { setBinOpen(true); loadBin(); }}
              className="flex items-center gap-2 text-sm font-semibold border border-[#e4e0d6] px-3 py-2 rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition" style={{ color: "#949598" }}>
              <Trash2 size={14} /> Recycle Bin
            </button>
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-2 text-sm font-semibold border border-[#e4e0d6] px-3 py-2 rounded-xl hover:bg-[#f8f6f1] transition" style={{ color: "#5a6663" }}>
              <Upload size={14} /> Import CSV
            </button>
            <a
              href={`/api/crm/leads/export${stageFilter || sourceFilter || priorityFilter ? `?${new URLSearchParams({ ...(stageFilter ? { stage: stageFilter } : {}), ...(sourceFilter ? { source: sourceFilter } : {}), ...(priorityFilter ? { priority: priorityFilter } : {}) }).toString()}` : ""}`}
              download
              className="flex items-center gap-2 text-sm font-semibold border border-[#e4e0d6] px-3 py-2 rounded-xl hover:bg-[#f8f6f1] transition" style={{ color: "#5a6663" }}
            >
              <Download size={14} /> Export CSV
            </a>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-xl transition shadow-sm"
              style={{ background: "#086c64" }}>
              <Plus size={15} /> Add Lead
              <kbd className="hidden lg:inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded ml-1" style={{ background: "#085c57", color: "#edf5f4" }}>N</kbd>
            </button>
          </div>

          {/* Mobile actions: search + overflow menu */}
          <div className="flex sm:hidden items-center gap-2 relative">
            <button onClick={() => setShowFilters(v => !v)}
              className={`p-2 rounded-xl border transition ${showFilters || hasActiveFilters ? "border-[#086c64]" : "border-[#e4e0d6] hover:bg-[#f8f6f1]"}`}
              style={showFilters || hasActiveFilters ? { background: "#edf5f4", color: "#086c64" } : { color: "#949598" }}>
              <Filter size={17} />
              {hasActiveFilters && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: "#086c64" }} />}
            </button>
            <button onClick={() => setMobileMenuOpen(v => !v)}
              className="p-2 rounded-xl border border-[#e4e0d6] hover:bg-[#f8f6f1] transition" style={{ color: "#949598" }}>
              <ChevronDown size={17} />
            </button>
            {mobileMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMobileMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-2xl shadow-xl border border-[#e4e0d6] w-52 py-1.5 text-sm">
                  <Link href="/pipeline" className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f8f6f1] transition" style={{ color: "#5a6663" }} onClick={() => setMobileMenuOpen(false)}>
                    <ArrowUpDown size={14} style={{ color: "#949598" }} /> Pipeline view
                  </Link>
                  <Link href="/analytics" className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f8f6f1] transition" style={{ color: "#5a6663" }} onClick={() => setMobileMenuOpen(false)}>
                    <Sparkles size={14} style={{ color: "#949598" }} /> Analytics
                  </Link>
                  <button onClick={() => { setMobileMenuOpen(false); setShowImport(true); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f8f6f1] transition" style={{ color: "#5a6663" }}>
                    <Upload size={14} style={{ color: "#949598" }} /> Import CSV
                  </button>
                  <a href={`/api/crm/leads/export`} download onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f8f6f1] transition" style={{ color: "#5a6663" }}>
                    <Download size={14} style={{ color: "#949598" }} /> Export CSV
                  </a>
                  <div className="border-t border-[#e4e0d6] mt-1 pt-1">
                    <button onClick={() => { setMobileMenuOpen(false); setBinOpen(true); loadBin(); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 transition text-red-600">
                      <Trash2 size={14} /> Recycle Bin
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Saved filter chips */}
      {savedFilters.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-1" style={{ color: "#949598" }}>
            <Bookmark size={10} /> Views
          </span>
          {savedFilters.map(sf => (
            <div key={sf.name}
              className="flex items-center gap-1 text-xs font-semibold bg-white border border-[#e4e0d6] rounded-full px-3 py-1 hover:border-[#086c64] transition" style={{ color: "#5a6663" }}>
              <button onClick={() => applySaved(sf)} className="hover:text-[#086c64]">{sf.name}</button>
              <button onClick={() => deleteSaved(sf.name)} className="hover:text-red-400 transition ml-1" style={{ color: "#c9c4b8" }}>
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#949598" }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, company…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-[#e4e0d6] rounded-xl bg-white focus:outline-none focus:ring-2"
            style={{ color: "#14211f" }} />
        </div>

        <button onClick={() => setShowFilters(v => !v)}
          className={`hidden sm:flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border transition ${
            showFilters || hasActiveFilters
              ? "border-[#086c64]"
              : "border-[#e4e0d6] hover:bg-[#f8f6f1]"
          }`}
          style={showFilters || hasActiveFilters ? { background: "#edf5f4", color: "#086c64" } : { color: "#949598" }}>
          <Filter size={14} /> Filters
          {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full ml-0.5" style={{ background: "#086c64" }} />}
        </button>

        <div className="relative">
          <button
            onClick={() => setSortMenuOpen(o => !o)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border border-[#e4e0d6] hover:bg-[#f8f6f1] transition" style={{ color: "#949598" }}>
            {sortBy === "score" ? <Sparkles size={13} className="text-amber-500" /> : <ArrowUpDown size={13} />}
            {sortLabels[sortBy]} {sortDir === "asc" ? "↑" : "↓"}
            <ChevronDown size={12} />
          </button>
          {sortMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setSortMenuOpen(false)} />
              <div className="absolute z-40 mt-1 w-48 bg-white rounded-xl border border-[#e4e0d6] shadow-lg py-1.5">
                {(["score", "updatedAt", "createdAt", "name", "priority"] as const).map(opt => (
                  <button key={opt}
                    onClick={() => {
                      if (sortBy === opt) setSortDir(d => d === "desc" ? "asc" : "desc");
                      else { setSortBy(opt); setSortDir("desc"); }
                      setSortMenuOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 text-sm hover:bg-[#f8f6f1] transition flex items-center justify-between ${sortBy === opt ? "font-semibold" : ""}`}
                    style={{ color: sortBy === opt ? "#086c64" : "#14211f" }}>
                    {sortLabels[opt]}
                    {sortBy === opt && <span className="text-xs">{sortDir === "asc" ? "↑ asc" : "↓ desc"}</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Save current filter */}
        {hasActiveFilters && (
          <button onClick={() => setSaveDialogOpen(true)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border border-[#e4e0d6] hover:bg-[#f8f6f1] transition" style={{ color: "#949598" }}>
            <BookmarkPlus size={14} /> Save view
          </button>
        )}
      </div>

      {/* Quick filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {([
          { key: "hot",        label: "🔥 Hot",        count: leads.filter(l => (l.score ?? 0) >= 70).length },
          { key: "stale",      label: "⏳ Stale 14d+", count: leads.filter(l => Date.now() - new Date(l.updatedAt).getTime() > STALE_MS).length },
          { key: "unassigned", label: "👤 Unassigned", count: leads.filter(l => !l.assignedTo).length },
        ] as const).map(chip => (
          <button key={chip.key}
            onClick={() => setQuickFilter(q => q === chip.key ? "" : chip.key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
              quickFilter === chip.key ? "border-transparent text-white" : "border-[#e4e0d6] hover:bg-[#f8f6f1]"
            }`}
            style={quickFilter === chip.key ? { background: "#086c64" } : { color: "#949598" }}>
            {chip.label} <span className="opacity-70">({chip.count})</span>
          </button>
        ))}
        {quickFilter && (
          <button onClick={() => setQuickFilter("")} className="text-xs font-medium underline" style={{ color: "#949598" }}>
            Clear
          </button>
        )}
      </div>

      {/* Save filter dialog */}
      {saveDialogOpen && (
        <div className="mb-4 border border-[#e4e0d6] rounded-xl p-4 flex items-center gap-3" style={{ background: "#edf5f4" }}>
          <input
            autoFocus
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && saveCurrentFilter()}
            placeholder="Name this view (e.g. Hot Leads)"
            className="flex-1 text-sm border border-[#e4e0d6] rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2"
            style={{ color: "#14211f" }}
          />
          <button onClick={saveCurrentFilter}
            className="text-sm font-semibold text-white px-3 py-1.5 rounded-lg transition" style={{ background: "#086c64" }}>
            Save
          </button>
          <button onClick={() => setSaveDialogOpen(false)}
            className="text-sm transition" style={{ color: "#949598" }}>
            Cancel
          </button>
        </div>
      )}

      {/* Filter panel */}
      {showFilters && (
        <div className="flex gap-3 mb-5 flex-wrap p-4 border border-[#e4e0d6] rounded-xl" style={{ background: "#f8f6f1" }}>
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#949598" }}>Stage</label>
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
              className="text-sm border border-[#e4e0d6] rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2" style={{ color: "#14211f" }}>
              <option value="">All stages</option>
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#949598" }}>Source</label>
            <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); if (e.target.value !== "3I_NEXTGEN") setSubSourceFilter(""); }}
              className="text-sm border border-[#e4e0d6] rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2" style={{ color: "#14211f" }}>
              <option value="">All sources</option>
              {SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          {sourceFilter === "3I_NEXTGEN" && (
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "#949598" }}>Member type</label>
              <select value={subSourceFilter} onChange={e => setSubSourceFilter(e.target.value)}
                className="text-sm border border-[#e4e0d6] rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2" style={{ color: "#14211f" }}>
                <option value="">All types</option>
                {NEXTGEN_SUB_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#949598" }}>Priority</label>
            <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
              className="text-sm border border-[#e4e0d6] rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2" style={{ color: "#14211f" }}>
              <option value="">All priorities</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {adminUsers.length > 0 && (
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "#949598" }}>Assigned To</label>
              <select value={assignedToFilter} onChange={e => setAssignedToFilter(e.target.value)}
                className="text-sm border border-[#e4e0d6] rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2" style={{ color: "#14211f" }}>
                <option value="">All reps</option>
                {adminUsers.map(u => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
              </select>
            </div>
          )}
          {hasActiveFilters && (
            <button onClick={clearFilters}
              className="self-end text-xs transition px-2 py-1.5" style={{ color: "#949598" }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {someSelected && (
        <div className="mb-4 flex items-center gap-3 text-white px-5 py-3 rounded-2xl shadow-lg flex-wrap" style={{ background: "#086c64" }}>
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
              className="text-xs font-bold bg-white px-3 py-1.5 rounded-lg hover:bg-[#f8f6f1] transition disabled:opacity-40" style={{ color: "#086c64" }}>
              {bulkWorking ? "Working…" : "Apply"}
            </button>
            <button
              onClick={async () => {
                if (selected.size === 0) return;
                if (!confirm(`Delete ${selected.size} lead${selected.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
                setBulkWorking(true);
                const res = await fetch("/api/crm/leads/bulk", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ids: Array.from(selected), action: "delete" }),
                });
                if (res.ok) { success(`Deleted ${selected.size} lead${selected.size !== 1 ? "s" : ""} ✓`); setSelected(new Set()); await load(); }
                else { toastError("Bulk delete failed."); }
                setBulkWorking(false);
              }}
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
        <>
          {/* Desktop skeleton */}
          <div className="hidden md:block card shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e4e0d6]" style={{ background: "#f8f6f1" }}>
                  {["", "Name", "Company", "Stage", "Source", "Priority", "Deal", "Score", "Last Touched", ""].map((h, i) => (
                    <th key={i} className="px-5 py-3 text-left">
                      {h && <div className="h-3 rounded animate-pulse w-16" style={{ background: "#e4e0d6" }} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-[#e4e0d6]">
                    <td className="pl-5 pr-2 py-3.5"><div className="w-4 h-4 rounded animate-pulse" style={{ background: "#f1efe8" }} /></td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl animate-pulse shrink-0" style={{ background: "#f1efe8" }} />
                        <div className="space-y-1.5">
                          <div className="h-3 rounded animate-pulse w-28" style={{ background: "#e4e0d6" }} />
                          <div className="h-2.5 rounded animate-pulse w-36" style={{ background: "#f1efe8" }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell"><div className="h-3 rounded animate-pulse w-24" style={{ background: "#f1efe8" }} /></td>
                    <td className="px-5 py-3.5"><div className="h-5 rounded-full animate-pulse w-20" style={{ background: "#f1efe8" }} /></td>
                    <td className="px-5 py-3.5 hidden lg:table-cell"><div className="h-3 rounded animate-pulse w-16" style={{ background: "#f1efe8" }} /></td>
                    <td className="px-5 py-3.5 hidden xl:table-cell"><div className="h-5 rounded-full animate-pulse w-14" style={{ background: "#f1efe8" }} /></td>
                    <td className="px-5 py-3.5 hidden xl:table-cell"><div className="h-3 rounded animate-pulse w-12" style={{ background: "#f1efe8" }} /></td>
                    <td className="px-5 py-3.5"><div className="h-5 rounded-full animate-pulse w-10" style={{ background: "#f1efe8" }} /></td>
                    <td className="px-5 py-3.5 hidden xl:table-cell"><div className="h-3 rounded animate-pulse w-16" style={{ background: "#f1efe8" }} /></td>
                    <td className="px-5 py-3.5"><div className="h-3 rounded animate-pulse w-10 ml-auto" style={{ background: "#f1efe8" }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile skeleton */}
          <div className="md:hidden space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card p-4 flex items-center gap-3">
                <div className="w-4 h-4 rounded animate-pulse shrink-0" style={{ background: "#f1efe8" }} />
                <div className="w-9 h-9 rounded-xl animate-pulse shrink-0" style={{ background: "#f1efe8" }} />
                <div className="flex-1 space-y-2">
                  <div className="h-3 rounded animate-pulse w-32" style={{ background: "#e4e0d6" }} />
                  <div className="h-2.5 rounded animate-pulse w-44" style={{ background: "#f1efe8" }} />
                  <div className="flex gap-2 mt-1">
                    <div className="h-4 rounded-full animate-pulse w-16" style={{ background: "#f1efe8" }} />
                    <div className="h-4 rounded-full animate-pulse w-10" style={{ background: "#f1efe8" }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>

      ) : sorted.length === 0 ? (
        <div className="card shadow-sm p-16 text-center">
          <p className="text-sm" style={{ color: "#949598" }}>No leads match your filters.</p>
          <button onClick={() => setShowForm(true)}
            className="mt-4 text-white text-sm font-semibold px-4 py-2 rounded-xl transition" style={{ background: "#086c64" }}>
            Add your first lead
          </button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block card shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e4e0d6]" style={{ background: "#f8f6f1" }}>
                  <th className="pl-5 pr-2 py-3">
                    <button onClick={toggleAll} className="transition" style={{ color: "#949598" }}>
                      {allSelected ? <CheckSquare size={15} style={{ color: "#086c64" }} /> : <Square size={15} />}
                    </button>
                  </th>
                  <th className="text-left px-3 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Name</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wide hidden lg:table-cell" style={{ color: "#949598" }}>Company</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Stage</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wide hidden lg:table-cell" style={{ color: "#949598" }}>Source</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wide hidden xl:table-cell" style={{ color: "#949598" }}>Priority</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wide hidden xl:table-cell" style={{ color: "#949598" }}>Deal</th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>
                    <span className="flex items-center gap-1"><Sparkles size={11} className="text-amber-400" />Score</span>
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wide hidden xl:table-cell" style={{ color: "#949598" }}>Last Touched</th>
                  <th className="text-right px-5 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(lead => {
                  const stg        = stageInfo(lead.stage);
                  const isSelected = selected.has(lead.id);
                  return (
                    <tr key={lead.id}
                      className={`border-b border-[#e4e0d6] transition-colors ${
                        isSelected ? "bg-[#edf5f4]/60" : "hover:bg-[#f8f6f1]/60"
                      }`}>
                      <td className="pl-5 pr-2 py-3.5">
                        <button onClick={() => toggleOne(lead.id)}
                          className="transition" style={{ color: "#c9c4b8" }}>
                          {isSelected ? <CheckSquare size={15} style={{ color: "#086c64" }} /> : <Square size={15} />}
                        </button>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0`}
                            style={{ background: isSelected ? "#086c64" : "#edf5f4" }}>
                            <span className="text-[10px] font-bold" style={{ color: isSelected ? "#ffffff" : "#086c64" }}>
                              {lead.firstName[0]}{lead.lastName[0]}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <Link href={`/leads/${lead.id}`}
                                className="font-semibold hover:underline transition block" style={{ color: "#14211f" }}>
                                {lead.firstName} {lead.lastName}
                              </Link>
                              {!["ENROLLED","LOST"].includes(lead.stage) &&
                               (Date.now() - new Date(lead.updatedAt).getTime()) > 14 * 86400000 && (
                                <span title="Not touched in 14+ days" className="text-amber-400 flex-shrink-0">⚠️</span>
                              )}
                            </div>
                            <p className="text-xs truncate max-w-[160px]" style={{ color: "#949598" }}>{lead.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell text-sm" style={{ color: "#5a6663" }}>
                        {lead.company ?? <span style={{ color: "#c9c4b8" }}>—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        {stagingLeadId === lead.id ? (
                          <select
                            autoFocus
                            defaultValue={lead.stage}
                            onChange={e => quickStageChange(lead.id, e.target.value)}
                            onBlur={() => setStagingLeadId(null)}
                            className="text-xs font-semibold border border-[#086c64] rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 shadow-sm"
                          >
                            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                        ) : (
                          <button
                            onClick={() => setStagingLeadId(lead.id)}
                            title="Click to change stage"
                            className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${stg.color} hover:opacity-75 transition cursor-pointer`}
                          >
                            {stg.label}
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell text-xs" style={{ color: "#949598" }}>
                        {sourceLabel(lead.source ?? "")}
                      </td>
                      <td className="px-5 py-3.5 hidden xl:table-cell">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_COLOR[lead.priority] ?? PRIORITY_COLOR.NORMAL}`}>
                          {lead.priority}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-semibold hidden xl:table-cell" style={{ color: "#5a6663" }}>
                        {fmt$(lead.dealValue) ?? <span style={{ color: "#c9c4b8" }}>—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${scoreColor(lead.score ?? 0)}`}>
                          {lead.score ?? 0}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden xl:table-cell">
                        {(() => { const ts = timeSince(lead.updatedAt); return <span className={`text-xs font-medium ${ts.cls}`}>{ts.text}</span>; })()}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link href={`/leads/${lead.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold transition hover:underline" style={{ color: "#086c64" }}>
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
          <div className="md:hidden space-y-2 pb-24">
            {sorted.map(lead => {
              const stg        = stageInfo(lead.stage);
              const isSelected = selected.has(lead.id);
              const ts         = timeSince(lead.updatedAt);
              const isCold     = !["ENROLLED","LOST"].includes(lead.stage) &&
                                 (Date.now() - new Date(lead.updatedAt).getTime()) > 14 * 86400000;
              return (
                <div key={lead.id}
                  className={`bg-white border rounded-2xl shadow-sm transition ${
                    isSelected ? "border-[#086c64] bg-[#edf5f4]/40" : "border-[#e4e0d6]"
                  }`}>
                  <div className="flex items-center gap-3 p-3.5">
                    <button onClick={() => toggleOne(lead.id)} className="transition shrink-0" style={{ color: "#c9c4b8" }}>
                      {isSelected ? <CheckSquare size={16} style={{ color: "#086c64" }} /> : <Square size={16} />}
                    </button>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: isSelected ? "#086c64" : "#edf5f4" }}>
                      <span className="text-[10px] font-bold" style={{ color: isSelected ? "#ffffff" : "#086c64" }}>{lead.firstName[0]}{lead.lastName[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/leads/${lead.id}`}
                          className="font-semibold hover:underline transition truncate text-sm" style={{ color: "#14211f" }}>
                          {lead.firstName} {lead.lastName}
                        </Link>
                        {isCold && <span title="Not touched in 14+ days" className="text-amber-400 flex-shrink-0 text-xs">⚠️</span>}
                      </div>
                      <p className="text-xs truncate" style={{ color: "#949598" }}>{lead.company ? `${lead.company} · ${lead.email}` : lead.email}</p>
                    </div>
                    <Link href={`/leads/${lead.id}`} className="shrink-0 p-1.5 rounded-xl hover:bg-[#f8f6f1] transition">
                      <ExternalLink size={13} style={{ color: "#949598" }} />
                    </Link>
                  </div>
                  {/* Action strip */}
                  <div className="flex items-center gap-2 px-3.5 pb-3 -mt-1">
                    <button
                      onClick={() => setMobileStageLeadId(lead.id)}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${stg.color} active:opacity-70 transition`}>
                      {stg.label}
                    </button>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_COLOR[lead.priority] ?? PRIORITY_COLOR.NORMAL}`}>
                      {lead.priority}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${scoreColor(lead.score ?? 0)}`}>
                      ⚡ {lead.score}
                    </span>
                    <span className={`text-[10px] ml-auto ${ts.cls}`}>{ts.text}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Mobile FAB — floating add button */}
      <button
        onClick={() => setShowForm(true)}
        className="sm:hidden fixed bottom-6 right-6 z-40 w-14 h-14 active:scale-95 text-white rounded-2xl shadow-xl flex items-center justify-center transition-all"
        style={{ background: "#086c64" }}>
        <Plus size={24} />
      </button>

      {/* Mobile stage bottom-sheet */}
      {mobileStageLeadId && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm sm:hidden"
            onClick={() => setMobileStageLeadId(null)} />
          <div className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-3xl shadow-2xl sm:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#e4e0d6]">
              <span className="font-bold text-sm" style={{ color: "#14211f" }}>Move to stage</span>
              <button onClick={() => setMobileStageLeadId(null)} className="p-1.5 rounded-lg hover:bg-[#f8f6f1] transition">
                <X size={16} />
              </button>
            </div>
            <div className="py-2">
              {STAGES.map(s => {
                const lead = sorted.find(l => l.id === mobileStageLeadId);
                const active = lead?.stage === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => quickStageChange(mobileStageLeadId, s.key)}
                    className={`w-full flex items-center gap-3 px-5 py-3.5 transition ${active ? "bg-[#edf5f4]" : "hover:bg-[#f8f6f1] active:bg-[#f8f6f1]"}`}>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${stageInfo(s.key).color}`}>{s.label}</span>
                    {active && <span className="ml-auto text-xs font-semibold" style={{ color: "#086c64" }}>Current</span>}
                  </button>
                );
              })}
            </div>
            <div className="h-6" />
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

      {/* Recycle Bin modal */}
      {binOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e4e0d6]">
              <h2 className="font-bold flex items-center gap-2" style={{ color: "#14211f" }}>
                <Trash2 size={16} style={{ color: "#949598" }} /> Recycle Bin
              </h2>
              <button onClick={() => setBinOpen(false)} className="p-1.5 rounded-lg hover:bg-[#f8f6f1] transition">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {binLoading && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={24} className="animate-spin" style={{ color: "#c9c4b8" }} />
                </div>
              )}
              {!binLoading && binLeads.length === 0 && (
                <div className="text-center py-16" style={{ color: "#949598" }}>
                  <Trash2 size={32} className="mx-auto mb-3" style={{ color: "#c9c4b8" }} />
                  <p className="text-sm">Recycle bin is empty</p>
                  <p className="text-xs mt-1">Deleted leads will appear here for recovery.</p>
                </div>
              )}
              {!binLoading && binLeads.length > 0 && (
                <div className="space-y-2">
                  {binLeads.map(lead => {
                    const stg = stageInfo(lead.stage);
                    const daysAgo = Math.floor((Date.now() - new Date(lead.deletedAt).getTime()) / 86400000);
                    return (
                      <div key={lead.id} className="flex items-center gap-3 border border-[#e4e0d6] rounded-xl px-4 py-3" style={{ background: "#f8f6f1" }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#e4e0d6" }}>
                          <span className="text-[10px] font-bold" style={{ color: "#5a6663" }}>{lead.firstName[0]}{lead.lastName[0]}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: "#14211f" }}>{lead.firstName} {lead.lastName}</p>
                          <p className="text-xs truncate" style={{ color: "#949598" }}>{lead.email}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stg.color}`}>{stg.label}</span>
                            <span className="text-[10px]" style={{ color: "#949598" }}>Deleted {daysAgo === 0 ? "today" : `${daysAgo}d ago`}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => binAction(lead.id, "restore")}
                            className="text-xs font-semibold text-emerald-600 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition">
                            Restore
                          </button>
                          <button onClick={() => {
                            if (confirm(`Permanently delete ${lead.firstName} ${lead.lastName}? This cannot be undone.`))
                              binAction(lead.id, "purge");
                          }}
                            className="text-xs font-semibold text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition">
                            Delete forever
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-[#e4e0d6] text-xs" style={{ color: "#949598" }}>
              {binLeads.length > 0 ? `${binLeads.length} deleted lead${binLeads.length !== 1 ? "s" : ""}` : "No deleted leads"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
