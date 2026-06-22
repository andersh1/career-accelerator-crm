"use client";

import { useState } from "react";
import {
  X, Loader2, CheckCircle2, ChevronRight, AlertCircle,
  FileText, Zap, ArrowRight, Clock, Tag, TrendingUp, Video,
} from "lucide-react";

interface NextStep {
  title: string;
  dueInDays: number;
}

interface ParsedTranscript {
  summary: string;
  callNotes: string;
  painPoints: string[];
  objections: string[];
  keyInsights: string[];
  nextSteps: NextStep[];
  recommendedStage: string;
  recommendedPriority: string;
  stageReason: string;
  enrollmentReadiness: string;
  notesAppend: string;
}

interface Props {
  leadId: string;
  currentStage: string;
  leadName: string;
  onApplied: () => void;
  onClose: () => void;
}

const READINESS_COLOR: Record<string, string> = {
  NOT_READY:        "bg-slate-100 text-slate-600",
  WARMING:          "bg-blue-100 text-blue-700",
  INTERESTED:       "bg-violet-100 text-violet-700",
  VERY_INTERESTED:  "bg-amber-100 text-amber-700",
  READY_TO_ENROLL:  "bg-emerald-100 text-emerald-700",
};
const READINESS_LABEL: Record<string, string> = {
  NOT_READY:        "Not Ready",
  WARMING:          "Warming Up",
  INTERESTED:       "Interested",
  VERY_INTERESTED:  "Very Interested",
  READY_TO_ENROLL:  "Ready to Enroll 🔥",
};

export default function TranscriptParser({ leadId, currentStage, leadName, onApplied, onClose }: Props) {
  const [transcript, setTranscript]       = useState("");
  const [recordingUrl, setRecordingUrl]   = useState("");
  const [parsing,    setParsing]          = useState(false);
  const [result,     setResult]           = useState<ParsedTranscript | null>(null);
  const [error,      setError]            = useState("");
  const [applying,   setApplying]         = useState(false);
  const [applied,    setApplied]          = useState(false);

  // Selections the user can toggle before applying
  const [selectedSteps, setSelectedSteps] = useState<Set<number>>(new Set());
  const [applyStage,    setApplyStage]    = useState(true);
  const [applyPriority, setApplyPriority] = useState(true);
  const [applyNotes,    setApplyNotes]    = useState(true);

  async function parse() {
    if (!transcript.trim()) return;
    setParsing(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(`/api/crm/leads/${leadId}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcript.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Parsing failed"); return; }
      setResult(data as ParsedTranscript);
      // Select all next steps by default
      setSelectedSteps(new Set(data.nextSteps?.map((_: NextStep, i: number) => i) ?? []));
      setApplyStage(data.recommendedStage !== currentStage);
    } finally {
      setParsing(false);
    }
  }

  async function apply() {
    if (!result) return;
    setApplying(true);

    const dueDate = (days: number) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d.toISOString();
    };

    // 1. Log the call activity (with optional recording URL in metadata)
    await fetch(`/api/crm/leads/${leadId}/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "CALL",
        content: result.callNotes,
        metadata: recordingUrl.trim() ? JSON.stringify({ recordingUrl: recordingUrl.trim() }) : undefined,
      }),
    });

    // 2. Create selected tasks
    for (const idx of Array.from(selectedSteps)) {
      const step = result.nextSteps[idx];
      if (!step) continue;
      await fetch(`/api/crm/leads/${leadId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: step.title, dueAt: dueDate(step.dueInDays) }),
      });
    }

    // 3. Build patch payload
    const patch: Record<string, unknown> = {};
    if (applyStage && result.recommendedStage !== currentStage) patch.stage = result.recommendedStage;
    if (applyPriority) patch.priority = result.recommendedPriority;
    if (applyNotes && result.notesAppend) patch.notesAppend = result.notesAppend;

    if (Object.keys(patch).length > 0) {
      await fetch(`/api/crm/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    }

    setApplying(false);
    setApplied(true);
    setTimeout(() => { onApplied(); onClose(); }, 1200);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <FileText size={16} className="text-violet-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Fathom Transcript Parser</h3>
              <p className="text-xs text-slate-500">AI extracts insights & auto-fills CRM for {leadName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <X size={18} />
          </button>
        </div>

        <div className="p-6">
          {!result ? (
            /* ── Step 1: Paste transcript ── */
            <div>
              <p className="text-sm text-slate-600 mb-3">
                Paste your Fathom transcript below. Claude will extract call notes, next steps, objections, and recommend a stage update.
              </p>

              {/* Recording URL */}
              <div className="flex items-center gap-2 mb-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <Video size={14} className="text-violet-500 flex-shrink-0" />
                <input
                  value={recordingUrl}
                  onChange={e => setRecordingUrl(e.target.value)}
                  className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-slate-400"
                  placeholder="Fathom recording URL (optional) — saved as a link on the call"
                />
              </div>

              <textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                rows={12}
                className="w-full text-sm border border-slate-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition font-mono placeholder:text-slate-300 placeholder:font-sans"
                placeholder={"Paste your Fathom transcript here…\n\nSpeaker 1: Hi, thanks for jumping on…\nSpeaker 2: Of course, I've been looking forward to it…"}
              />
              {error && (
                <div className="flex items-center gap-2 mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  <AlertCircle size={14} /> {error}
                </div>
              )}
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-slate-400">
                  {transcript.length > 0 ? `${transcript.length.toLocaleString()} characters` : "Supports Fathom, Otter.ai, Fireflies, or any text transcript"}
                </p>
                <button
                  onClick={parse}
                  disabled={!transcript.trim() || parsing}
                  className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
                >
                  {parsing ? (
                    <><Loader2 size={14} className="animate-spin" /> Analyzing…</>
                  ) : (
                    <><Zap size={14} /> Parse with AI</>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* ── Step 2: Review & apply ── */
            <div className="space-y-5">
              {/* Summary */}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Meeting Summary</p>
                <p className="text-sm text-slate-800 leading-relaxed">{result.summary}</p>
              </div>

              {/* Enrollment readiness */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-500">Enrollment Readiness:</span>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${READINESS_COLOR[result.enrollmentReadiness] ?? "bg-slate-100 text-slate-600"}`}>
                  {READINESS_LABEL[result.enrollmentReadiness] ?? result.enrollmentReadiness}
                </span>
              </div>

              {/* Key insights */}
              {result.keyInsights?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Tag size={11} /> Key Insights
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.keyInsights.map((ins, i) => (
                      <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full">
                        {ins}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Pain points + Objections */}
              {(result.painPoints?.length > 0 || result.objections?.length > 0) && (
                <div className="grid grid-cols-2 gap-4">
                  {result.painPoints?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Pain Points</p>
                      <ul className="space-y-1">
                        {result.painPoints.map((p, i) => (
                          <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5">
                            <span className="text-amber-500 mt-0.5 flex-shrink-0">•</span> {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.objections?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Objections</p>
                      <ul className="space-y-1">
                        {result.objections.map((o, i) => (
                          <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5">
                            <span className="text-red-400 mt-0.5 flex-shrink-0">•</span> {o}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-slate-100 pt-4 space-y-4">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Apply to CRM</p>

                {/* Recording URL — always saved if provided */}
                {recordingUrl.trim() && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-violet-50 border border-violet-200">
                    <CheckCircle2 size={15} className="text-violet-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-violet-800">📹 Recording saved on call</p>
                      <p className="text-xs text-violet-600 truncate mt-0.5">{recordingUrl.trim()}</p>
                    </div>
                  </div>
                )}

                {/* Call notes — always applied */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <CheckCircle2 size={15} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-emerald-800">Log as CALL activity</p>
                    <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">{result.callNotes}</p>
                  </div>
                </div>

                {/* Next steps / tasks */}
                {result.nextSteps?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                      <Clock size={12} /> Next Steps — select to create as tasks
                    </p>
                    <div className="space-y-1.5">
                      {result.nextSteps.map((step, i) => (
                        <label
                          key={i}
                          className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition ${
                            selectedSteps.has(i) ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200 opacity-60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedSteps.has(i)}
                            onChange={e => {
                              const next = new Set(selectedSteps);
                              e.target.checked ? next.add(i) : next.delete(i);
                              setSelectedSteps(next);
                            }}
                            className="accent-blue-600"
                          />
                          <span className="flex-1 text-xs font-medium text-slate-800">{step.title}</span>
                          <span className="text-[10px] text-slate-400 flex-shrink-0">
                            due in {step.dueInDays}d
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stage recommendation */}
                {result.recommendedStage !== currentStage && (
                  <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${applyStage ? "bg-violet-50 border-violet-200" : "bg-slate-50 border-slate-200 opacity-60"}`}>
                    <input
                      type="checkbox"
                      checked={applyStage}
                      onChange={e => setApplyStage(e.target.checked)}
                      className="accent-violet-600"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                        <TrendingUp size={12} className="text-violet-600" />
                        Move stage: <span className="line-through text-slate-400">{currentStage}</span>
                        <ArrowRight size={10} />
                        <span className="text-violet-700">{result.recommendedStage}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">{result.stageReason}</p>
                    </div>
                  </label>
                )}

                {/* Priority update */}
                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${applyPriority ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200 opacity-60"}`}>
                  <input
                    type="checkbox"
                    checked={applyPriority}
                    onChange={e => setApplyPriority(e.target.checked)}
                    className="accent-amber-500"
                  />
                  <p className="text-xs font-semibold text-slate-800">
                    Set priority to <span className="text-amber-700">{result.recommendedPriority}</span>
                  </p>
                </label>

                {/* Notes append */}
                {result.notesAppend && (
                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${applyNotes ? "bg-slate-50 border-slate-300" : "bg-slate-50 border-slate-200 opacity-60"}`}>
                    <input
                      type="checkbox"
                      checked={applyNotes}
                      onChange={e => setApplyNotes(e.target.checked)}
                      className="accent-slate-600 mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-0.5">Append to lead notes</p>
                      <p className="text-xs text-slate-500 leading-relaxed">{result.notesAppend}</p>
                    </div>
                  </label>
                )}
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  onClick={() => { setResult(null); setError(""); }}
                  className="text-sm text-slate-500 hover:text-slate-700 transition"
                >
                  ← Re-paste transcript
                </button>
                <button
                  onClick={apply}
                  disabled={applying || applied}
                  className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
                >
                  {applied ? (
                    <><CheckCircle2 size={14} /> Applied!</>
                  ) : applying ? (
                    <><Loader2 size={14} className="animate-spin" /> Applying…</>
                  ) : (
                    <>Apply to CRM <ChevronRight size={14} /></>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
