"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Bug, Zap, Database, Settings2, Sparkles, HelpCircle,
  Plus, X, ChevronDown, Loader2, Trash2, Pencil,
  AlertTriangle, User, Tag, ExternalLink, ListChecks, CalendarClock,
  BookOpen, Megaphone, Handshake, Building2, Scale, GraduationCap } from "lucide-react";
import { useToast } from "@/lib/toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CrmIssue {
  id:           string;
  title:        string;
  description:  string | null;
  type:         string;
  status:       string;
  priority:     string;
  assignee:     string | null;
  createdBy:    string | null;
  tags:         string[];
  linkedLeadId: string | null;
  dueAt:        string | null;
  closedAt:     string | null;
  notify:       string[];
  source:       string | null;
  createdAt:    string;
  updatedAt:    string;
}

interface TeamMember { id: string; name: string | null; email: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const COLUMNS = [
  { key: "BACKLOG",     label: "Backlog",     color: "#949598", bg: "#f8f6f1" },
  { key: "TODO",        label: "To Do",       color: "#3b82f6", bg: "#eff6ff" },
  { key: "IN_PROGRESS", label: "In Progress", color: "#d97706", bg: "#fffbeb" },
  { key: "DONE",        label: "Done",        color: "#059669", bg: "#f0fdf4" },
];

// Categories, not bug-tracker types. Nine, chosen so that every task that has
// actually come out of a call in the last month has one obvious home — and few
// enough that the filter is still worth using.
const TYPES = [
  { key: "LMS",         label: "LMS Build",       Icon: BookOpen,   color: "text-teal-700 bg-teal-50 border-teal-200"       },
  { key: "CRM",         label: "CRM Build",       Icon: Database,   color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
  { key: "CONTENT",     label: "Content",         Icon: Sparkles,   color: "text-violet-700 bg-violet-50 border-violet-200" },
  { key: "MARKETING",   label: "Marketing",       Icon: Megaphone,  color: "text-pink-700 bg-pink-50 border-pink-200"       },
  { key: "SALES",       label: "Sales",           Icon: Handshake,  color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { key: "PARTNERSHIP", label: "Partnerships",    Icon: Building2,  color: "text-cyan-700 bg-cyan-50 border-cyan-200"       },
  { key: "LEGAL",       label: "Legal & Finance", Icon: Scale,      color: "text-amber-700 bg-amber-50 border-amber-200"    },
  { key: "STUDENTS",    label: "Student Success", Icon: GraduationCap, color: "text-blue-700 bg-blue-50 border-blue-200"    },
  { key: "OPS",         label: "Ops",             Icon: Settings2,  color: "text-slate-600 bg-slate-100 border-slate-200"   },
];

const PRIORITIES = [
  { key: "LOW",    label: "Low",    dot: "bg-slate-400" },
  { key: "NORMAL", label: "Normal", dot: "bg-blue-400"  },
  { key: "HIGH",   label: "High",   dot: "bg-amber-500" },
  { key: "URGENT", label: "Urgent", dot: "bg-red-500"   },
];

function typeInfo(t: string) { return TYPES.find(x => x.key === t) ?? TYPES[4]; }
function priorityInfo(p: string) { return PRIORITIES.find(x => x.key === p) ?? PRIORITIES[1]; }

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const { Icon, label, color } = typeInfo(type);
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${color}`}>
      <Icon size={9} />
      {label}
    </span>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  const { dot } = priorityInfo(priority);
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} title={priorityInfo(priority).label} />;
}

function avatarInitials(email: string | null, team: TeamMember[]) {
  const m = team.find(t => t.email === email);
  if (!m) return email?.[0]?.toUpperCase() ?? "?";
  return (m.name ?? m.email).split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function avatarLabel(email: string | null, team: TeamMember[]) {
  const m = team.find(t => t.email === email);
  return m?.name ?? email ?? "Unassigned";
}

// ─── Issue card ───────────────────────────────────────────────────────────────

interface CardProps {
  issue:    CrmIssue;
  team:     TeamMember[];
  onEdit:   (issue: CrmIssue) => void;
  onDelete: (id: string) => void;
  onMove:   (id: string, status: string) => void;
}

function IssueCard({ issue, team, onEdit, onDelete, onMove }: CardProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className="rounded-xl border bg-white shadow-sm p-3.5 space-y-2.5 hover:shadow-md transition-shadow"
      style={{ borderColor: "#e4e0d6" }}
    >
      {/* Top row: priority + type */}
      <div className="flex items-center gap-2">
        <PriorityDot priority={issue.priority} />
        <TypeBadge type={issue.type} />
        <div className="flex-1" />
        {/* Move dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(v => !v)}
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded border hover:bg-slate-50 transition flex items-center gap-1"
            style={{ color: "#949598", borderColor: "#e4e0d6" }}
          >
            Move <ChevronDown size={10} />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-6 z-20 bg-white border border-[#e4e0d6] rounded-xl shadow-xl w-36 overflow-hidden">
              {COLUMNS.filter(c => c.key !== issue.status).map(c => (
                <button
                  key={c.key}
                  onClick={() => { onMove(issue.id, c.key); setShowMenu(false); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[#f8f6f1] transition font-medium"
                  style={{ color: c.color }}
                >
                  → {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Title */}
      <p className="text-sm font-semibold leading-snug" style={{ color: "#14211f" }}>
        {issue.title}
      </p>

      {/* Description snippet */}
      {issue.description && (
        <p className="text-xs line-clamp-2" style={{ color: "#949598" }}>
          {issue.description}
        </p>
      )}

      {/* Tags */}
      {issue.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {issue.tags.map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: "#edf5f4", color: "#086c64" }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {issue.source && (
        <p className="text-[10px] truncate mb-1.5" style={{ color: "#c9c4b8" }} title={issue.source}>
          from {issue.source}
        </p>
      )}

      {/* Footer: assignee + linked lead + actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-[#f1efe8]">
        {issue.assignee ? (
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
            style={{ background: "#086c64" }}
            title={avatarLabel(issue.assignee, team)}>
            {avatarInitials(issue.assignee, team)}
          </div>
        ) : (
          <div className="w-5 h-5 rounded-full border border-dashed border-[#c9c4b8] flex items-center justify-center flex-shrink-0"
            title="Unassigned">
            <User size={9} style={{ color: "#c9c4b8" }} />
          </div>
        )}

        {/* Who else is waiting on this. Recorded, not notified — the point is
            that you can see at a glance who to tell when it moves. */}
        {issue.notify?.length > 0 && (
          <span className="text-[10px] flex-shrink-0" style={{ color: "#949598" }}
                title={`Keep informed: ${issue.notify.join(", ")}`}>
            +{issue.notify.length}
          </span>
        )}

        {/* Due date beats created date for anything with one — an overdue task
            has to be readable without opening the card. */}
        {/* One line, three possible dates: closed once it is done, otherwise
            due, otherwise when it landed. Hover for all three. */}
        {(() => {
          const d = (x: string) => new Date(x).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const overdue = !!issue.dueAt && new Date(issue.dueAt) < new Date() && issue.status !== "DONE";
          const label = issue.status === "DONE" && issue.closedAt ? `Closed ${d(issue.closedAt)}`
            : issue.dueAt ? `${overdue ? "Overdue · " : "Due "}${d(issue.dueAt)}`
            : `Added ${d(issue.createdAt)}`;
          const title = [
            `Added ${d(issue.createdAt)}`,
            issue.dueAt ? `Needed by ${d(issue.dueAt)}` : "No due date",
            issue.closedAt ? `Closed ${d(issue.closedAt)}` : null,
          ].filter(Boolean).join(" · ");
          return (
            <span className="text-[10px] flex-1 truncate" title={title}
              style={{ color: overdue ? "#dc2626" : issue.status === "DONE" ? "#059669" : "#c9c4b8", fontWeight: overdue ? 700 : 400 }}>
              {label}
            </span>
          );
        })()}

        {issue.linkedLeadId && (
          <Link href={`/leads/${issue.linkedLeadId}`}
            className="p-1 rounded hover:bg-[#edf5f4] transition"
            title="View linked lead">
            <ExternalLink size={11} style={{ color: "#086c64" }} />
          </Link>
        )}

        <button onClick={() => onEdit(issue)}
          className="p-1 rounded hover:bg-[#f1efe8] transition" title="Edit">
          <Pencil size={11} style={{ color: "#949598" }} />
        </button>

        <button onClick={() => onDelete(issue.id)}
          className="p-1 rounded hover:bg-red-50 transition" title="Delete">
          <Trash2 size={11} style={{ color: "#c9c4b8" }} />
        </button>
      </div>
    </div>
  );
}

// ─── Issue form ───────────────────────────────────────────────────────────────

interface FormProps {
  initial?: CrmIssue | null;
  team:     TeamMember[];
  onSave:   (data: Partial<CrmIssue>) => Promise<void>;
  onClose:  () => void;
  saving:   boolean;
}

function IssueForm({ initial, team, onSave, onClose, saving }: FormProps) {
  const [title,       setTitle]       = useState(initial?.title       ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type,        setType]        = useState(initial?.type        ?? "OPS");
  const [priority,    setPriority]    = useState(initial?.priority    ?? "NORMAL");
  const [assignee,    setAssignee]    = useState(initial?.assignee    ?? "");
  const [tagInput,    setTagInput]    = useState("");
  const [tags,        setTags]        = useState<string[]>(initial?.tags ?? []);
  const [linkedLeadId, setLinkedLeadId] = useState(initial?.linkedLeadId ?? "");
  const [dueAt,       setDueAt]       = useState(initial?.dueAt ? initial.dueAt.slice(0, 10) : "");
  const [notify,      setNotify]      = useState<string[]>(initial?.notify ?? []);
  const [source,      setSource]      = useState(initial?.source ?? "");

  function addTag(e: React.KeyboardEvent) {
    if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
      e.preventDefault();
      const t = tagInput.trim().toLowerCase();
      if (!tags.includes(t)) setTags(prev => [...prev, t]);
      setTagInput("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#e4e0d6] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e4e0d6]"
          style={{ background: "#f8f6f1" }}>
          <div className="flex items-center gap-2">
            <ListChecks size={16} style={{ color: "#086c64" }} />
            <h2 className="text-sm font-bold" style={{ color: "#14211f" }}>
              {initial ? "Edit issue" : "New CRM issue"}
            </h2>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#e4e0d6] transition">
            <X size={14} style={{ color: "#949598" }} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Title */}
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#5a6663" }}>Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What's the issue?"
              className="w-full px-3 py-2 border border-[#e4e0d6] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
              style={{ color: "#14211f" }}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#5a6663" }}>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Steps to reproduce, context, links…"
              rows={3}
              className="w-full px-3 py-2 border border-[#e4e0d6] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#086c64]/40 resize-none"
              style={{ color: "#14211f" }}
            />
          </div>

          {/* Type + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "#5a6663" }}>Type</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="w-full text-sm border border-[#e4e0d6] rounded-xl px-3 py-2 bg-white focus:outline-none"
                style={{ color: "#14211f" }}>
                {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "#5a6663" }}>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}
                className="w-full text-sm border border-[#e4e0d6] rounded-xl px-3 py-2 bg-white focus:outline-none"
                style={{ color: "#14211f" }}>
                {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {/* Assignee */}
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#5a6663" }}>Assign to</label>
            <select value={assignee} onChange={e => setAssignee(e.target.value)}
              className="w-full text-sm border border-[#e4e0d6] rounded-xl px-3 py-2 bg-white focus:outline-none"
              style={{ color: "#14211f" }}>
              <option value="">Unassigned</option>
              {team.map(m => <option key={m.email} value={m.email}>{m.name ?? m.email}</option>)}
            </select>
          </div>

          {/* Due date + who wants to hear about progress */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "#5a6663" }}>Due date</label>
              <input type="date" value={dueAt} onChange={e => setDueAt(e.target.value)}
                className="w-full text-sm border border-[#e4e0d6] rounded-xl px-3 py-2 bg-white focus:outline-none"
                style={{ color: "#14211f" }} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "#5a6663" }}>Keep informed</label>
              <select value="" onChange={e => { const v = e.target.value; if (v && !notify.includes(v)) setNotify([...notify, v]); }}
                className="w-full text-sm border border-[#e4e0d6] rounded-xl px-3 py-2 bg-white focus:outline-none"
                style={{ color: "#14211f" }}>
                <option value="">Add someone…</option>
                {team.filter(t => t.email !== assignee && !notify.includes(t.email))
                     .map(t => <option key={t.email} value={t.email}>{t.name ?? t.email}</option>)}
              </select>
              {notify.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {notify.map(n => (
                    <button key={n} onClick={() => setNotify(notify.filter(x => x !== n))}
                      className="text-[10px] px-2 py-0.5 rounded-full border"
                      style={{ borderColor: "#e4e0d6", color: "#5a6663", background: "#f8f6f1" }}>
                      {team.find(t => t.email === n)?.name ?? n} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Where it came from */}
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#5a6663" }}>
              Source <span className="font-normal text-[10px]">(which call or conversation)</span>
            </label>
            <input value={source} onChange={e => setSource(e.target.value)}
              placeholder="Team call 2026-09-10"
              className="w-full text-sm border border-[#e4e0d6] rounded-xl px-3 py-2 bg-white focus:outline-none"
              style={{ color: "#14211f" }} />
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#5a6663" }}>
              Tags <span className="font-normal text-[10px]">(Enter or comma to add)</span>
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: "#edf5f4", color: "#086c64" }}>
                  {tag}
                  <button onClick={() => setTags(prev => prev.filter(t => t !== tag))}>
                    <X size={9} />
                  </button>
                </span>
              ))}
            </div>
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={addTag}
              placeholder="Add a tag…"
              className="w-full px-3 py-2 border border-[#e4e0d6] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
              style={{ color: "#14211f" }}
            />
          </div>

          {/* Linked lead ID */}
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#5a6663" }}>
              Linked Lead ID <span className="font-normal text-[10px]">(optional — paste from the URL)</span>
            </label>
            <input
              value={linkedLeadId}
              onChange={e => setLinkedLeadId(e.target.value)}
              placeholder="cj…"
              className="w-full px-3 py-2 border border-[#e4e0d6] rounded-xl text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
              style={{ color: "#14211f" }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#e4e0d6]"
          style={{ background: "#f8f6f1" }}>
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-[#e4e0d6] hover:bg-[#e4e0d6] transition"
            style={{ color: "#5a6663" }}>
            Cancel
          </button>
          <button
            onClick={() => onSave({ title, description: description || null, type, priority, assignee: assignee || null, tags, linkedLeadId: linkedLeadId || null, dueAt: dueAt || null, notify, source: source || null })}
            disabled={!title.trim() || saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50 flex items-center gap-2"
            style={{ background: "#086c64" }}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            {initial ? "Save changes" : "Create task"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IssuesPage() {
  const { success, error: toastError } = useToast();
  const [issues,  setIssues]  = useState<CrmIssue[]>([]);
  const [team,    setTeam]    = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  // Done collapses by default — it only grows, and a column you scroll past is
  // a column that makes the other three harder to read.
  const [doneOpen, setDoneOpen] = useState(false);
  // The "don't miss things" control: one click to see only what is late or
  // landing this week, across every column.
  const [focus, setFocus] = useState<"" | "OVERDUE" | "WEEK" | "UNDATED">("");
  const [filterSource, setFilterSource] = useState("");
  const [filterType,     setFilterType]     = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");

  // Form state
  const [showForm,   setShowForm]   = useState(false);
  const [editTarget, setEditTarget] = useState<CrmIssue | null>(null);
  const [saving,     setSaving]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [issuesRes, usersRes] = await Promise.all([
      fetch("/api/crm/crm-issues"),
      fetch("/api/crm/users"),
    ]);
    if (issuesRes.ok) setIssues(await issuesRes.json());
    if (usersRes.ok)  setTeam(await usersRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filtered view
  const nowMs = Date.now();
  const weekMs = nowMs + 7 * 86400000;
  const dueMs = (i: CrmIssue) => (i.dueAt ? new Date(i.dueAt).getTime() : null);

  const overdueCount = issues.filter(i => i.status !== "DONE" && (dueMs(i) ?? Infinity) < nowMs).length;
  const weekCount    = issues.filter(i => i.status !== "DONE" && (dueMs(i) ?? Infinity) >= nowMs && (dueMs(i) ?? Infinity) <= weekMs).length;
  const undatedCount = issues.filter(i => i.status !== "DONE" && !i.dueAt).length;
  const sources = Array.from(new Set(issues.map(i => i.source).filter((x): x is string => !!x))).sort();

  const filtered = issues.filter(i => {
    if (filterSource && i.source !== filterSource) return false;
    if (focus === "OVERDUE" && !(i.status !== "DONE" && (dueMs(i) ?? Infinity) < nowMs)) return false;
    if (focus === "WEEK"    && !(i.status !== "DONE" && (dueMs(i) ?? Infinity) >= nowMs && (dueMs(i) ?? Infinity) <= weekMs)) return false;
    if (focus === "UNDATED" && !(i.status !== "DONE" && !i.dueAt)) return false;
    if (filterType     && i.type     !== filterType)     return false;
    if (filterPriority && i.priority !== filterPriority) return false;
    if (filterAssignee && i.assignee !== filterAssignee) return false;
    return true;
  });

  async function handleSave(data: Partial<CrmIssue>) {
    setSaving(true);
    try {
      if (editTarget) {
        const res = await fetch(`/api/crm/crm-issues/${editTarget.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error();
        success("Issue updated");
      } else {
        const res = await fetch("/api/crm/crm-issues", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error();
        success("Issue created");
      }
      setShowForm(false); setEditTarget(null); load();
    } catch { toastError("Failed to save issue"); }
    finally { setSaving(false); }
  }

  async function handleMove(id: string, status: string) {
    setIssues(prev => prev.map(i => i.id === id ? { ...i, status } : i));
    try {
      await fetch(`/api/crm/crm-issues/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch { toastError("Failed to move issue"); load(); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this issue? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/crm/crm-issues/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setIssues(prev => prev.filter(i => i.id !== id));
      success("Task deleted");
    } catch { toastError("Failed to delete issue"); }
  }

  const totalOpen = issues.filter(i => i.status !== "DONE").length;
  const urgent    = issues.filter(i => i.priority === "URGENT" && i.status !== "DONE").length;

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-up">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#949598" }}>Vantage Career Accelerator</p>
          <div className="flex items-center gap-2 mb-1">
            <ListChecks size={18} style={{ color: "#086c64" }} />
            <h1 className="text-xl font-display font-semibold" style={{ color: "#14211f" }}>Tasks</h1>
            {urgent > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">
                <AlertTriangle size={9} /> {urgent} urgent
              </span>
            )}
          </div>
          <p className="text-sm" style={{ color: "#949598" }}>
            Everything the team is working on that is not tied to one lead.
            {!loading && ` ${totalOpen} open`}
          </p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition"
          style={{ background: "#086c64" }}
        >
          <Plus size={15} /> New task
        </button>
      </div>

      {/* Focus bar — the answer to "make sure I don't miss things". One click
          cuts the board to what is late or landing this week, across every
          column, so nothing hides at the bottom of Backlog. */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {([
          { key: "OVERDUE" as const, label: "Overdue",      n: overdueCount, fg: "#b91c1c", bg: "#fef2f2", br: "#fecaca" },
          { key: "WEEK"    as const, label: "Due this week", n: weekCount,    fg: "#b45309", bg: "#fffbeb", br: "#fde68a" },
          { key: "UNDATED" as const, label: "No date",      n: undatedCount, fg: "#5a6663", bg: "#f8f6f1", br: "#e4e0d6" },
        ]).map(b => (
          <button key={b.key}
            onClick={() => setFocus(focus === b.key ? "" : b.key)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition"
            style={focus === b.key
              ? { background: b.fg, borderColor: b.fg, color: "#fff" }
              : { background: b.bg, borderColor: b.br, color: b.fg }}>
            {b.key === "OVERDUE" ? <AlertTriangle size={12} /> : <CalendarClock size={12} />}
            {b.label}
            <span className="tabular-nums">{b.n}</span>
          </button>
        ))}
        {focus && (
          <button onClick={() => setFocus("")} className="text-xs font-semibold underline underline-offset-2" style={{ color: "#949598" }}>
            show everything
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {sources.length > 0 && (
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
            className="text-xs font-medium border border-[#e4e0d6] rounded-lg px-3 py-1.5 bg-white focus:outline-none"
            style={{ color: "#5a6663" }}>
            <option value="">All sources</option>
            {sources.map(src => <option key={src} value={src}>{src}</option>)}
          </select>
        )}
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="text-xs font-medium border border-[#e4e0d6] rounded-lg px-3 py-1.5 bg-white focus:outline-none"
          style={{ color: "#5a6663" }}>
          <option value="">All categories</option>
          {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>

        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          className="text-xs font-medium border border-[#e4e0d6] rounded-lg px-3 py-1.5 bg-white focus:outline-none"
          style={{ color: "#5a6663" }}>
          <option value="">All priorities</option>
          {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>

        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
          className="text-xs font-medium border border-[#e4e0d6] rounded-lg px-3 py-1.5 bg-white focus:outline-none"
          style={{ color: "#5a6663" }}>
          <option value="">Everyone</option>
          {team.map(m => <option key={m.email} value={m.email}>{m.name ?? m.email}</option>)}
        </select>

        {(filterType || filterPriority || filterAssignee) && (
          <button onClick={() => { setFilterType(""); setFilterPriority(""); setFilterAssignee(""); }}
            className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
            <X size={11} /> Clear filters
          </button>
        )}
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 size={24} className="animate-spin" style={{ color: "#949598" }} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUMNS.map(col => {
            const RANK: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
            const colIssues = filtered
              .filter(i => i.status === col.key)
              // Dated work first, soonest at the top — an undated backlog item
              // should never sit above something due tomorrow.
              .sort((a, b) => {
                const da = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
                const db = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
                if (da !== db) return da - db;
                return (RANK[a.priority] ?? 2) - (RANK[b.priority] ?? 2);
              });
            const isDone = col.key === "DONE";
            const collapsed = isDone && !doneOpen;
            return (
              <div key={col.key}>
                {/* Column header */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <button
                    onClick={() => isDone && setDoneOpen(v => !v)}
                    className={`flex items-center gap-2 ${isDone ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: col.color }}>
                      {col.label}
                    </span>
                    {isDone && (
                      <ChevronDown size={12} style={{ color: col.color, transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform .15s" }} />
                    )}
                  </button>
                  <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: col.bg, color: col.color }}>
                    {colIssues.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="space-y-2.5 min-h-[60px]">
                  {collapsed ? (
                    <button onClick={() => setDoneOpen(true)}
                      className="w-full rounded-xl border border-dashed border-[#e4e0d6] py-3 text-[11px] font-semibold hover:bg-[#f8f6f1] transition"
                      style={{ color: "#949598" }}>
                      {colIssues.length} done · show
                    </button>
                  ) : colIssues.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#e4e0d6] h-16 flex items-center justify-center">
                      <span className="text-[11px]" style={{ color: "#c9c4b8" }}>Empty</span>
                    </div>
                  ) : colIssues.map(issue => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      team={team}
                      onEdit={i => { setEditTarget(i); setShowForm(true); }}
                      onDelete={handleDelete}
                      onMove={handleMove}
                    />
                  ))}
                </div>

                {/* Quick add for Backlog */}
                {col.key === "BACKLOG" && (
                  <button
                    onClick={() => { setEditTarget(null); setShowForm(true); }}
                    className="mt-2.5 w-full flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border border-dashed border-[#e4e0d6] hover:border-[#086c64] hover:bg-[#edf5f4] transition"
                    style={{ color: "#949598" }}>
                    <Plus size={12} /> New issue
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <IssueForm
          initial={editTarget}
          team={team}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          saving={saving}
        />
      )}
    </div>
  );
}
