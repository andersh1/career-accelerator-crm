"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  LifeBuoy, Search, Filter, ChevronRight, Loader2,
  AlertTriangle, Clock, CheckCircle2, MessageSquare, RefreshCw,
} from "lucide-react";

interface TicketUser { id: string; name: string; email: string; cohort: string | null }
interface Message    { id: string; authorRole: string; createdAt: string }
interface Ticket {
  id:             string;
  ticketNumber:   number;
  subject:        string;
  category:       string;
  status:         string;
  priority:       string;
  createdAt:      string;
  lastActivityAt: string;
  user:           TicketUser;
  messages:       Message[];
}

interface Stats  { open: number; inProgress: number; waiting: number; resolved: number; urgent: number }
interface ApiRes { tickets: Ticket[]; total: number; pages: number; page: number; stats: Stats }

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  OPEN:        { label: "Open",        color: "bg-blue-100 text-blue-700",       dot: "bg-blue-500"    },
  IN_PROGRESS: { label: "In Progress", color: "bg-amber-100 text-amber-700",     dot: "bg-amber-500"   },
  WAITING:     { label: "Waiting",     color: "bg-purple-100 text-purple-700",   dot: "bg-purple-500"  },
  RESOLVED:    { label: "Resolved",    color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  CLOSED:      { label: "Closed",      color: "bg-slate-100 text-slate-500",     dot: "bg-slate-400"   },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  LOW:    { label: "Low",    color: "text-slate-500"  },
  NORMAL: { label: "Normal", color: "text-slate-600"  },
  HIGH:   { label: "High",   color: "text-amber-600"  },
  URGENT: { label: "Urgent", color: "text-red-600 font-bold" },
};

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TicketsPage() {
  const [data,     setData]     = useState<ApiRes | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [status,   setStatus]   = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [page,     setPage]     = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search)   params.set("search",   search);
    if (status)   params.set("status",   status);
    if (priority) params.set("priority", priority);
    if (category) params.set("category", category);
    params.set("page", String(page));
    const res = await fetch(`/api/crm/tickets?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [search, status, priority, category, page]);

  useEffect(() => { load(); }, [load]);

  const stats = data?.stats;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <LifeBuoy size={18} className="text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900">Support Tickets</h1>
          </div>
          <p className="text-sm text-slate-500">Manage and respond to student support requests.</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition text-slate-500 hover:text-slate-700">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Open",         val: stats.open,        color: "bg-blue-50 border-blue-200",      text: "text-blue-700",    icon: <MessageSquare size={14} className="text-blue-500" /> },
            { label: "In Progress",  val: stats.inProgress,  color: "bg-amber-50 border-amber-200",    text: "text-amber-700",   icon: <Clock size={14} className="text-amber-500" />         },
            { label: "Waiting",      val: stats.waiting,     color: "bg-purple-50 border-purple-200",  text: "text-purple-700",  icon: <Clock size={14} className="text-purple-500" />        },
            { label: "Resolved",     val: stats.resolved,    color: "bg-emerald-50 border-emerald-200",text: "text-emerald-700", icon: <CheckCircle2 size={14} className="text-emerald-500" /> },
            { label: "Urgent",       val: stats.urgent,      color: "bg-red-50 border-red-200",        text: "text-red-700",     icon: <AlertTriangle size={14} className="text-red-500" />   },
          ].map(s => (
            <div key={s.label} className={`rounded-2xl border p-3 ${s.color}`}>
              <div className="flex items-center gap-1.5 mb-1">{s.icon}<span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{s.label}</span></div>
              <p className={`text-2xl font-extrabold ${s.text}`}>{s.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search tickets…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All Status</option>
          {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
        <select value={priority} onChange={e => { setPriority(e.target.value); setPage(1); }}
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All Priority</option>
          {["LOW","NORMAL","HIGH","URGENT"].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All Categories</option>
          {["TECHNICAL","CONTENT","COACHING","BILLING","OTHER"].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Ticket list */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading tickets…</span>
          </div>
        ) : !data?.tickets.length ? (
          <div className="py-16 text-center">
            <LifeBuoy size={32} className="text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-500">No tickets found</p>
            <p className="text-xs text-slate-400 mt-1">
              {search || status || priority || category ? "Try adjusting your filters." : "No support tickets yet."}
            </p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
              <span>#</span>
              <span>Subject / Student</span>
              <span>Category</span>
              <span>Priority</span>
              <span>Status</span>
              <span>Activity</span>
            </div>

            {data.tickets.map((ticket) => {
              const st = STATUS_CONFIG[ticket.status]    ?? STATUS_CONFIG.OPEN;
              const pr = PRIORITY_CONFIG[ticket.priority] ?? PRIORITY_CONFIG.NORMAL;
              const lastMsg = ticket.messages[0];
              const isUrgent = ticket.priority === "URGENT";

              return (
                <Link
                  key={ticket.id}
                  href={`/tickets/${ticket.id}`}
                  className={`grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 items-center px-5 py-3.5 border-b border-slate-100 hover:bg-slate-50 transition group ${
                    isUrgent ? "bg-red-50/30" : ""
                  }`}
                >
                  <span className="text-[11px] font-bold text-slate-400 w-10">#{ticket.ticketNumber}</span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-blue-700 transition">
                        {ticket.subject}
                      </p>
                      {isUrgent && <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {ticket.user.name}
                      {ticket.user.cohort && <span className="text-slate-400"> · {ticket.user.cohort}</span>}
                    </p>
                  </div>

                  <span className="text-xs text-slate-500 whitespace-nowrap">{ticket.category}</span>

                  <span className={`text-xs whitespace-nowrap ${pr.color}`}>{pr.label}</span>

                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${st.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                    {st.label}
                  </span>

                  <div className="flex items-center gap-1.5 text-xs text-slate-400 whitespace-nowrap">
                    <span>{fmtRelative(ticket.lastActivityAt)}</span>
                    <ChevronRight size={12} className="text-slate-300 group-hover:text-blue-400 transition" />
                  </div>
                </Link>
              );
            })}
          </>
        )}
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{data.total} tickets · Page {data.page} of {data.pages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-medium"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(data.pages, p + 1))}
              disabled={page === data.pages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs font-medium"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
