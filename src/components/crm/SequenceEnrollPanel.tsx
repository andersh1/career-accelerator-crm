"use client";
import { useEffect, useState, useCallback } from "react";
import { Mail, Play, Pause, X, Plus, Loader2, CheckCircle2, ChevronRight } from "lucide-react";
import { useToast } from "@/lib/toast";

interface Step  { id: string; stepNumber: number; subject: string; delayDays: number; }
interface Seq   { id: string; name: string; steps: Step[]; }
interface Enrollment {
  id: string; sequenceId: string; currentStep: number; status: string;
  nextSendAt: string | null; startedAt: string; completedAt: string | null;
  sequence: { name: string; steps: Step[] };
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:    "bg-emerald-100 text-emerald-700",
  PAUSED:    "bg-amber-100 text-amber-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

export default function SequenceEnrollPanel({ leadId }: { leadId: string }) {
  const { success, error: toastError } = useToast();
  const [enrollments, setEnrollments]     = useState<Enrollment[]>([]);
  const [sequences,   setSequences]       = useState<Seq[]>([]);
  const [loading,     setLoading]         = useState(true);
  const [showPicker,  setShowPicker]      = useState(false);
  const [enrolling,   setEnrolling]       = useState(false);

  const load = useCallback(async () => {
    const [eRes, sRes] = await Promise.all([
      fetch(`/api/crm/leads/${leadId}/sequences`),
      fetch("/api/crm/sequences"),
    ]);
    const [e, s] = await Promise.all([eRes.json(), sRes.json()]);
    setEnrollments(Array.isArray(e) ? e : []);
    setSequences(Array.isArray(s) ? s : []);
    setLoading(false);
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  async function enroll(sequenceId: string) {
    setEnrolling(true);
    const res  = await fetch(`/api/crm/leads/${leadId}/sequences`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequenceId }),
    });
    if (res.ok) {
      success("Enrolled in sequence ✓");
      setShowPicker(false);
      await load();
    } else {
      const d = await res.json() as { error?: string };
      toastError(d.error ?? "Failed to enroll");
    }
    setEnrolling(false);
  }

  async function updateStatus(enrollmentId: string, status: "ACTIVE" | "PAUSED" | "CANCELLED") {
    const res = await fetch(`/api/crm/enrollments/${enrollmentId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) { success(`Sequence ${status.toLowerCase()} ✓`); await load(); }
    else toastError("Failed to update");
  }

  const active = enrollments.filter(e => e.status === "ACTIVE" || e.status === "PAUSED");
  const done   = enrollments.filter(e => e.status === "COMPLETED" || e.status === "CANCELLED");

  // Sequences not already actively enrolled
  const available = sequences.filter(s =>
    s.steps.length > 0 && !active.some(e => e.sequenceId === s.id)
  );

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Mail size={15} className="text-violet-500" />
          <h3 className="text-sm font-bold text-slate-900">Email Sequences</h3>
          {active.length > 0 && (
            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
              {active.length} active
            </span>
          )}
        </div>
        <button onClick={() => setShowPicker(v => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition">
          <Plus size={12} /> Enroll
        </button>
      </div>

      {/* Sequence picker */}
      {showPicker && (
        <div className="mb-4 border border-blue-200 bg-blue-50 rounded-xl p-3 space-y-1">
          <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wide mb-2">Choose a sequence</p>
          {available.length === 0 ? (
            <p className="text-xs text-slate-500 py-2 text-center">
              No sequences available. <a href="/sequences" className="text-blue-600 hover:underline">Create one →</a>
            </p>
          ) : available.map(seq => (
            <button key={seq.id} onClick={() => enroll(seq.id)} disabled={enrolling}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition">
              <Mail size={13} className="text-violet-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">{seq.name}</p>
                <p className="text-xs text-slate-400">{seq.steps.length} step{seq.steps.length !== 1 ? "s" : ""}</p>
              </div>
              {enrolling
                ? <Loader2 size={13} className="animate-spin text-slate-300" />
                : <ChevronRight size={13} className="text-slate-300" />
              }
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-6 flex justify-center">
          <Loader2 size={18} className="animate-spin text-slate-300" />
        </div>
      ) : enrollments.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center">
          No sequences yet. Click <strong>Enroll</strong> to start a drip campaign.
        </p>
      ) : (
        <div className="space-y-3">
          {active.map(e => {
            const totalSteps = e.sequence.steps.length;
            const pct        = totalSteps > 0 ? Math.round(((e.currentStep - 1) / totalSteps) * 100) : 0;
            return (
              <div key={e.id} className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{e.sequence.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Step {e.currentStep} of {totalSteps}
                      {e.nextSendAt && e.status === "ACTIVE" && (
                        <> · Next: {new Date(e.nextSendAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[e.status]}`}>
                      {e.status}
                    </span>
                    {e.status === "ACTIVE" && (
                      <button onClick={() => updateStatus(e.id, "PAUSED")}
                        className="p-1 text-slate-400 hover:text-amber-500 transition" title="Pause">
                        <Pause size={12} />
                      </button>
                    )}
                    {e.status === "PAUSED" && (
                      <button onClick={() => updateStatus(e.id, "ACTIVE")}
                        className="p-1 text-slate-400 hover:text-emerald-500 transition" title="Resume">
                        <Play size={12} />
                      </button>
                    )}
                    <button onClick={() => updateStatus(e.id, "CANCELLED")}
                      className="p-1 text-slate-400 hover:text-red-500 transition" title="Cancel">
                      <X size={12} />
                    </button>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}

          {done.length > 0 && (
            <details className="text-xs">
              <summary className="text-slate-400 cursor-pointer hover:text-slate-600 transition py-1">
                {done.length} completed / cancelled
              </summary>
              <div className="mt-2 space-y-1.5">
                {done.map(e => (
                  <div key={e.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50">
                    <CheckCircle2 size={12} className="text-slate-300 shrink-0" />
                    <span className="flex-1 truncate text-slate-500">{e.sequence.name}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLOR[e.status]}`}>
                      {e.status}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
