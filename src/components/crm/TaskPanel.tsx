"use client";
import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, Circle, Plus, Trash2, Loader2, AlertCircle, Clock, UserCircle2, Pencil, X, Check } from "lucide-react";
import { useToast } from "@/lib/toast";

interface Task {
  id: string; leadId: string; title: string; notes: string | null;
  dueAt: string | null; completedAt: string | null; createdAt: string;
  assignedTo: string | null;
}

interface AdminUser { id: string; name: string | null; email: string; }

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

function toDateInput(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toISOString().split("T")[0];
}

export default function TaskPanel({ leadId }: { leadId: string }) {
  const { success, error: toastError } = useToast();
  const [tasks,      setTasks]      = useState<Task[]>([]);
  const [admins,     setAdmins]     = useState<AdminUser[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [adding,     setAdding]     = useState(false);
  const [title,      setTitle]      = useState("");
  const [dueAt,      setDueAt]      = useState("");
  const [notes,      setNotes]      = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [saving,     setSaving]     = useState(false);
  const [editingId,  setEditingId]  = useState<string | null>(null);

  const load = useCallback(async () => {
    const res  = await fetch(`/api/crm/leads/${leadId}/tasks`);
    const data = await res.json();
    if (Array.isArray(data)) setTasks(data);
    setLoading(false);
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/crm/users").then(r => r.json()).then((d) => {
      if (Array.isArray(d)) setAdmins(d);
    }).catch(() => {});
  }, []);

  async function addTask() {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/crm/leads/${leadId}/tasks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), dueAt: dueAt || null, notes: notes || null, assignedTo: assignedTo || null }),
    });
    if (res.ok) {
      setTitle(""); setDueAt(""); setNotes(""); setAssignedTo(""); setAdding(false);
      await load();
      success("Task added.");
    } else { toastError("Failed to add task"); }
    setSaving(false);
  }

  async function saveEdit(id: string, patch: Partial<Pick<Task, "title" | "notes" | "dueAt" | "assignedTo">>) {
    const res = await fetch(`/api/crm/tasks/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setEditingId(null);
      await load();
      success("Task updated.");
    } else { toastError("Failed to update task"); }
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

  function adminName(email: string | null) {
    if (!email) return null;
    const u = admins.find(a => a.email === email);
    return u?.name ?? email;
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
        <button onClick={() => { setAdding(v => !v); setEditingId(null); }}
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
          <input
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Notes (optional)…"
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1">
              <Clock size={12} className="text-slate-400" />
              <input type="date" value={dueAt} onChange={e => setDueAt(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            </div>
            {admins.length > 0 && (
              <div className="flex items-center gap-1.5 flex-1">
                <UserCircle2 size={12} className="text-slate-400 flex-shrink-0" />
                <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full">
                  <option value="">Unassigned</option>
                  {admins.map(u => (
                    <option key={u.id} value={u.email}>{u.name ?? u.email}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
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
          <TaskRow
            key={task.id} task={task} admins={admins} adminName={adminName}
            isEditing={editingId === task.id}
            onEdit={() => setEditingId(task.id)}
            onCancelEdit={() => setEditingId(null)}
            onSaveEdit={(patch) => saveEdit(task.id, patch)}
            onToggle={toggleComplete} onDelete={deleteTask}
          />
        ))}
        {closed.length > 0 && (
          <details className="group">
            <summary className="px-5 py-2 text-[11px] font-semibold text-slate-400 cursor-pointer hover:text-slate-600 list-none">
              {closed.length} completed
            </summary>
            {closed.map(task => (
              <TaskRow
                key={task.id} task={task} admins={admins} adminName={adminName}
                isEditing={editingId === task.id}
                onEdit={() => setEditingId(task.id)}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={(patch) => saveEdit(task.id, patch)}
                onToggle={toggleComplete} onDelete={deleteTask}
              />
            ))}
          </details>
        )}
      </div>
    </div>
  );
}

function TaskRow({ task, admins, adminName, isEditing, onEdit, onCancelEdit, onSaveEdit, onToggle, onDelete }: {
  task: Task;
  admins: AdminUser[];
  adminName: (email: string | null) => string | null;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (patch: Partial<Pick<Task, "title" | "notes" | "dueAt" | "assignedTo">>) => void;
  onToggle: (t: Task) => void;
  onDelete: (id: string) => void;
}) {
  const done     = !!task.completedAt;
  const assignee = adminName(task.assignedTo);

  const [eTitle,      setETitle]      = useState(task.title);
  const [eNotes,      setENotes]      = useState(task.notes ?? "");
  const [eDueAt,      setEDueAt]      = useState(toDateInput(task.dueAt));
  const [eAssignedTo, setEAssignedTo] = useState(task.assignedTo ?? "");
  const [saving,      setSaving]      = useState(false);

  // Reset fields when edit mode opens
  useEffect(() => {
    if (isEditing) {
      setETitle(task.title);
      setENotes(task.notes ?? "");
      setEDueAt(toDateInput(task.dueAt));
      setEAssignedTo(task.assignedTo ?? "");
    }
  }, [isEditing, task]);

  async function handleSave() {
    if (!eTitle.trim()) return;
    setSaving(true);
    await onSaveEdit({
      title:      eTitle.trim(),
      notes:      eNotes || null,
      dueAt:      eDueAt || null,
      assignedTo: eAssignedTo || null,
    });
    setSaving(false);
  }

  if (isEditing) {
    return (
      <div className="px-5 py-4 bg-blue-50/40 border-l-2 border-blue-500 space-y-2.5">
        <input
          autoFocus value={eTitle} onChange={e => setETitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Escape") onCancelEdit(); }}
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        <input
          value={eNotes} onChange={e => setENotes(e.target.value)}
          placeholder="Notes (optional)…"
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1">
            <Clock size={12} className="text-slate-400" />
            <input type="date" value={eDueAt} onChange={e => setEDueAt(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>
          {admins.length > 0 && (
            <div className="flex items-center gap-1.5 flex-1">
              <UserCircle2 size={12} className="text-slate-400 flex-shrink-0" />
              <select value={eAssignedTo} onChange={e => setEAssignedTo(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full">
                <option value="">Unassigned</option>
                {admins.map(u => (
                  <option key={u.id} value={u.email}>{u.name ?? u.email}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving || !eTitle.trim()}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Save
          </button>
          <button onClick={onCancelEdit}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5 transition">
            <X size={12} /> Cancel
          </button>
        </div>
      </div>
    );
  }

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
        <div className="flex items-center gap-2 flex-wrap">
          {task.notes && <p className="text-xs text-slate-400 truncate" title={task.notes}>{task.notes}</p>}
          {assignee && (
            <span className="text-[10px] text-slate-400 flex items-center gap-0.5 flex-shrink-0">
              <UserCircle2 size={9} /> {assignee}
            </span>
          )}
        </div>
      </div>
      {!done && dueBadge(task.dueAt)}
      <button onClick={onEdit}
        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-blue-500 transition flex-shrink-0">
        <Pencil size={13} />
      </button>
      <button onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition flex-shrink-0">
        <Trash2 size={13} />
      </button>
    </div>
  );
}
