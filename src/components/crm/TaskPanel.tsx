"use client";
import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, Circle, Plus, Trash2, Loader2, AlertCircle, Clock } from "lucide-react";
import { useToast } from "@/lib/toast";

interface Task {
  id: string; leadId: string; title: string; notes: string | null;
  dueAt: string | null; completedAt: string | null; createdAt: string;
}

function dueBadge(dueAt: string | null) {
  if (!dueAt) return null;
  const d    = new Date(dueAt);
  const now  = new Date();
  const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (days < 0)  return <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><AlertCircle size={9}/> Overdue</span>;
  if (days === 0) return <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Today</span>;
  if (days === 1) return <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">Tomorrow</span>;
  return <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><Clock size={9}/>{d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>;
}

export default function TaskPanel({ leadId }: { leadId: string }) {
  const { success, error: toastError } = useToast();
  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding,  setAdding]  = useState(false);
  const [title,   setTitle]   = useState("");
  const [dueAt,   setDueAt]   = useState("");
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    const res  = await fetch(`/api/crm/leads/${leadId}/tasks`);
    const data = await res.json();
    if (Array.isArray(data)) setTasks(data);
    setLoading(false);
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  async function addTask() {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/crm/leads/${leadId}/tasks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), dueAt: dueAt || null }),
    });
    if (res.ok) {
      setTitle(""); setDueAt(""); setAdding(false);
      await load();
      success("Task added.");
    } else { toastError("Failed to add task"); }
    setSaving(false);
  }

  async function toggleComplete(task: Task) {
    const nowDone = !task.completedAt;
    await fetch(`/api/crm/tasks/${task.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completedAt: nowDone ? new Date().toISOString() : null }),
    });
    await load();
    if (nowDone) success("Task completed ✓");
  }

  async function deleteTask(id: string) {
    await fetch(`/api/crm/tasks/${id}`, { method: "DELETE" });
    setTasks(t => t.filter(x => x.id !== id));
  }

  const open   = tasks.filter(t => !t.completedAt);
  const closed = tasks.filter(t =>  t.completedAt);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} className="text-blue-600" />
          <p className="text-xs font-bold text-slate-900 uppercase tracking-wide">Tasks</p>
          {open.length > 0 && (
            <span className="text-[10px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-full">{open.length}</span>
          )}
        </div>
        <button onClick={() => setAdding(v => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition">
          <Plus size={13} /> Add
        </button>
      </div>

      {adding && (
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 space-y-3">
          <input
            autoFocus value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addTask(); if (e.key === "Escape") setAdding(false); }}
            placeholder="Task title…"
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1">
              <Clock size={12} className="text-slate-400" />
              <input type="date" value={dueAt} onChange={e => setDueAt(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            </div>
            <button onClick={addTask} disabled={saving || !title.trim()}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition">
              {saving ? <Loader2 size={12} className="animate-spin" /> : null}
              Save
            </button>
            <button onClick={() => setAdding(false)}
              className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5 transition">Cancel</button>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-50">
        {loading && (
          <div className="px-5 py-6 flex items-center justify-center">
            <Loader2 size={16} className="animate-spin text-slate-300" />
          </div>
        )}
        {!loading && tasks.length === 0 && !adding && (
          <div className="px-5 py-8 text-center">
            <p className="text-xs text-slate-400">No tasks yet. Add a follow-up reminder.</p>
          </div>
        )}
        {open.map(task => (
          <TaskRow key={task.id} task={task} onToggle={toggleComplete} onDelete={deleteTask} />
        ))}
        {closed.length > 0 && (
          <details className="group">
            <summary className="px-5 py-2 text-[11px] font-semibold text-slate-400 cursor-pointer hover:text-slate-600 list-none">
              {closed.length} completed
            </summary>
            {closed.map(task => (
              <TaskRow key={task.id} task={task} onToggle={toggleComplete} onDelete={deleteTask} />
            ))}
          </details>
        )}
      </div>
    </div>
  );
}

function TaskRow({ task, onToggle, onDelete }: {
  task: Task;
  onToggle: (t: Task) => void;
  onDelete: (id: string) => void;
}) {
  const done = !!task.completedAt;
  return (
    <div className={`flex items-center gap-3 px-5 py-3 group ${done ? "opacity-50" : ""}`}>
      <button onClick={() => onToggle(task)} className="flex-shrink-0 text-slate-300 hover:text-blue-500 transition">
        {done
          ? <CheckCircle2 size={16} className="text-emerald-500" />
          : <Circle size={16} />
        }
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${done ? "line-through text-slate-400" : "text-slate-800"}`}>
          {task.title}
        </p>
        {task.notes && <p className="text-xs text-slate-400 truncate">{task.notes}</p>}
      </div>
      {!done && dueBadge(task.dueAt)}
      <button onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition flex-shrink-0">
        <Trash2 size={13} />
      </button>
    </div>
  );
}
