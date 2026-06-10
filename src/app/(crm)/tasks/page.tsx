"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, AlertCircle, Clock, Loader2 } from "lucide-react";
import { stageInfo } from "@/components/crm/constants";
import { useToast } from "@/lib/toast";

interface Task {
  id: string; title: string; notes: string | null; dueAt: string | null;
  completedAt: string | null; createdAt: string;
  lead: { id: string; firstName: string; lastName: string; stage: string };
}

function dueLabel(dueAt: string | null) {
  if (!dueAt) return null;
  const d    = new Date(dueAt);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0)  return { text: "Overdue",  cls: "text-red-600 bg-red-50 border-red-200" };
  if (days === 0) return { text: "Today",    cls: "text-amber-600 bg-amber-50 border-amber-200" };
  if (days === 1) return { text: "Tomorrow", cls: "text-blue-600 bg-blue-50 border-blue-200" };
  return { text: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), cls: "text-slate-500 bg-slate-50 border-slate-200" };
}

export default function TasksPage() {
  const { success } = useToast();
  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

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
            return (
              <div key={task.id}
                className="bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center gap-4 px-5 py-4 hover:shadow-md transition-shadow">
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
              </div>
            );
          })}
        </div>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
          <p className="text-sm text-slate-500 mt-0.5">{tasks.length} open task{tasks.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
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
          <p className="text-sm text-slate-400">No open tasks. Add tasks from any lead's detail page.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <Section label="Overdue"  items={overdue}  accent="text-red-500" />
          <Section label="Today"    items={today}    accent="text-amber-500" />
          <Section label="Upcoming" items={upcoming} accent="text-blue-500" />
          <Section label="No due date" items={noDue} accent="text-slate-400" />
        </div>
      )}
    </div>
  );
}
