"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, AlertCircle, Clock, Loader2, Phone, X, Send, Plus, Search } from "lucide-react";
import { stageInfo } from "@/components/crm/constants";
import { useToast } from "@/lib/toast";

interface Task {
  id: string; title: string; notes: string | null; dueAt: string | null;
  completedAt: string | null; createdAt: string;
  lead: { id: string; firstName: string; lastName: string; stage: string };
}

interface LeadOption { id: string; firstName: string; lastName: string; company: string | null; stage: string; }

function dueLabel(dueAt: string | null) {
  if (!dueAt) return null;
  const d    = new Date(dueAt);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0)   return { text: "Overdue",  cls: "text-red-600 bg-red-50 border-red-200" };
  if (days === 0) return { text: "Today",    cls: "text-amber-600 bg-amber-50 border-amber-200" };
  if (days === 1) return { text: "Tomorrow", cls: "text-blue-600 bg-blue-50 border-blue-200" };
  return { text: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), cls: "text-slate-500 bg-slate-50 border-slate-200" };
}

export default function TasksPage() {
  const { success, error: toastError } = useToast();
  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Quick call log state
  const [logTarget, setLogTarget] = useState<{ taskId: string; leadId: string; name: string } | null>(null);
  const [callNote,  setCallNote]  = useState("");
  const [logging,   setLogging]   = useState(false);

  // New task modal state
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
      const res  = await fetch(`/api/crm/leads?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      setLeadOptions(Array.isArray(data) ? data.slice(0, 6) : []);
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

  async function complete(taskId: string) {
    await fetch(`/api/crm/tasks/${taskId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completedAt: new Date().toISOString() }),
    });
    setTasks(t => t.filter(x => x.id !== taskId));
    success("Task completed ✓");
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

  const overdue  = tasks.filter(t => t.dueAt && new Date(t.dueAt) < new Date());
  const today    = tasks.filter(t => {
    if (!t.dueAt) return false;
    const d = new Date(t.dueAt); const n = new Date();
    return d.toDateString() === n.toDateString();
  });
  const upcoming = tasks.filter(t => {
    if (!t.dueAt) return false;
    const d = new Date(t.dueAt); const n = new Date();
    return d > n && d.toDateString() !== n.toDateString();
  });
  const noDue    = tasks.filter(t => !t.dueAt);

  const Section = ({ label, items, accent }: { label: string; items: Task[]; accent: string }) =>
    items.length === 0 ? null : (
      <div>
        <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${accent}`}>{label} · {items.length}</p>
        <div className="space-y-2">
          {items.map(task => {
            const due   = dueLabel(task.dueAt);
            const stage = stageInfo(task.lead.stage);
            const isLogging = logTarget?.taskId === task.id;
            return (
              <div key={task.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-shadow hover:shadow-md">
                <div className="flex items-center gap-4 px-5 py-4">
                  <button onClick={() => complete(task.id)}
                    className="text-slate-200 hover:text-emerald-500 transition flex-shrink-0">
                    <Circle size={18} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Link href={`/leads/${task.lead.id}`}
                        className="text-xs text-blue-600 hover:underline font-medium">
                        {task.lead.firstName} {task.lead.lastName}
                      </Link>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${stage.color}`}>
                        {stage.label}
                      </span>
                    </div>
                  </div>
                  {due && (
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-full border flex-shrink-0 ${due.cls}`}>
                      {due.text}
                    </span>
                  )}
                  {/* Quick call log button */}
                  <button
                    onClick={() => {
                      if (isLogging) { setLogTarget(null); setCallNote(""); }
                      else { setLogTarget({ taskId: task.id, leadId: task.lead.id, name: `${task.lead.firstName} ${task.lead.lastName}` }); setCallNote(""); }
                    }}
                    title="Log a call"
                    className={`flex-shrink-0 flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition border ${
                      isLogging
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "text-slate-400 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 border-transparent"
                    }`}
                  >
                    <Phone size={11} /> Call
                  </button>
                </div>

                {/* Inline call log panel */}
                {isLogging && (
                  <div className="border-t border-slate-100 bg-blue-50/40 px-5 py-3">
                    <p className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1.5">
                      <Phone size={11} /> Log call with {logTarget.name}
                    </p>
                    <div className="flex gap-2">
                      <textarea
                        value={callNote}
                        onChange={e => setCallNote(e.target.value)}
                        placeholder="What did you discuss? Outcome, next steps…"
                        rows={2}
                        autoFocus
                        className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-white"
                        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) logCall(); }}
                      />
                      <div className="flex flex-col gap-1.5">
                        <button
                          onClick={logCall}
                          disabled={!callNote.trim() || logging}
                          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl transition"
                        >
                          {logging ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                          Log
                        </button>
                        <button
                          onClick={() => { setLogTarget(null); setCallNote(""); }}
                          className="flex items-center justify-center p-1.5 rounded-xl text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5">⌘↵ to save · logged as a CALL activity on this lead</p>
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
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
          <p className="text-sm text-slate-500 mt-0.5">{tasks.length} open task{tasks.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openNewTask}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-xl transition shadow-sm"
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
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-16 text-center">
          <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-3" />
          <p className="font-semibold text-slate-700 mb-1">All caught up!</p>
          <p className="text-sm text-slate-400">No open tasks. Add tasks from any lead&apos;s detail page.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <Section label="Overdue"     items={overdue}  accent="text-red-500" />
          <Section label="Today"       items={today}    accent="text-amber-500" />
          <Section label="Upcoming"    items={upcoming} accent="text-blue-500" />
          <Section label="No due date" items={noDue}    accent="text-slate-400" />
        </div>
      )}
    </div>
      {/* New Task modal */}
      {showNewTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">New Task</h3>
              <button onClick={() => setShowNewTask(false)} className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 transition">
                <X size={16} />
              </button>
            </div>

            {/* Task title */}
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Task</label>
              <input
                autoFocus
                value={taskTitle}
                onChange={e => setTaskTitle(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && taskTitle.trim() && selectedLead) createTask(); }}
                placeholder="e.g. Follow up on application"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Lead search */}
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Lead</label>
              {selectedLead ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-[9px] font-bold">{selectedLead.firstName[0]}{selectedLead.lastName[0]}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-800 flex-1">{selectedLead.firstName} {selectedLead.lastName}</span>
                  <button onClick={() => { setSelectedLead(null); setLeadQuery(""); setLeadOptions([]); }}
                    className="text-slate-400 hover:text-slate-600 transition">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={leadQuery}
                    onChange={e => onLeadQueryChange(e.target.value)}
                    placeholder="Search by name, email, company…"
                    className="w-full pl-8 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {searchingLeads && (
                    <Loader2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
                  )}
                  {leadOptions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-10">
                      {leadOptions.map(lead => (
                        <button key={lead.id}
                          onClick={() => { setSelectedLead(lead); setLeadOptions([]); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 text-left transition">
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-[9px] font-bold">{lead.firstName[0]}{lead.lastName[0]}</span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{lead.firstName} {lead.lastName}</p>
                            {lead.company && <p className="text-xs text-slate-400">{lead.company}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Due date */}
            <div className="mb-5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Due date <span className="font-normal">(optional)</span></label>
              <input
                type="date"
                value={taskDue}
                onChange={e => setTaskDue(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowNewTask(false)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition">
                Cancel
              </button>
              <button
                onClick={createTask}
                disabled={!taskTitle.trim() || !selectedLead || creatingTask}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition"
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
