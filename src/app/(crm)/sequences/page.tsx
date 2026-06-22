"use client";
import { useEffect, useState, useCallback } from "react";
import { Plus, Mail, Trash2, Loader2, ChevronRight, Play, Pause, Edit2, X, Check, GripVertical } from "lucide-react";
import { useToast } from "@/lib/toast";

interface Step { id: string; stepNumber: number; subject: string; body: string; delayDays: number; }
interface Sequence {
  id: string; name: string; description: string | null; isActive: boolean;
  createdAt: string; steps: Step[];
  totalEnrollments: number; activeEnrollments: number;
}

const TEMPLATE_STEPS: { label: string; steps: Omit<Step, "id" | "stepNumber">[] }[] = [
  {
    label: "Standard 3-touch",
    steps: [
      { subject: "Quick question about your career goals", body: "Hi {{firstName}},\n\nI came across your profile and thought the 10x Career Accelerator might be a great fit.\n\nWould you be open to a quick 15-minute call this week?\n\nLooking forward to connecting!", delayDays: 0 },
      { subject: "Following up — 10x Career Accelerator", body: "Hi {{firstName}},\n\nJust wanted to make sure my last message didn't get buried.\n\nIf you're curious about the program, I'm happy to answer any questions — no commitment needed.\n\nAre you free this week?", delayDays: 3 },
      { subject: "Last note from me", body: "Hi {{firstName}},\n\nI won't keep reaching out after this, but wanted to leave the door open.\n\nIf the 10x Career Accelerator ever feels like the right fit, feel free to reach out anytime. We'd love to have you.\n\nBest of luck with everything!", delayDays: 7 },
    ],
  },
];

export default function SequencesPage() {
  const { success, error: toastError } = useToast();
  const [sequences, setSequences]   = useState<Sequence[]>([]);
  const [loading,   setLoading]     = useState(true);
  const [selected,  setSelected]    = useState<Sequence | null>(null);
  const [showNew,   setShowNew]     = useState(false);
  const [newName,   setNewName]     = useState("");
  const [newDesc,   setNewDesc]     = useState("");
  const [creating,  setCreating]    = useState(false);

  // Step editing state
  const [editStep,  setEditStep]    = useState<Step | null>(null);
  const [addingStep, setAddingStep] = useState(false);
  const [newStep,   setNewStep]     = useState({ subject: "", body: "", delayDays: 0 });
  const [savingStep, setSavingStep] = useState(false);

  const load = useCallback(async () => {
    const res  = await fetch("/api/crm/sequences");
    const data = await res.json();
    if (Array.isArray(data)) setSequences(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh selected when sequences update
  useEffect(() => {
    if (selected) {
      const fresh = sequences.find(s => s.id === selected.id);
      if (fresh) setSelected(fresh);
    }
  }, [sequences]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    if (!newName.trim()) return;
    setCreating(true);
    const res  = await fetch("/api/crm/sequences", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
    });
    const seq  = await res.json() as Sequence & { steps: Step[] };
    if (res.ok) {
      success("Sequence created ✓");
      setShowNew(false); setNewName(""); setNewDesc("");
      await load();
      setSelected({ ...seq, steps: [], totalEnrollments: 0, activeEnrollments: 0 });
    } else { toastError("Failed to create"); }
    setCreating(false);
  }

  async function deleteSeq(id: string) {
    if (!confirm("Delete this sequence? All enrollments will be cancelled.")) return;
    await fetch(`/api/crm/sequences/${id}`, { method: "DELETE" });
    setSequences(prev => prev.filter(s => s.id !== id));
    if (selected?.id === id) setSelected(null);
    success("Sequence deleted");
  }

  async function addStep() {
    if (!selected || !newStep.subject.trim() || !newStep.body.trim()) {
      toastError("Subject and body are required"); return;
    }
    setSavingStep(true);
    const res = await fetch(`/api/crm/sequences/${selected.id}/steps`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newStep),
    });
    if (res.ok) {
      success("Step added ✓");
      setAddingStep(false);
      setNewStep({ subject: "", body: "", delayDays: 0 });
      await load();
    } else { toastError("Failed to add step"); }
    setSavingStep(false);
  }

  async function saveStep() {
    if (!editStep || !selected) return;
    setSavingStep(true);
    await fetch(`/api/crm/sequences/${selected.id}/steps`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepId: editStep.id, subject: editStep.subject, body: editStep.body, delayDays: editStep.delayDays }),
    });
    setEditStep(null);
    await load();
    setSavingStep(false);
  }

  async function deleteStep(stepId: string) {
    if (!selected) return;
    await fetch(`/api/crm/sequences/${selected.id}/steps`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepId }),
    });
    success("Step removed");
    await load();
  }

  async function applyTemplate(steps: Omit<Step, "id" | "stepNumber">[]) {
    if (!selected) return;
    for (const step of steps) {
      await fetch(`/api/crm/sequences/${selected.id}/steps`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(step),
      });
    }
    success(`${steps.length} steps added ✓`);
    await load();
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: sequence list */}
      <div className="w-72 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
        <div className="px-4 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-slate-900">Sequences</h1>
            <p className="text-xs text-slate-500">{sequences.length} total</p>
          </div>
          <button onClick={() => setShowNew(v => !v)}
            className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition">
            <Plus size={14} />
          </button>
        </div>

        {showNew && (
          <div className="px-4 py-3 border-b border-slate-200 bg-white space-y-2">
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && create()}
              placeholder="Sequence name…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="flex gap-2">
              <button onClick={create} disabled={creating || !newName.trim()}
                className="flex-1 text-xs font-semibold bg-blue-600 text-white py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                {creating ? "Creating…" : "Create"}
              </button>
              <button onClick={() => setShowNew(false)}
                className="px-3 text-xs text-slate-400 hover:text-slate-600 transition">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
          ) : sequences.length === 0 ? (
            <div className="py-12 px-4 text-center text-xs text-slate-400">
              No sequences yet. Click <strong>+</strong> to create one.
            </div>
          ) : sequences.map(seq => (
            <button key={seq.id} onClick={() => setSelected(seq)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 text-left transition ${
                selected?.id === seq.id ? "bg-blue-50 border-l-2 border-l-blue-500" : "hover:bg-white"
              }`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                seq.isActive ? "bg-violet-100" : "bg-slate-100"
              }`}>
                <Mail size={13} className={seq.isActive ? "text-violet-600" : "text-slate-400"} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{seq.name}</p>
                <p className="text-xs text-slate-400">
                  {seq.steps.length} step{seq.steps.length !== 1 ? "s" : ""}
                  {seq.activeEnrollments > 0 && ` · ${seq.activeEnrollments} active`}
                </p>
              </div>
              <ChevronRight size={13} className="text-slate-300 shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Right: sequence detail */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            Select a sequence to view and edit its steps
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{selected.name}</h2>
                {selected.description && (
                  <p className="text-sm text-slate-500 mt-0.5">{selected.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                  <span>{selected.steps.length} step{selected.steps.length !== 1 ? "s" : ""}</span>
                  <span>{selected.totalEnrollments} enrolled</span>
                  <span className="text-emerald-600 font-semibold">{selected.activeEnrollments} active</span>
                </div>
              </div>
              <button onClick={() => deleteSeq(selected.id)}
                className="text-slate-300 hover:text-red-500 transition p-1.5 rounded-lg hover:bg-red-50">
                <Trash2 size={15} />
              </button>
            </div>

            {/* Quick-start templates */}
            {selected.steps.length === 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-3">Quick-start templates</p>
                <div className="space-y-2">
                  {TEMPLATE_STEPS.map(t => (
                    <button key={t.label} onClick={() => applyTemplate(t.steps)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-blue-200 hover:border-blue-400 text-left transition">
                      <Mail size={14} className="text-blue-500 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{t.label}</p>
                        <p className="text-xs text-slate-500">{t.steps.length} steps · Day 0, +3, +7</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Smart-skip info banner */}
            {selected.steps.length > 1 && (
              <div className="flex items-start gap-2.5 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
                <span className="text-violet-500 mt-0.5 shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </span>
                <p className="text-xs text-violet-700 leading-relaxed">
                  <span className="font-bold">Smart skip active —</span> follow-up steps (step 2+) are automatically skipped if the lead has already opened a sequence email in the last 7 days, or completed if the lead is already enrolled.
                </p>
              </div>
            )}

            {/* Steps */}
            <div className="space-y-3">
              {selected.steps.map((step, i) => (
                <div key={step.id}
                  className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  {editStep?.id === step.id ? (
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Step {step.stepNumber}</span>
                        <input type="number" min={0}
                          value={editStep.delayDays}
                          onChange={e => setEditStep(s => s ? { ...s, delayDays: parseInt(e.target.value) || 0 } : s)}
                          className="w-16 text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 ml-auto"
                        />
                        <span className="text-xs text-slate-400">days delay</span>
                      </div>
                      <input value={editStep.subject}
                        onChange={e => setEditStep(s => s ? { ...s, subject: e.target.value } : s)}
                        placeholder="Subject line"
                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <textarea value={editStep.body} rows={6}
                        onChange={e => setEditStep(s => s ? { ...s, body: e.target.value } : s)}
                        placeholder="Email body — use {{firstName}} for personalization"
                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-xs" />
                      <div className="flex gap-2">
                        <button onClick={saveStep} disabled={savingStep}
                          className="flex items-center gap-1.5 text-xs font-semibold bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                          {savingStep ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Save
                        </button>
                        <button onClick={() => setEditStep(null)}
                          className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5 transition">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 p-4">
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center">
                          <span className="text-[11px] font-bold text-violet-700">{step.stepNumber}</span>
                        </div>
                        {i < selected.steps.length - 1 && (
                          <div className="w-0.5 h-4 bg-slate-200 rounded-full" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                            {step.stepNumber === 1 ? "Immediately" : `+${step.delayDays} day${step.delayDays !== 1 ? "s" : ""}`}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 truncate">{step.subject}</p>
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{step.body}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setEditStep(step)}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition">
                          <Edit2 size={12} />
                        </button>
                        <button onClick={() => deleteStep(step.id)}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add step */}
            {addingStep ? (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Step {selected.steps.length + 1}</span>
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-slate-400">Delay:</span>
                    <input type="number" min={0} value={newStep.delayDays}
                      onChange={e => setNewStep(s => ({ ...s, delayDays: parseInt(e.target.value) || 0 }))}
                      className="w-16 text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-xs text-slate-400">days</span>
                  </div>
                </div>
                <input value={newStep.subject} onChange={e => setNewStep(s => ({ ...s, subject: e.target.value }))}
                  placeholder="Subject line"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <textarea value={newStep.body} rows={5}
                  onChange={e => setNewStep(s => ({ ...s, body: e.target.value }))}
                  placeholder="Email body — use {{firstName}} for personalization"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-xs" />
                <div className="flex gap-2">
                  <button onClick={addStep} disabled={savingStep}
                    className="flex items-center gap-1.5 text-xs font-semibold bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                    {savingStep ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Add step
                  </button>
                  <button onClick={() => setAddingStep(false)} className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5 transition">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingStep(true)}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition">
                <Plus size={15} /> Add step
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
