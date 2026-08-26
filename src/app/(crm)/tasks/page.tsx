"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CheckCircle2, Circle, AlertCircle, Clock, Loader2, Phone, X, Send, Plus, Search, Pencil, Trash2, Check, UserCircle2 } from "lucide-react";
import { stageInfo } from "@/components/crm/constants";
import { useToast } from "@/lib/toast";

interface Task {
  id: string; title: string; notes: string | null; dueAt: string | null;
  completedAt: string | null; createdAt: string; assignedTo: string | null;
  lead: { id: string; firstName: string; lastName: string; stage: string };
}

interface AdminUser { id: string; name: string | null; email: string; }
interface LeadOption { id: string; firstName: string; lastName: string; company: string | null; stage: string; }

function dueLabel(dueAt: string | null) {
  if (!dueAt) return null;
  const d   = new Date(dueAt);
  const now = new Date();
  // Compare calendar dates in local timezone to avoid UTC-offset "overdue" bugs
  const dCal   = new Date(d.getFullYear(),   d.getMonth(),   d.getDate());
  const nowCal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days   = Math.round((dCal.getTime() - nowCal.getTime()) / 86400000);
  if (days < 0)   return { text: "Overdue",  cls: "text-red-600 bg-red-50 border-red-200" };
  if (days === 0) return { text: "Today",    cls: "text-amber-600 bg-amber-50 border-amber-200" };
  if (days === 1) return { text: "Tomorrow", cls: "text-blue-600 bg-blue-50 border-blue-200" };
  return { text: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), cls: "border-[#e4e0d6]", style: { color: "#949598", background: "#f8f6f1" } };
}

export default function TasksPage() {
  const { success, error: toastError } = useToast();
  const { data: session } = useSession();
  const myEmail = session?.user?.email ?? "";
  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [admins,  setAdmins]  = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigneeFilter, setAssigneeFilter] = useState<"all" | "mine" | "unassigned">("all");

  const [logTarget, setLogTarget] = useState<{ taskId: string; leadId: string; name: string } | null>(null);
  const [callNote,  setCallNote]  = useState("");
  const [logging,   setLogging]   = useState(false);

  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editTitle,    setEditTitle]    = useState("");
  const [editNotes,    setEditNotes]    = useState("");
  const [editDueAt,    setEditDueAt]    = useState("");
  const [editAssigned, setEditAssigned] = useState("");
  const [editSaving,   setEditSaving]   = useState(false);

  const [showNewTask,    setShowNewTask]    = useState(false);
  const [taskTitle,      setTaskTitle]      = useState("");
  const [taskDue,        setTaskDue]        = useState("");
  const [leadQuery,      setLeadQuery]      = useState("");
  const [leadOptions,    setLeadOptions]    = useState<LeadOption[]>([]);
  const [selectedLead,   setSelectedLead]   = useState<LeadOption | null>(null);
  const [searchingLeads, setSearchingLeads] = useState(false);
  const [creatingTask,   setCreatingTask]   = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openNewTask() {
    setShowNewTask(true); setTaskTitle(""); setTaskDue("");
    setLeadQuery(""); setLeadOptions([]); setSelectedLead(null);
  }

  function onLeadQueryChange(q: string) {
    setLeadQuery(q);
    setSelectedLead(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setLeadOptions([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearchingLeads(true);
      const res  = await fetch(`/api/crm/leads?q=${encodeURIComponent(q.trim())}&all=true`);
      const data = await res.json();
      const arr  = Array.isArray(data) ? data : (data.leads ?? []);
      setLeadOptions(arr.slice(0, 6));
      setSearchingLeads(false);
    }, 300);
  }

  async function createTask() {
    if (!taskTitle.trim() || !selectedLead) return;
    setCreatingTask(true);
    try {
      const res = await fetch(`/api/crm/leads/${selectedLead.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: taskTitle.trim(), dueAt: taskDue || null }),
      });
      if (!res.ok) throw new Error("Failed");
      success("Task created ✓");
      setShowNewTask(false);
      load();
    } catch {
      toastError("Failed to create task");
    } finally {
      setCreatingTask(false);
    }
  }

  const load = useCallback(async () => {
    const res  = await fetch("/api/crm/tasks");
    const data = await res.json();
    if (Array.isArray(data)) setTasks(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/crm/users").then(r => r.json()).then(d => {
      if (Array.isArray(d)) setAdmins(d);
    }).catch(() => {});
  }, []);

  async function complete(taskId: string) {
    await fetch(`/api/crm/tasks/${taskId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completedAt: new Date().toISOString() }),
    });
    setTasks(t => t.filter(x => x.id !== taskId));
    success("Task completed ✓");
  }

  function openEdit(task: Task) {
    setLogTarget(null);
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditNotes(task.notes ?? "");
    setEditDueAt(task.dueAt ? new Date(task.dueAt).toISOString().split("T")[0] : "");
    setEditAssigned(task.assignedTo ?? "");
  }

  async function saveEdit(taskId: string) {
    if (!editTitle.trim()) return;
    setEditSaving(true);
    const res = await fetch(`/api/crm/tasks/${taskId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:      editTitle.trim(),
        notes:      editNotes || null,
        dueAt:      editDueAt || null,
        assignedTo: editAssigned || null,
      }),
    });
    if (res.ok) {
      setEditingId(null);
      await load();
      success("Task updated.");
    } else { toastError("Failed to update task"); }
    setEditSaving(false);
  }

  async function deleteTask(taskId: string) {
    await fetch(`/api/crm/tasks/${taskId}`, { method: "DELETE" });
    setTasks(t => t.filter(x => x.id !== taskId));
    success("Task deleted.");
  }

  function adminName(email: string | null) {
    if (!email) return null;
    const u = admins.find(a => a.email === email);
    return u?.name ?? email;
  }

  async function logCall() {
    if (!logTarget || !callNote.trim()) return;
    setLogging(true);
    try {
      const res = await fetch(`/api/crm/leads/${logTarget.leadId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "CALL", content: callNote.trim() }),
      });
      if (res.ok) {
        success(`Call logged for ${logTarget.name} ✓`);
        setLogTarget(null);
        setCallNote("");
      } else {
        toastError("Failed to log call");
      }
    } finally {
      setLogging(false);
    }
  }

  const startOfToday   = new Date(new Date().toDateString()); // midnight today
  const startOfTomorrow = new Date(startOfToday.getTime() + 86400000);
  // Mutually exclusive: overdue = before midnight today, today = midnight→midnight
  const visibleTasks = tasks.filter(t => {
    if (assigneeFilter === "mine")       return t.assignedTo === myEmail;
    if (assigneeFilter === "unassigned") return !t.assignedTo;
    return true;
  });
  const overdue  = visibleTasks.filter(t => t.dueAt && new Date(t.dueAt) < startOfToday);
  const today    = visibleTasks.filter(t => {
    if (!t.dueAt) return false;
    const d = new Date(t.dueAt);
    return d >= startOfToday && d < startOfTomorrow;
  });
  const upcoming = visibleTasks.filter(t => {
    if (!t.dueAt) return false;
    return new Date(t.dueAt) >= startOfTomorrow;
  });
  const noDue    = visibleTasks.filter(t => !t.dueAt);

  const Section = ({ label, items, accentStyle }: { label: string; items: Task[]; accentStyle: React.CSSProperties }) =>
    items.length === 0 ? null : (
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest mb-3 px-1" style={{ ...accentStyle, letterSpacing: "0.14em" }}>
          {label} · {items.length}
        </p>
        <div className="space-y-2">
          {items.map(task => {
            const due       = dueLabel(task.dueAt);
            const stage     = stageInfo(task.lead.stage);
            const isLogging = logTarget?.taskId === task.id;
            const isEditing = editingId === task.id;
            const assignee  = adminName(task.assignedTo);
            return (
              <div key={task.id} className="card overflow-hidden transition-shadow hover:shadow-md">
                <div className="flex items-center gap-4 px-5 py-4 group">
                  <button onClick={() => complete(task.id)}
                    className="flex-shrink-0 transition"
                    style={{ color: "#c9c4b8" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#16a34a")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#c9c4b8")}
                  >
                    <Circle size={18} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "#14211f" }}>{task.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <Link href={`/leads/${task.lead.id}`}
                        className="text-xs font-medium transition"
                        style={{ color: "#086c64" }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                      >
                        {task.lead.firstName} {task.lead.lastName}
                      </Link>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${stage.color}`}>
                        {stage.label}
                      </span>
                      {task.notes && (
                        <span className="text-[10px] truncate max-w-[160px]" style={{ color: "#949598" }} title={task.notes}>{task.notes}</span>
                      )}
                      {assignee && (
                        <span className="text-[10px] flex items-center gap-0.5 flex-shrink-0" style={{ color: "#949598" }}>
                          <UserCircle2 size={9} /> {assignee}
                        </span>
                      )}
                    </div>
                  </div>
                  {due && (
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-full border flex-shrink-0 ${due.cls}`} style={(due as { style?: React.CSSProperties }).style}>
                      {due.text}
                    </span>
                  )}
                  {/* Edit + Delete — appear on hover */}
                  <button
                    onClick={() => { if (isEditing) { setEditingId(null); } else { setLogTarget(null); openEdit(task); } }}
                    title="Edit task"
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition p-1 rounded-lg"
                    style={{ color: isEditing ? "#086c64" : "#c9c4b8" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#086c64")}
                    onMouseLeave={e => (e.currentTarget.style.color = isEditing ? "#086c64" : "#c9c4b8")}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => deleteTask(task.id)}
                    title="Delete task"
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition p-1 rounded-lg"
                    style={{ color: "#c9c4b8" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#dc2626")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#c9c4b8")}
                  >
                    <Trash2 size={13} />
                  </button>
                  <button
                    onClick={() => {
                      if (isLogging) { setLogTarget(null); setCallNote(""); }
                      else { setEditingId(null); setLogTarget({ taskId: task.id, leadId: task.lead.id, name: `${task.lead.firstName} ${task.lead.lastName}` }); setCallNote(""); }
                    }}
                    title="Log a call"
                    className={`flex-shrink-0 flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition border ${
                      isLogging ? "border-[#e4e0d6]" : "border-transparent"
                    }`}
                    style={isLogging ? { background: "#edf5f4", color: "#086c64" } : { color: "#949598" }}
                    onMouseEnter={e => { if (!isLogging) { (e.currentTarget as HTMLButtonElement).style.background = "#edf5f4"; (e.currentTarget as HTMLButtonElement).style.color = "#086c64"; } }}
                    onMouseLeave={e => { if (!isLogging) { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#949598"; } }}
                  >
                    <Phone size={11} /> Call
                  </button>
                </div>

                {/* Inline edit panel */}
                {isEditing && (
                  <div className="border-t px-5 py-4 space-y-3" style={{ borderColor: "#086c64", borderLeftWidth: 2, borderLeftColor: "#086c64", background: "#f0faf9" }}>
                    <input
                      autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === "Escape") setEditingId(null); }}
                      className="w-full px-3 py-2 text-sm rounded-xl bg-white focus:outline-none"
                      style={{ border: "1px solid #e4e0d6" }}
                    />
                    <input
                      value={editNotes} onChange={e => setEditNotes(e.target.value)}
                      placeholder="Notes (optional)…"
                      className="w-full px-3 py-2 text-sm rounded-xl bg-white focus:outline-none"
                      style={{ border: "1px solid #e4e0d6" }}
                    />
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 flex-1">
                        <Clock size={12} style={{ color: "#949598" }} />
                        <input type="date" value={editDueAt} onChange={e => setEditDueAt(e.target.value)}
                          className="text-xs rounded-lg px-2 py-1.5 bg-white focus:outline-none"
                          style={{ border: "1px solid #e4e0d6" }} />
                      </div>
                      {admins.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-1">
                          <UserCircle2 size={12} style={{ color: "#949598", flexShrink: 0 }} />
                          <select value={editAssigned} onChange={e => setEditAssigned(e.target.value)}
                            className="text-xs rounded-lg px-2 py-1.5 bg-white focus:outline-none w-full"
                            style={{ border: "1px solid #e4e0d6" }}>
                            <option value="">Unassigned</option>
                            {admins.map(u => (
                              <option key={u.id} value={u.email}>{u.name ?? u.email}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => saveEdit(task.id)} disabled={editSaving || !editTitle.trim()}
                        className="flex items-center gap-1.5 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition disabled:opacity-40"
                        style={{ background: "#086c64" }}>
                        {editSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-xl transition"
                        style={{ color: "#949598" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "#14211f")}
                        onMouseLeave={e => (e.currentTarget.style.color = "#949598")}>
                        <X size={11} /> Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Inline call log panel */}
                {isLogging && (
                  <div className="border-t px-5 py-3" style={{ borderColor: "#e4e0d6", background: "#f8f6f1" }}>
                    <p className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: "#086c64" }}>
                      <Phone size={11} /> Log call with {logTarget.name}
                    </p>
                    <div className="flex gap-2">
                      <textarea
                        value={callNote}
                        onChange={e => setCallNote(e.target.value)}
                        placeholder="What did you discuss? Outcome, next steps…"
                        rows={2}
                        autoFocus
                        className="flex-1 text-xs rounded-xl px-3 py-2 resize-none bg-white focus:outline-none"
                        style={{ border: "1px solid #e4e0d6" }}
                        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) logCall(); }}
                      />
                      <div className="flex flex-col gap-1.5">
                        <button
                          onClick={logCall}
                          disabled={!callNote.trim() || logging}
                          className="flex items-center gap-1 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl transition disabled:opacity-40"
                          style={{ background: "#086c64" }}
                        >
                          {logging ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                          Log
                        </button>
                        <button
                          onClick={() => { setLogTarget(null); setCallNote(""); }}
                          className="flex items-center justify-center p-1.5 rounded-xl transition"
                          style={{ color: "#c9c4b8" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#5a6663"; (e.currentTarget as HTMLButtonElement).style.background = "#f1efe8"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#c9c4b8"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] mt-1.5" style={{ color: "#949598" }}>⌘↵ to save · logged as a CALL activity on this lead</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );

  return (
    <>
    <div className="max-w-3xl mx-auto p-6 sm:p-8 space-y-8 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#949598", letterSpacing: "0.14em" }}>Vantage Career Accelerator</p>
          <h1 className="font-display font-semibold leading-tight" style={{ fontSize: "1.75rem", color: "#14211f" }}>Tasks</h1>
          <div className="flex items-center gap-2 mt-1.5">
            <p className="text-sm" style={{ color: "#949598" }}>{visibleTasks.length} open task{visibleTasks.length !== 1 ? "s" : ""}</p>
            <div className="flex items-center gap-1 ml-1">
              {([
                { key: "all",        label: "All" },
                { key: "mine",       label: "Mine" },
                { key: "unassigned", label: "Unassigned" },
              ] as const).map(chip => (
                <button key={chip.key}
                  onClick={() => setAssigneeFilter(chip.key)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition ${
                    assigneeFilter === chip.key ? "border-transparent text-white" : "border-[#e4e0d6] hover:bg-[#f8f6f1]"
                  }`}
                  style={assigneeFilter === chip.key ? { background: "#086c64" } : { color: "#949598" }}>
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openNewTask}
            className="flex items-center gap-1.5 text-sm font-semibold text-white px-3 py-2 rounded-xl transition shadow-sm"
            style={{ background: "#086c64" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#084f4a")}
            onMouseLeave={e => (e.currentTarget.style.background = "#086c64")}
          >
            <Plus size={14} /> New Task
          </button>
          {overdue.length > 0 && (
            <div className="flex items-center gap-1.5 text-sm font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-xl border border-red-200">
              <AlertCircle size={14} /> {overdue.length} overdue
            </div>
          )}
          {today.length > 0 && (
            <div className="flex items-center gap-1.5 text-sm font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
              <Clock size={14} /> {today.length} due today
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin" style={{ color: "#c9c4b8" }} />
        </div>
      ) : tasks.length === 0 ? (
        <div className="card p-16 text-center">
          <CheckCircle2 size={32} className="mx-auto mb-3" style={{ color: "#086c64" }} />
          <p className="font-semibold mb-1" style={{ color: "#5a6663" }}>All caught up!</p>
          <p className="text-sm" style={{ color: "#949598" }}>No open tasks. Add tasks from any lead&apos;s detail page.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <Section label="Overdue"     items={overdue}  accentStyle={{ color: "#dc2626" }} />
          <Section label="Today"       items={today}    accentStyle={{ color: "#d97706" }} />
          <Section label="Upcoming"    items={upcoming} accentStyle={{ color: "#086c64" }} />
          <Section label="No due date" items={noDue}    accentStyle={{ color: "#949598" }} />
        </div>
      )}
    </div>

    {showNewTask && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" style={{ border: "1px solid #e4e0d6" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold" style={{ color: "#14211f" }}>New Task</h3>
            <button onClick={() => setShowNewTask(false)} className="p-1.5 rounded-xl transition" style={{ color: "#949598" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#f1efe8"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <X size={16} />
            </button>
          </div>

          <div className="mb-4">
            <label className="text-[9px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: "#949598", letterSpacing: "0.14em" }}>Task</label>
            <input
              autoFocus
              value={taskTitle}
              onChange={e => setTaskTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && taskTitle.trim() && selectedLead) createTask(); }}
              placeholder="e.g. Follow up on application"
              className="w-full px-3 py-2.5 text-sm rounded-xl focus:outline-none"
              style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
            />
          </div>

          <div className="mb-4">
            <label className="text-[9px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: "#949598", letterSpacing: "0.14em" }}>Lead</label>
            {selectedLead ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "#edf5f4", border: "1px solid #e4e0d6" }}>
                <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#086c64" }}>
                  <span className="text-white text-[9px] font-bold">{selectedLead.firstName[0]}{selectedLead.lastName[0]}</span>
                </div>
                <span className="text-sm font-semibold flex-1" style={{ color: "#14211f" }}>{selectedLead.firstName} {selectedLead.lastName}</span>
                <button onClick={() => { setSelectedLead(null); setLeadQuery(""); setLeadOptions([]); }}
                  style={{ color: "#949598" }}>
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#949598" }} />
                <input
                  value={leadQuery}
                  onChange={e => onLeadQueryChange(e.target.value)}
                  placeholder="Search by name, email, company…"
                  className="w-full pl-8 pr-3 py-2.5 text-sm rounded-xl focus:outline-none"
                  style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
                />
                {searchingLeads && (
                  <Loader2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: "#949598" }} />
                )}
                {leadOptions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg overflow-hidden z-10" style={{ border: "1px solid #e4e0d6" }}>
                    {leadOptions.map(lead => (
                      <button key={lead.id}
                        onClick={() => { setSelectedLead(lead); setLeadOptions([]); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition hover:bg-[#f8f6f1]">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#086c64" }}>
                          <span className="text-white text-[9px] font-bold">{lead.firstName[0]}{lead.lastName[0]}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "#14211f" }}>{lead.firstName} {lead.lastName}</p>
                          {lead.company && <p className="text-xs" style={{ color: "#949598" }}>{lead.company}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mb-5">
            <label className="text-[9px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: "#949598", letterSpacing: "0.14em" }}>
              Due date <span className="font-normal">(optional)</span>
            </label>
            <input
              type="date"
              value={taskDue}
              onChange={e => setTaskDue(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl focus:outline-none"
              style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
            />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setShowNewTask(false)}
              className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl transition"
              style={{ background: "#f1efe8", color: "#5a6663" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#e4e0d6")}
              onMouseLeave={e => (e.currentTarget.style.background = "#f1efe8")}
            >
              Cancel
            </button>
            <button
              onClick={createTask}
              disabled={!taskTitle.trim() || !selectedLead || creatingTask}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-40"
              style={{ background: "#086c64" }}
              onMouseEnter={e => { if (!creatingTask) (e.currentTarget as HTMLButtonElement).style.background = "#084f4a"; }}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "#086c64"}
            >
              {creatingTask ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Create Task
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
