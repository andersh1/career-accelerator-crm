"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Send, Loader2, Lock, Eye, EyeOff,
  User, Tag, Clock, CheckCircle2, AlertTriangle,
  ExternalLink, LifeBuoy, MessageSquare, StickyNote,
  ChevronDown, TicketIcon,
} from "lucide-react";
import NoteContent from "@/components/crm/NoteContent";

interface Message {
  id:         string;
  authorName: string;
  authorRole: string;
  content:    string;
  isInternal: boolean;
  createdAt:  string;
}

interface TicketUser { id: string; name: string; email: string; cohort: string | null }
interface Lead       { id: string; firstName: string; lastName: string }

interface Ticket {
  id:                 string;
  ticketNumber:       number;
  subject:            string;
  category:           string;
  description:        string;
  status:             string;
  priority:           string;
  assigneeId:         string | null;
  satisfactionRating: number | null;
  createdAt:          string;
  lastActivityAt:     string;
  closedAt:           string | null;
  messages:           Message[];
  user:               TicketUser;
  lead:               Lead | null;
}

const STATUS_OPTIONS = [
  { value: "OPEN",        label: "Open",        color: "text-blue-700 bg-blue-100"       },
  { value: "IN_PROGRESS", label: "In Progress", color: "text-amber-700 bg-amber-100"     },
  { value: "WAITING",     label: "Waiting",     color: "text-purple-700 bg-purple-100"   },
  { value: "RESOLVED",    label: "Resolved",    color: "text-emerald-700 bg-emerald-100" },
  { value: "CLOSED",      label: "Closed",      color: "text-slate-500 bg-slate-100"     },
];

const PRIORITY_OPTIONS = [
  { value: "LOW",    label: "Low",    color: "text-slate-600"  },
  { value: "NORMAL", label: "Normal", color: "text-blue-700"   },
  { value: "HIGH",   label: "High",   color: "text-amber-700"  },
  { value: "URGENT", label: "Urgent", color: "text-red-700"    },
];

const CATEGORY_EMOJI: Record<string, string> = {
  TECHNICAL: "🔧", CONTENT: "📚", COACHING: "🎯", BILLING: "💳", OTHER: "💬",
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}
function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function TicketDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const router    = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [ticket,     setTicket]     = useState<Ticket | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [reply,      setReply]      = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending,    setSending]    = useState(false);
  const [saving,     setSaving]     = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/tickets/${id}`);
    if (res.ok) setTicket(await res.json());
    else router.push("/tickets");
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ticket?.messages.length]);

  async function updateTicket(patch: Record<string, unknown>) {
    setSaving(true);
    const res = await fetch(`/api/crm/tickets/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = await res.json();
      setTicket(prev => prev ? { ...prev, ...updated } : prev);
    }
    setSaving(false);
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/crm/tickets/${id}/messages`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ content: reply.trim(), isInternal }),
      });
      if (!res.ok) throw new Error();
      const msg = await res.json();
      setTicket(prev => prev ? {
        ...prev,
        messages:       [...prev.messages, msg],
        status:         isInternal ? prev.status : "WAITING",
        lastActivityAt: new Date().toISOString(),
      } : prev);
      setReply("");
    } catch {
      alert("Failed to send. Try again.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-slate-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading ticket…</span>
      </div>
    );
  }

  if (!ticket) return null;

  const statusConf   = STATUS_OPTIONS.find(s => s.value === ticket.status);
  const priorityConf = PRIORITY_OPTIONS.find(p => p.value === ticket.priority);
  const isClosed     = ticket.status === "CLOSED" || ticket.status === "RESOLVED";

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">

      {/* ── Left: Thread ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center gap-3 flex-shrink-0">
          <Link href="/tickets" className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-500">
            <ArrowLeft size={16} />
          </Link>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <TicketIcon size={16} className="text-blue-600 flex-shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400">#{ticket.ticketNumber}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusConf?.color}`}>
                  {statusConf?.label}
                </span>
                {ticket.priority === "URGENT" && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                    <AlertTriangle size={9} /> URGENT
                  </span>
                )}
              </div>
              <h1 className="text-sm font-bold text-slate-900 truncate">{ticket.subject}</h1>
            </div>
          </div>
          {saving && <Loader2 size={14} className="animate-spin text-slate-400" />}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {ticket.messages.map((msg) => {
            const isAdmin    = msg.authorRole === "ADMIN";
            const isIntNote  = msg.isInternal;

            if (isIntNote) {
              return (
                <div key={msg.id} className="flex gap-3 justify-center">
                  <div className="max-w-[90%] bg-amber-50 border border-amber-200 border-dashed rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <StickyNote size={11} className="text-amber-600" />
                      <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Internal Note</span>
                      <span className="text-[10px] text-amber-500">· {msg.authorName} · {fmtDateTime(msg.createdAt)}</span>
                    </div>
                    <NoteContent text={msg.content} linkColor="text-amber-700" clamp={6} />
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className={`flex gap-3 ${isAdmin ? "flex-row-reverse" : ""}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                  isAdmin
                    ? "bg-gradient-to-br from-blue-600 to-indigo-700"
                    : "bg-gradient-to-br from-slate-500 to-slate-700"
                }`}>
                  {msg.authorName?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className={`flex-1 max-w-[75%] ${isAdmin ? "flex flex-col items-end" : ""}`}>
                  <div className={`rounded-2xl px-4 py-3 shadow-sm ${
                    isAdmin
                      ? "bg-blue-600 text-white"
                      : "bg-white border border-slate-200"
                  }`}>
                    <p className={`text-xs font-semibold mb-1.5 ${isAdmin ? "text-blue-100" : "text-slate-500"}`}>
                      {isAdmin ? `${msg.authorName} (Support)` : ticket.user.name}
                    </p>
                    <NoteContent
                      text={msg.content}
                      linkColor={isAdmin ? "text-blue-200" : "text-teal-700"}
                      clamp={6}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 px-1">{fmtDateTime(msg.createdAt)}</p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Reply box */}
        <div className="flex-shrink-0 border-t border-slate-200 bg-white px-6 py-4">
          {/* Toggle: Reply vs Internal Note */}
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setIsInternal(false)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                !isInternal ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              <MessageSquare size={11} />
              Reply to Student
            </button>
            <button
              onClick={() => setIsInternal(true)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                isInternal ? "bg-amber-100 text-amber-700" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              <StickyNote size={11} />
              Internal Note
            </button>
            {isInternal && (
              <span className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                <EyeOff size={10} /> Not visible to student
              </span>
            )}
          </div>

          <form onSubmit={sendReply} className="space-y-3">
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              placeholder={isInternal ? "Add an internal note (only visible to team)…" : "Type your reply to the student…"}
              rows={4}
              className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition resize-none ${
                isInternal
                  ? "border-amber-200 bg-amber-50 placeholder:text-amber-400 focus:ring-amber-400"
                  : "border-slate-200 placeholder:text-slate-400 focus:ring-blue-500"
              }`}
            />
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-400">
                {!isInternal && "Student will receive an email notification."}
              </p>
              <button
                type="submit"
                disabled={sending || !reply.trim()}
                className={`flex items-center gap-2 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed ${
                  isInternal ? "bg-amber-500 hover:bg-amber-600" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {sending
                  ? <><Loader2 size={14} className="animate-spin" /> Sending…</>
                  : isInternal
                    ? <><StickyNote size={14} /> Save Note</>
                    : <><Send size={14} /> Send Reply</>
                }
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Right: Sidebar ── */}
      <aside className="w-72 shrink-0 bg-slate-50 border-l border-slate-200 overflow-y-auto flex flex-col gap-4 p-4">

        {/* Status */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Status</p>
          <select
            value={ticket.status}
            onChange={e => updateTicket({ status: e.target.value })}
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold"
          >
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Priority</p>
          <select
            value={ticket.priority}
            onChange={e => updateTicket({ priority: e.target.value })}
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        {/* Ticket info */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Ticket Info</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Tag size={11} className="text-slate-400 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-slate-400">Category</p>
                <p className="text-xs font-semibold text-slate-700">
                  {CATEGORY_EMOJI[ticket.category] ?? "💬"} {ticket.category}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={11} className="text-slate-400 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-slate-400">Opened</p>
                <p className="text-xs font-semibold text-slate-700">{fmtDateTime(ticket.createdAt)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MessageSquare size={11} className="text-slate-400 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-slate-400">Last activity</p>
                <p className="text-xs font-semibold text-slate-700">{fmtRelative(ticket.lastActivityAt)}</p>
              </div>
            </div>
            {ticket.closedAt && (
              <div className="flex items-center gap-2">
                <CheckCircle2 size={11} className="text-emerald-500 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-400">Closed</p>
                  <p className="text-xs font-semibold text-slate-700">{fmtDateTime(ticket.closedAt)}</p>
                </div>
              </div>
            )}
            {ticket.satisfactionRating && (
              <div className="flex items-center gap-2">
                <span className="text-[11px]">⭐</span>
                <div>
                  <p className="text-[10px] text-slate-400">Satisfaction</p>
                  <p className="text-xs font-semibold text-slate-700">
                    {ticket.satisfactionRating}/5 {"★".repeat(ticket.satisfactionRating)}{"☆".repeat(5-ticket.satisfactionRating)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Student info */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Student</p>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {ticket.user.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{ticket.user.name}</p>
              <p className="text-[11px] text-slate-500 truncate">{ticket.user.email}</p>
              {ticket.user.cohort && (
                <p className="text-[10px] text-blue-600 font-medium mt-0.5">{ticket.user.cohort}</p>
              )}
            </div>
          </div>

          {/* Link to LMS admin user */}
          <a
            href={`https://career-accelerator-lms.vercel.app/admin/users?highlight=${ticket.user.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-600 transition"
          >
            <ExternalLink size={10} />
            View in LMS
          </a>

          {/* Link to CRM lead */}
          {ticket.lead ? (
            <Link
              href={`/leads/${ticket.lead.id}`}
              className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-800 transition font-semibold"
            >
              <User size={10} />
              View CRM Lead →
            </Link>
          ) : (
            <p className="text-[11px] text-slate-400">Not linked to a CRM lead</p>
          )}
        </div>

        {/* Quick actions */}
        <div className="space-y-2">
          <button
            onClick={() => updateTicket({ status: "IN_PROGRESS" })}
            disabled={ticket.status === "IN_PROGRESS"}
            className="w-full text-xs font-semibold px-4 py-2.5 rounded-xl border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Mark In Progress
          </button>
          <button
            onClick={() => updateTicket({ status: "RESOLVED" })}
            disabled={isClosed}
            className="w-full text-xs font-semibold px-4 py-2.5 rounded-xl border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ✓ Mark Resolved
          </button>
          <button
            onClick={() => updateTicket({ status: "CLOSED" })}
            disabled={ticket.status === "CLOSED"}
            className="w-full text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            <Lock size={11} />
            Close Ticket
          </button>
        </div>
      </aside>
    </div>
  );
}
