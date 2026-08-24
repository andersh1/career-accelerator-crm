"use client";

import { useState } from "react";
import { Loader2, Pencil, X, Check, Trophy, Building2, Briefcase, DollarSign, Calendar, FileText } from "lucide-react";
import { OUTCOME_STATUSES, outcomeStatusInfo } from "@/components/crm/constants";

interface OutcomeData {
  outcomeStatus:    string | null;
  outcomeCompany:   string | null;
  outcomeRole:      string | null;
  outcomeSalary:    number | null;
  outcomeStartDate: string | null;
  outcomeNotes:     string | null;
  outcomeUpdatedAt: string | null;
}

interface Props {
  leadId: string;
  outcome: OutcomeData;
  onSave: () => void;
}

export default function OutcomePanel({ leadId, outcome, onSave }: Props) {
  const [editing, setEditing]       = useState(false);
  const [saving,  setSaving]        = useState(false);

  const [status,    setStatus]    = useState(outcome.outcomeStatus    ?? "PENDING");
  const [company,   setCompany]   = useState(outcome.outcomeCompany   ?? "");
  const [role,      setRole]      = useState(outcome.outcomeRole      ?? "");
  const [salary,    setSalary]    = useState(outcome.outcomeSalary != null ? String(outcome.outcomeSalary) : "");
  const [startDate, setStartDate] = useState(outcome.outcomeStartDate ? outcome.outcomeStartDate.slice(0, 10) : "");
  const [notes,     setNotes]     = useState(outcome.outcomeNotes     ?? "");

  function openEdit() {
    setStatus(outcome.outcomeStatus    ?? "PENDING");
    setCompany(outcome.outcomeCompany  ?? "");
    setRole(outcome.outcomeRole        ?? "");
    setSalary(outcome.outcomeSalary != null ? String(outcome.outcomeSalary) : "");
    setStartDate(outcome.outcomeStartDate ? outcome.outcomeStartDate.slice(0, 10) : "");
    setNotes(outcome.outcomeNotes      ?? "");
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/crm/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcomeStatus:    status,
        outcomeCompany:   company  || null,
        outcomeRole:      role     || null,
        outcomeSalary:    salary   ? parseInt(salary, 10) : null,
        outcomeStartDate: startDate ? new Date(startDate).toISOString() : null,
        outcomeNotes:     notes    || null,
        outcomeUpdatedAt: new Date().toISOString(),
      }),
    });
    setSaving(false);
    setEditing(false);
    onSave();
  }

  const info    = outcomeStatusInfo(outcome.outcomeStatus);
  const hasData = outcome.outcomeStatus && outcome.outcomeStatus !== "PENDING";

  return (
    <div className="rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: "#e4e0d6", background: "white" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "#e4e0d6", background: "#f8f6f1" }}>
        <div className="flex items-center gap-2">
          <Trophy size={14} style={{ color: "#086c64" }} />
          <span className="text-sm font-bold" style={{ color: "#14211f" }}>Outcome</span>
          {outcome.outcomeStatus && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${info.color}`}>{info.label}</span>
          )}
        </div>
        {!editing && (
          <button onClick={openEdit}
            className="flex items-center gap-1 text-xs font-semibold transition hover:opacity-70"
            style={{ color: "#086c64" }}>
            <Pencil size={11} /> {hasData ? "Edit" : "Log outcome"}
          </button>
        )}
      </div>

      {/* View mode */}
      {!editing && (
        <div className="px-5 py-4">
          {!hasData ? (
            <p className="text-xs text-center py-3" style={{ color: "#949598" }}>
              No outcome logged yet. Click &ldquo;Log outcome&rdquo; to track where this student landed.
            </p>
          ) : (
            <div className="space-y-2.5">
              {outcome.outcomeCompany && (
                <div className="flex items-center gap-2.5">
                  <Building2 size={13} style={{ color: "#949598" }} />
                  <span className="text-sm font-semibold" style={{ color: "#14211f" }}>{outcome.outcomeCompany}</span>
                </div>
              )}
              {outcome.outcomeRole && (
                <div className="flex items-center gap-2.5">
                  <Briefcase size={13} style={{ color: "#949598" }} />
                  <span className="text-sm" style={{ color: "#5a6663" }}>{outcome.outcomeRole}</span>
                </div>
              )}
              {outcome.outcomeSalary && (
                <div className="flex items-center gap-2.5">
                  <DollarSign size={13} style={{ color: "#949598" }} />
                  <span className="text-sm" style={{ color: "#5a6663" }}>${outcome.outcomeSalary.toLocaleString()} / yr</span>
                </div>
              )}
              {outcome.outcomeStartDate && (
                <div className="flex items-center gap-2.5">
                  <Calendar size={13} style={{ color: "#949598" }} />
                  <span className="text-sm" style={{ color: "#5a6663" }}>
                    Started {new Date(outcome.outcomeStartDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </span>
                </div>
              )}
              {outcome.outcomeNotes && (
                <div className="flex items-start gap-2.5 pt-1">
                  <FileText size={13} className="mt-0.5 shrink-0" style={{ color: "#949598" }} />
                  <span className="text-xs leading-relaxed" style={{ color: "#5a6663" }}>{outcome.outcomeNotes}</span>
                </div>
              )}
              {outcome.outcomeUpdatedAt && (
                <p className="text-[10px] pt-1" style={{ color: "#c9c4b8" }}>
                  Updated {new Date(outcome.outcomeUpdatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit mode */}
      {editing && (
        <div className="px-5 py-4 space-y-3">
          {/* Status */}
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#949598" }}>Status</label>
            <div className="flex flex-wrap gap-2">
              {OUTCOME_STATUSES.map(s => (
                <button key={s.key}
                  onClick={() => setStatus(s.key)}
                  className={`text-xs font-semibold px-3 py-1 rounded-full border transition ${status === s.key ? s.color + " border-transparent" : "border-[#e4e0d6] text-slate-500 hover:border-[#086c64]"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Company + Role */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "#949598" }}>Company</label>
              <input value={company} onChange={e => setCompany(e.target.value)}
                placeholder="e.g. Google"
                className="w-full text-sm border border-[#e4e0d6] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2"
                style={{ color: "#14211f" }} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "#949598" }}>Role / Title</label>
              <input value={role} onChange={e => setRole(e.target.value)}
                placeholder="e.g. Ops Analyst"
                className="w-full text-sm border border-[#e4e0d6] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2"
                style={{ color: "#14211f" }} />
            </div>
          </div>

          {/* Salary + Start date */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "#949598" }}>Salary (annual $)</label>
              <input value={salary} onChange={e => setSalary(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 70000"
                className="w-full text-sm border border-[#e4e0d6] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2"
                style={{ color: "#14211f" }} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "#949598" }}>Start date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full text-sm border border-[#e4e0d6] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2"
                style={{ color: "#14211f" }} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#949598" }}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} placeholder="Any additional context…"
              className="w-full text-sm border border-[#e4e0d6] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 resize-none"
              style={{ color: "#14211f" }} />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1.5 text-xs font-bold text-white px-4 py-1.5 rounded-lg transition disabled:opacity-50"
              style={{ background: "#086c64" }}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving}
              className="flex items-center gap-1 text-xs font-semibold transition hover:opacity-70"
              style={{ color: "#949598" }}>
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
