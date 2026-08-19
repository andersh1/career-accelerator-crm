"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2, ArrowRight } from "lucide-react";
import { stageInfo } from "./constants";

interface SearchLead {
  id: string; firstName: string; lastName: string; email: string;
  company: string | null; stage: string; score?: number;
}

export default function GlobalSearch() {
  const router  = useRouter();
  const [open,    setOpen]    = useState(false);
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<SearchLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor,  setCursor]  = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K toggle
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(v => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus + reset on open
  useEffect(() => {
    if (open) {
      setQuery(""); setResults([]); setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  // Debounced search
  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const res  = await fetch(`/api/crm/leads?q=${encodeURIComponent(q)}&all=true`);
    const data = await res.json();
    const arr  = Array.isArray(data) ? data : (data.leads ?? []);
    setResults(arr.slice(0, 8));
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 180);
    return () => clearTimeout(t);
  }, [query, search]);

  function navigate(id: string) {
    router.push(`/leads/${id}`);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { setCursor(c => Math.min(c + 1, results.length - 1)); e.preventDefault(); }
    if (e.key === "ArrowUp")   { setCursor(c => Math.max(c - 1, 0));                  e.preventDefault(); }
    if (e.key === "Enter" && results[cursor]) navigate(results[cursor].id);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[14vh] px-4 bg-black/30 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search leads — name, email, company…"
            className="flex-1 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
          />
          {loading
            ? <Loader2 size={14} className="animate-spin text-slate-300 shrink-0" />
            : query && <button onClick={() => setQuery("")} className="text-slate-300 hover:text-slate-500 transition shrink-0"><X size={14} /></button>
          }
        </div>

        {/* Results list */}
        {results.length > 0 ? (
          <ul className="max-h-72 overflow-y-auto py-1">
            {results.map((lead, i) => {
              const stg = stageInfo(lead.stage);
              return (
                <li key={lead.id}>
                  <button
                    onClick={() => navigate(lead.id)}
                    onMouseEnter={() => setCursor(i)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
                      i === cursor ? "bg-blue-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                      <span className="text-white text-[10px] font-bold">
                        {lead.firstName[0]}{lead.lastName[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {lead.firstName} {lead.lastName}
                      </p>
                      <p className="text-xs text-slate-400 truncate">
                        {lead.email}{lead.company ? ` · ${lead.company}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {lead.score !== undefined && (
                        <span className="text-[10px] font-bold text-slate-400">{lead.score}</span>
                      )}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stg.color}`}>
                        {stg.label}
                      </span>
                      {i === cursor && <ArrowRight size={12} className="text-blue-400" />}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : query.trim() && !loading ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-slate-500">No leads found for <strong>&quot;{query}&quot;</strong></p>
          </div>
        ) : (
          <div className="px-4 py-5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Global search</p>
            <p className="text-xs text-slate-500">
              Search any lead by name, email, or company. Use <kbd className="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded">↑↓</kbd> to navigate, <kbd className="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded">↵</kbd> to open.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-3 text-[10px] text-slate-400 font-medium">
          <span><kbd className="font-mono bg-slate-100 px-1 rounded">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono bg-slate-100 px-1 rounded">↵</kbd> open</span>
          <span><kbd className="font-mono bg-slate-100 px-1 rounded">esc</kbd> close</span>
          <span className="ml-auto"><kbd className="font-mono bg-slate-100 px-1 rounded">⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
