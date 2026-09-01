"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { toEasternInput } from "@/lib/timezone";
import {
  Plus, Edit2, Check, X, Loader2, Power, GraduationCap, Rocket,
  ChevronDown, ChevronUp, Target, AlertTriangle, Send, BookOpen,
  Calendar, Link2, MapPin, Save,
} from "lucide-react";

// ─── LMS status helpers ───────────────────────────────────────────────────────

type LmsStatus = "pending" | "invited" | "active" | "graduated";

/**
 * "Invited" means we sent them a set-up link — it used to key off onboardedAt,
 * which publishing stamped on every student. Publishing no longer does that (it
 * made them skip the welcome sequence), so invited now has its own field and
 * this reads what actually happened rather than a side effect.
 */
function lmsStatus(s: Student): LmsStatus {
  if (s.certificateIssuedAt) return "graduated";
  if (s.onboardedAt && (s.sectionsCompleted > 0 || s.lastActiveAt)) return "active";
  if (s.onboardedAt) return "active";      // finished onboarding, not yet worked
  if (s.invitedAt) return "invited";       // invite sent, not set up yet
  return "pending";
}

const STATUS_LABEL: Record<LmsStatus, string> = {
  pending:   "Pending",
  invited:   "Invited",
  active:    "Active",
  graduated: "Graduated",
};

const STATUS_COLOR: Record<LmsStatus, { bg: string; text: string; dot: string }> = {
  pending:   { bg: "#f1efe8", text: "#949598",  dot: "#c9c4b8" },
  invited:   { bg: "#fef3c7", text: "#92400e",  dot: "#f59e0b" },
  active:    { bg: "#edf5f4", text: "#086c64",  dot: "#086c64" },
  graduated: { bg: "#f0fdf4", text: "#166534",  dot: "#22c55e" },
};

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Student {
  id: string; name: string; email: string; cohort: string | null; cohortId: string | null;
  onboardedAt: string | null;
  invitedAt: string | null;
  certificateIssuedAt: string | null;
  sectionsCompleted: number;
  lastActiveAt: string | null;
}

interface Cohort {
  id: string; name: string; isActive: boolean; founderMode: boolean; capacity: number | null;
  startDate: string | null; createdAt: string;
  publishedAt: string | null; invitesSent: number;
  enrolled: number; fillPct: number | null; spotsLeft: number | null;
}

interface ScheduleEntry {
  moduleId:        string;
  moduleNumber:    number;
  moduleTitle:     string;
  preworkDue:      string | null;
  sessionDate:     string | null;
  sessionLocation: string | null;
  sessionZoomLink: string | null;
  preambleDate:    string | null;
  preambleSentAt:  string | null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CohortsPage() {
  const [cohorts,  setCohorts]  = useState<Cohort[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Create
  const [creating,      setCreating]      = useState(false);
  const [newName,       setNewName]       = useState("");
  const [newCap,        setNewCap]        = useState("");
  const [newStartDate,  setNewStartDate]  = useState("");
  const [savingNew,     setSavingNew]     = useState(false);

  // Edit
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [editName,      setEditName]      = useState("");
  const [editCap,       setEditCap]       = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [saving,        setSaving]        = useState<string | null>(null);

  // Graduate
  const [graduateTarget, setGraduateTarget] = useState<Cohort | null>(null);
  const [graduating,     setGraduating]     = useState(false);
  const [graduateResult, setGraduateResult] = useState<{ certsIssued: number; emailsSent: number } | null>(null);

  // Publish to LMS
  const [publishTarget, setPublishTarget] = useState<Cohort | null>(null);
  const [publishing,    setPublishing]    = useState(false);
  const [publishResult, setPublishResult] = useState<{ published: number; invitesSent: number } | null>(null);

  // Reassign
  const [reassigning, setReassigning] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [cohortsRes, studentsRes] = await Promise.all([
      fetch("/api/crm/cohorts").then(r => r.json()),
      fetch("/api/crm/students").then(r => r.json()),
    ]);
    if (Array.isArray(cohortsRes))  setCohorts(cohortsRes);
    if (Array.isArray(studentsRes)) setStudents(studentsRes);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createCohort() {
    if (!newName.trim()) return;
    setSavingNew(true);
    const res = await fetch("/api/crm/cohorts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), capacity: newCap || null, startDate: newStartDate || null }),
    });
    const cohort = await res.json();
    setCohorts(prev => [cohort, ...prev]);
    setNewName(""); setNewCap(""); setNewStartDate(""); setCreating(false); setSavingNew(false);
  }

  async function saveCohort(id: string) {
    setSaving(id);
    const res = await fetch(`/api/crm/cohorts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), capacity: editCap || null, startDate: editStartDate || null }),
    });
    const updated = await res.json();
    setCohorts(prev => prev.map(c => c.id === id
      ? { ...c, name: updated.name, capacity: updated.capacity, startDate: updated.startDate }
      : c
    ));
    setEditingId(null); setSaving(null);
  }

  async function toggleActive(id: string, current: boolean) {
    const res = await fetch(`/api/crm/cohorts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !current }),
    });
    const updated = await res.json();
    setCohorts(prev => prev.map(c => c.id === id ? { ...c, isActive: updated.isActive } : c));
  }

  async function toggleFounder(id: string, current: boolean) {
    const res = await fetch(`/api/crm/cohorts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ founderMode: !current }),
    });
    const updated = await res.json();
    setCohorts(prev => prev.map(c => c.id === id ? { ...c, founderMode: updated.founderMode } : c));
  }

  async function graduateCohort() {
    if (!graduateTarget) return;
    setGraduating(true);
    const res  = await fetch(`/api/crm/cohorts/${graduateTarget.id}/graduate`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setCohorts(prev => prev.map(c => c.id === graduateTarget.id ? { ...c, isActive: false } : c));
      setGraduateResult({ certsIssued: data.certsIssued, emailsSent: data.emailsSent });
    }
    setGraduateTarget(null);
    setGraduating(false);
  }

  async function publishCohort() {
    if (!publishTarget) return;
    setPublishing(true);
    const res  = await fetch(`/api/crm/cohorts/${publishTarget.id}/publish`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setPublishResult({ published: data.published, invitesSent: data.invitesSent });
      await load(); // refresh student statuses
    }
    setPublishTarget(null);
    setPublishing(false);
  }

  async function assignStudent(studentId: string, cohortId: string, cohortName: string) {
    setReassigning(studentId);
    await fetch(`/api/crm/students/${studentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cohortId, cohort: cohortName }),
    });
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, cohortId, cohort: cohortName } : s));
    setCohorts(prev => prev.map(c => {
      if (c.id === cohortId) return { ...c, enrolled: c.enrolled + 1 };
      const prevCohort = prev.find(x => students.find(s => s.id === studentId)?.cohortId === x.id);
      if (prevCohort && c.id === prevCohort.id) return { ...c, enrolled: Math.max(0, c.enrolled - 1) };
      return c;
    }));
    setReassigning(null);
  }

  const active   = cohorts.filter(c => c.isActive);
  const archived = cohorts.filter(c => !c.isActive);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={24} className="animate-spin" style={{ color: "#c9c4b8" }} />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto animate-fade-up space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#949598", letterSpacing: "0.14em" }}>
            Vantage Career Accelerator
          </p>
          <h1 className="font-display font-semibold leading-tight" style={{ fontSize: "1.75rem", color: "#14211f" }}>
            Cohorts
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "#949598" }}>
            Create cohorts, enroll students, publish to LMS, and graduate.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 text-sm font-semibold text-white px-4 py-2.5 rounded-xl transition"
          style={{ background: "#086c64" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#084f4a")}
          onMouseLeave={e => (e.currentTarget.style.background = "#086c64")}
        >
          <Plus size={15} /> New Cohort
        </button>
      </div>

      {/* Publish success banner */}
      {publishResult && (
        <div className="flex items-center gap-3 rounded-2xl px-5 py-4" style={{ background: "#edf5f4", border: "1px solid #d0e8e6" }}>
          <Send size={16} style={{ color: "#086c64" }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#086c64" }}>
              {publishResult.published === 0
                ? "All students were already published to the LMS."
                : `${publishResult.published} student${publishResult.published !== 1 ? "s" : ""} published to LMS.`}
            </p>
            {publishResult.invitesSent > 0 && (
              <p className="text-xs mt-0.5" style={{ color: "#5a6663" }}>
                {publishResult.invitesSent} invite email{publishResult.invitesSent !== 1 ? "s" : ""} sent with account setup link.
              </p>
            )}
          </div>
          <button onClick={() => setPublishResult(null)} className="ml-auto" style={{ color: "#949598" }}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* Graduate success banner */}
      {graduateResult && (
        <div className="flex items-center gap-3 rounded-2xl px-5 py-4" style={{ background: "#edf5f4", border: "1px solid #d0e8e6" }}>
          <GraduationCap size={18} style={{ color: "#086c64" }} />
          <p className="text-sm font-semibold" style={{ color: "#086c64" }}>
            Cohort graduated — {graduateResult.certsIssued} certificate{graduateResult.certsIssued !== 1 ? "s" : ""} issued,{" "}
            {graduateResult.emailsSent} email{graduateResult.emailsSent !== 1 ? "s" : ""} sent.
          </p>
          <button onClick={() => setGraduateResult(null)} className="ml-auto" style={{ color: "#949598" }}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* New cohort form */}
      {creating && (
        <div className="card p-5">
          <p className="text-sm font-semibold mb-4" style={{ color: "#14211f" }}>New Cohort</p>
          <div className="flex gap-3 flex-wrap">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") createCohort(); if (e.key === "Escape") setCreating(false); }}
              placeholder="e.g. Cohort 7 — Fall 2026"
              className="flex-1 min-w-[200px] px-3 py-2.5 text-sm rounded-xl focus:outline-none"
              style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
            />
            <input
              type="date"
              value={newStartDate}
              onChange={e => setNewStartDate(e.target.value)}
              className="w-40 px-3 py-2.5 text-sm rounded-xl focus:outline-none"
              style={{ border: "1px solid #e4e0d6", color: newStartDate ? "#14211f" : "#949598" }}
              title="Start date (optional)"
            />
            <input
              value={newCap}
              onChange={e => setNewCap(e.target.value)}
              placeholder="Capacity (optional)"
              type="number"
              min="1"
              className="w-40 px-3 py-2.5 text-sm rounded-xl focus:outline-none"
              style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
            />
            <div className="flex gap-2">
              <button
                onClick={createCohort}
                disabled={!newName.trim() || savingNew}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition disabled:opacity-40"
                style={{ background: "#086c64" }}
              >
                {savingNew ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Create
              </button>
              <button
                onClick={() => setCreating(false)}
                className="px-3 py-2.5 rounded-xl text-sm transition"
                style={{ background: "#f1efe8", color: "#5a6663" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active cohorts */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full" style={{ background: "#086c64" }} />
          <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#949598", letterSpacing: "0.14em" }}>
            Active — {active.length}
          </p>
        </div>

        {active.length === 0 ? (
          <div className="card p-10 text-center">
            <Target size={28} className="mx-auto mb-3" style={{ color: "#c9c4b8" }} />
            <p className="font-semibold" style={{ color: "#5a6663" }}>No active cohorts</p>
            <p className="text-sm mt-1" style={{ color: "#949598" }}>Create one above to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map(cohort => (
              <CohortCard
                key={cohort.id}
                cohort={cohort}
                students={students}
                expanded={expanded === cohort.id}
                onToggleExpand={() => setExpanded(expanded === cohort.id ? null : cohort.id)}
                editing={editingId === cohort.id}
                editName={editName}
                editCap={editCap}
                editStartDate={editStartDate}
                onEditStart={() => {
                  setEditingId(cohort.id);
                  setEditName(cohort.name);
                  setEditCap(cohort.capacity?.toString() ?? "");
                  setEditStartDate(cohort.startDate ? cohort.startDate.slice(0, 10) : "");
                }}
                onEditName={setEditName}
                onEditCap={setEditCap}
                onEditStartDate={setEditStartDate}
                onEditSave={() => saveCohort(cohort.id)}
                onEditCancel={() => setEditingId(null)}
                saving={saving === cohort.id}
                onToggleActive={() => toggleActive(cohort.id, cohort.isActive)}
                onToggleFounder={() => toggleFounder(cohort.id, cohort.founderMode)}
                onGraduate={() => setGraduateTarget(cohort)}
                onPublish={() => setPublishTarget(cohort)}
                onAssignStudent={assignStudent}
                reassigning={reassigning}
              />
            ))}
          </div>
        )}
      </section>

      {/* Archived cohorts */}
      {archived.length > 0 && (
        <section>
          <p className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: "#949598", letterSpacing: "0.14em" }}>
            Archived — {archived.length}
          </p>
          <div className="space-y-3">
            {archived.map(cohort => (
              <CohortCard
                key={cohort.id}
                cohort={cohort}
                students={students}
                expanded={expanded === cohort.id}
                onToggleExpand={() => setExpanded(expanded === cohort.id ? null : cohort.id)}
                editing={editingId === cohort.id}
                editName={editName}
                editCap={editCap}
                editStartDate={editStartDate}
                onEditStart={() => {
                  setEditingId(cohort.id);
                  setEditName(cohort.name);
                  setEditCap(cohort.capacity?.toString() ?? "");
                  setEditStartDate(cohort.startDate ? cohort.startDate.slice(0, 10) : "");
                }}
                onEditName={setEditName}
                onEditCap={setEditCap}
                onEditStartDate={setEditStartDate}
                onEditSave={() => saveCohort(cohort.id)}
                onEditCancel={() => setEditingId(null)}
                saving={saving === cohort.id}
                onToggleActive={() => toggleActive(cohort.id, cohort.isActive)}
                onToggleFounder={() => toggleFounder(cohort.id, cohort.founderMode)}
                onGraduate={() => setGraduateTarget(cohort)}
                onPublish={() => setPublishTarget(cohort)}
                onAssignStudent={assignStudent}
                reassigning={reassigning}
              />
            ))}
          </div>
        </section>
      )}

      {/* Publish confirm modal */}
      {publishTarget && (() => {
        const cohortStudents = students.filter(s => s.cohortId === publishTarget.id);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" style={{ border: "1px solid #e4e0d6" }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 mx-auto" style={{ background: "#edf5f4" }}>
                <Send size={20} style={{ color: "#086c64" }} />
              </div>
              <h3 className="text-base font-semibold text-center mb-2" style={{ color: "#14211f" }}>
                Publish to LMS?
              </h3>
              <p className="text-sm text-center mb-2" style={{ color: "#5a6663" }}>
                {cohortStudents.length === 0
                  ? `No students are enrolled in ${publishTarget.name} yet.`
                  : `${cohortStudents.length} student${cohortStudents.length !== 1 ? "s" : ""} in ${publishTarget.name} will receive access to the LMS.`}
              </p>
              {cohortStudents.length > 0 && (
                <p className="text-xs text-center mb-5" style={{ color: "#949598" }}>
                  Students without an account will receive an email with a link to set their password and access the portal.
                </p>
              )}
              {cohortStudents.length === 0 && <div className="mb-5" />}
              <div className="flex gap-3">
                <button
                  onClick={() => setPublishTarget(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl transition"
                  style={{ background: "#f1efe8", color: "#5a6663" }}
                >
                  Cancel
                </button>
                <button
                  onClick={publishCohort}
                  disabled={publishing || cohortStudents.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-50"
                  style={{ background: "#086c64" }}
                >
                  {publishing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Publish
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Graduate confirm modal */}
      {graduateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" style={{ border: "1px solid #e4e0d6" }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 mx-auto" style={{ background: "#edf5f4" }}>
              <GraduationCap size={22} style={{ color: "#086c64" }} />
            </div>
            <h3 className="text-base font-semibold text-center mb-2" style={{ color: "#14211f" }}>
              Graduate {graduateTarget.name}?
            </h3>
            <p className="text-sm text-center mb-5" style={{ color: "#5a6663" }}>
              This will issue certificates to all {graduateTarget.enrolled} enrolled student{graduateTarget.enrolled !== 1 ? "s" : ""}, send graduation emails, and archive the cohort.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setGraduateTarget(null)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl transition"
                style={{ background: "#f1efe8", color: "#5a6663" }}
              >
                Cancel
              </button>
              <button
                onClick={graduateCohort}
                disabled={graduating}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-50"
                style={{ background: "#086c64" }}
              >
                {graduating ? <Loader2 size={14} className="animate-spin" /> : <GraduationCap size={14} />}
                Graduate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cohort Card ──────────────────────────────────────────────────────────────

interface CohortCardProps {
  cohort: Cohort;
  students: Student[];
  expanded: boolean;
  onToggleExpand: () => void;
  editing: boolean;
  editName: string;
  editCap: string;
  editStartDate: string;
  onEditStart: () => void;
  onEditName: (v: string) => void;
  onEditCap: (v: string) => void;
  onEditStartDate: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  saving: boolean;
  onToggleActive: () => void;
  onToggleFounder: () => void;
  onGraduate: () => void;
  onPublish: () => void;
  onAssignStudent: (studentId: string, cohortId: string, cohortName: string) => void;
  reassigning: string | null;
}

function CohortCard({
  cohort, students, expanded, onToggleExpand,
  editing, editName, editCap, editStartDate,
  onEditStart, onEditName, onEditCap, onEditStartDate,
  onEditSave, onEditCancel, saving,
  onToggleActive, onToggleFounder, onGraduate, onPublish,
  onAssignStudent, reassigning,
}: CohortCardProps) {
  const enrolled  = students.filter(s => s.cohortId === cohort.id);
  const unenrolled = students.filter(s => !s.cohortId || s.cohortId !== cohort.id);

  // Schedule tab state
  const [activeTab,    setActiveTab]    = useState<"roster" | "schedule">("roster");
  const [schedule,     setSchedule]     = useState<ScheduleEntry[] | null>(null);
  const [schedLoading, setSchedLoading] = useState(false);
  const [editingRow,   setEditingRow]   = useState<string | null>(null);
  const [rowDraft,     setRowDraft]     = useState<Partial<ScheduleEntry>>({});
  const [savingRow,    setSavingRow]    = useState<string | null>(null);

  useEffect(() => {
    if (expanded && activeTab === "schedule" && schedule === null) {
      setSchedLoading(true);
      fetch(`/api/crm/cohorts/${cohort.id}/schedule`)
        .then(r => r.json())
        .then(d => { if (Array.isArray(d)) setSchedule(d); })
        .catch(() => {})
        .finally(() => setSchedLoading(false));
    }
  }, [expanded, activeTab, schedule, cohort.id]);

  async function saveRow(moduleId: string) {
    setSavingRow(moduleId);
    try {
      const res = await fetch(`/api/crm/cohorts/${cohort.id}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, ...rowDraft }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSchedule(prev => prev?.map(r =>
          r.moduleId === moduleId
            ? { ...r, preworkDue: updated.preworkDue, sessionDate: updated.sessionDate, sessionLocation: updated.sessionLocation, sessionZoomLink: updated.sessionZoomLink, preambleDate: updated.preambleDate, preambleSentAt: updated.preambleSentAt }
            : r
        ) ?? null);
        setEditingRow(null);
      }
    } finally {
      setSavingRow(null);
    }
  }

  const gradCount     = enrolled.filter(s => s.certificateIssuedAt).length;
  const activeCount   = enrolled.filter(s => lmsStatus(s) === "active").length;
  const invitedCount  = enrolled.filter(s => lmsStatus(s) === "invited").length;
  const pendingCount  = enrolled.filter(s => lmsStatus(s) === "pending").length;

  const fillPct  = cohort.capacity ? Math.round((cohort.enrolled / cohort.capacity) * 100) : null;
  const fillColor = fillPct == null ? "#086c64"
    : fillPct >= 90 ? "#dc2626"
    : fillPct >= 70 ? "#d97706"
    : "#086c64";

  return (
    <div className="card overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#edf5f4" }}>
          <GraduationCap size={18} style={{ color: "#086c64" }} />
        </div>

        {/* Name / edit */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex gap-2 flex-wrap">
              <input
                autoFocus
                value={editName}
                onChange={e => onEditName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") onEditSave(); if (e.key === "Escape") onEditCancel(); }}
                className="flex-1 min-w-[160px] px-3 py-1.5 text-sm rounded-xl focus:outline-none"
                style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
              />
              <input
                type="date"
                value={editStartDate}
                onChange={e => onEditStartDate(e.target.value)}
                className="w-38 px-3 py-1.5 text-sm rounded-xl focus:outline-none"
                style={{ border: "1px solid #e4e0d6", color: editStartDate ? "#14211f" : "#949598" }}
                title="Start date"
              />
              <input
                value={editCap}
                onChange={e => onEditCap(e.target.value)}
                placeholder="Capacity"
                type="number"
                min="1"
                className="w-28 px-3 py-1.5 text-sm rounded-xl focus:outline-none"
                style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
              />
              <div className="flex gap-1.5">
                <button onClick={onEditSave} disabled={saving}
                  className="p-1.5 rounded-lg text-white transition"
                  style={{ background: "#086c64" }}>
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                </button>
                <button onClick={onEditCancel} className="p-1.5 rounded-lg transition"
                  style={{ color: "#949598", background: "#f1efe8" }}>
                  <X size={13} />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold truncate" style={{ color: "#14211f" }}>{cohort.name}</p>
                <span
                  className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full flex-shrink-0"
                  style={cohort.isActive
                    ? { background: "#edf5f4", color: "#086c64" }
                    : { background: "#f1efe8", color: "#949598" }
                  }
                >
                  {cohort.isActive ? "Active" : "Archived"}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {cohort.startDate && (
                  <span className="text-xs font-medium" style={{ color: "#086c64" }}>
                    Starts {new Date(cohort.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                  </span>
                )}
                <span className="text-xs" style={{ color: "#949598" }}>
                  {cohort.enrolled} enrolled{cohort.capacity ? ` / ${cohort.capacity}` : ""}
                </span>
                {/* Was this cohort ever published? The roster pills describe where
                    Fellows are, but said nothing about whether the invite run
                    happened — so a published cohort read as untouched. */}
                {cohort.publishedAt ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                    style={{ background: "#edf5f4", color: "#086c64" }}
                    title={`${cohort.invitesSent} invite email${cohort.invitesSent === 1 ? "" : "s"} sent`}>
                    ✓ Published {new Date(cohort.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {cohort.invitesSent > 0 ? ` · ${cohort.invitesSent} invited` : ""}
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: "#f1efe8", color: "#949598" }}>
                    Not published
                  </span>
                )}
                {/* LMS summary pills */}
                {cohort.isActive && enrolled.length > 0 && (
                  <>
                    {activeCount > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#edf5f4", color: "#086c64" }}>
                        {activeCount} in LMS
                      </span>
                    )}
                    {invitedCount > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#fef3c7", color: "#92400e" }}>
                        {invitedCount} invited
                      </span>
                    )}
                    {pendingCount > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#f1efe8", color: "#949598" }}>
                        {pendingCount} pending
                      </span>
                    )}
                    {gradCount > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#f0fdf4", color: "#166534" }}>
                        {gradCount} graduated
                      </span>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Fill bar */}
        {fillPct !== null && !editing && (
          <div className="w-24 flex-shrink-0">
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#e4e0d6" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(fillPct, 100)}%`, background: fillColor }} />
            </div>
            <p className="text-[10px] text-right mt-1 font-semibold" style={{ color: fillColor }}>{fillPct}%</p>
          </div>
        )}

        {/* Actions */}
        {!editing && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onEditStart}
              title="Rename"
              className="p-1.5 rounded-lg transition"
              style={{ color: "#949598" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#f1efe8"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <Edit2 size={13} />
            </button>
            <button
              onClick={onToggleActive}
              title={cohort.isActive ? "Archive" : "Reactivate"}
              className="p-1.5 rounded-lg transition"
              style={{ color: cohort.isActive ? "#949598" : "#086c64" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#f1efe8"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <Power size={13} />
            </button>
            {/* Founder Mode toggle */}
            {cohort.isActive && (
              <button
                onClick={onToggleFounder}
                title={cohort.founderMode
                  ? "Founder Mode is ON — students see the founder dashboard layer. Click to turn off."
                  : "Turn on Founder Mode — adds the momentum chip, weekly founder moves, and pipeline teaser to this cohort's student dashboard."}
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition"
                style={cohort.founderMode
                  ? { background: "#086c64", color: "#ffffff" }
                  : { background: "#f1efe8", color: "#949598" }}
              >
                <Rocket size={12} />
                {cohort.founderMode ? "Founder Mode: ON" : "Founder Mode"}
              </button>
            )}
            {/* Publish to LMS */}
            {cohort.isActive && enrolled.length > 0 && (
              <button
                onClick={onPublish}
                title="Publish to LMS"
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition relative"
                style={{ background: "#edf5f4", color: "#086c64" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#d0e8e6"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#edf5f4"; }}
              >
                <Send size={12} />
                Publish
                {pendingCount > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
                    style={{ background: "#f59e0b" }}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            )}
            {cohort.isActive && cohort.enrolled > 0 && (
              <button
                onClick={onGraduate}
                title="Graduate cohort"
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition"
                style={{ background: "#f1efe8", color: "#5a6663" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#e4e0d6"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#f1efe8"; }}
              >
                <GraduationCap size={12} /> Graduate
              </button>
            )}
            <button
              onClick={onToggleExpand}
              className="p-1.5 rounded-lg transition"
              style={{ color: "#949598" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#f1efe8"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        )}
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t" style={{ borderColor: "#e4e0d6" }}>
          {/* Tab bar */}
          <div className="flex border-b px-5" style={{ borderColor: "#e4e0d6", background: "#f8f6f1" }}>
            {(["roster", "schedule"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="text-xs font-bold uppercase tracking-wide py-2.5 px-3 border-b-2 transition mr-1"
                style={{
                  borderColor:  activeTab === tab ? "#086c64" : "transparent",
                  color:        activeTab === tab ? "#086c64"  : "#949598",
                }}
              >
                {tab === "roster" ? `Roster (${enrolled.length})` : "Schedule"}
              </button>
            ))}
          </div>

          {/* Roster tab */}
          {activeTab === "roster" && (
          <div>
          <div className="px-5 py-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#949598", letterSpacing: "0.14em" }}>
                Enrolled · {enrolled.length}
              </p>
              {enrolled.length > 0 && (
                <div className="flex items-center gap-3 text-[10px]" style={{ color: "#949598" }}>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#086c64" }} /> Active
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#f59e0b" }} /> Invited
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#c9c4b8" }} /> Pending
                  </span>
                </div>
              )}
            </div>
            {enrolled.length === 0 ? (
              <p className="text-sm py-2" style={{ color: "#949598" }}>No students enrolled yet.</p>
            ) : (
              <div className="space-y-1">
                {enrolled.map(s => {
                  const st = lmsStatus(s);
                  const col = STATUS_COLOR[st];
                  return (
                    <div key={s.id} className="flex items-center gap-3 py-2">
                      {/* Status dot */}
                      <div className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ background: col.dot }} />
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                        style={{ background: "#086c64" }}>
                        {s.name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Link href={`/students?search=${encodeURIComponent(enrolled.find(x => x.id === s.id)?.email ?? s.name)}`} className="text-sm font-medium truncate hover:underline" style={{ color: "#14211f" }}>
                            {s.name}
                          </Link>
                          <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: col.bg, color: col.text }}>
                            {STATUS_LABEL[st]}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <p className="text-xs truncate" style={{ color: "#949598" }}>{s.email}</p>
                          {s.sectionsCompleted > 0 && (
                            <span className="text-[10px] flex-shrink-0" style={{ color: "#5a6663" }}>
                              <BookOpen size={10} className="inline mr-0.5" style={{ verticalAlign: "middle" }} />
                              {s.sectionsCompleted} section{s.sectionsCompleted !== 1 ? "s" : ""}
                            </span>
                          )}
                          {s.lastActiveAt && (
                            <span className="text-[10px] flex-shrink-0" style={{ color: "#949598" }}>
                              Last active {new Date(s.lastActiveAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add students */}
          {cohort.isActive && unenrolled.length > 0 && (
            <div className="px-5 py-3 border-t" style={{ borderColor: "#e4e0d6", background: "#f8f6f1" }}>
              <p className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: "#949598", letterSpacing: "0.14em" }}>
                Add Students
              </p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {unenrolled.map(s => (
                  <div key={s.id} className="flex items-center gap-3 py-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                      style={{ background: "#c9c4b8" }}>
                      {s.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "#14211f" }}>{s.name}</p>
                      <p className="text-xs truncate" style={{ color: "#949598" }}>
                        {s.cohort ? `Currently in ${s.cohort}` : "No cohort"}
                      </p>
                    </div>
                    <button
                      onClick={() => onAssignStudent(s.id, cohort.id, cohort.name)}
                      disabled={reassigning === s.id}
                      className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition disabled:opacity-50"
                      style={{ background: "#edf5f4", color: "#086c64" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#d0e8e6"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#edf5f4"; }}
                    >
                      {reassigning === s.id ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                      Add
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {cohort.isActive && unenrolled.length === 0 && enrolled.length > 0 && (
            <div className="px-5 py-3 border-t flex items-center gap-2" style={{ borderColor: "#e4e0d6", background: "#f8f6f1" }}>
              <AlertTriangle size={14} style={{ color: "#d97706" }} />
              <p className="text-xs" style={{ color: "#5a6663" }}>All students are already in this cohort.</p>
            </div>
          )}
          </div>
          )} {/* end roster tab wrapper div + conditional */}

          {/* Schedule tab */}
          {activeTab === "schedule" && (
            <div className="px-5 py-4">
              {schedLoading ? (
                <div className="flex items-center gap-2 py-6">
                  <Loader2 size={14} className="animate-spin" style={{ color: "#949598" }} />
                  <span className="text-sm" style={{ color: "#949598" }}>Loading schedule…</span>
                </div>
              ) : !schedule || schedule.length === 0 ? (
                <p className="text-sm py-4" style={{ color: "#949598" }}>No modules found. Add modules in the LMS first.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: "#949598", letterSpacing: "0.14em" }}>
                    Per-Module Session Dates — overrides LMS global dates for this cohort
                  </p>
                  {schedule.map(row => {
                    const isEditing = editingRow === row.moduleId;
                    return (
                      <div key={row.moduleId} className="rounded-xl border p-3 space-y-2" style={{ borderColor: "#e4e0d6", background: "white" }}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold" style={{ color: "#14211f" }}>
                            M{row.moduleNumber} — {row.moduleTitle}
                          </span>
                          {isEditing ? (
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => saveRow(row.moduleId)}
                                disabled={savingRow === row.moduleId}
                                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg text-white transition"
                                style={{ background: "#086c64" }}
                              >
                                {savingRow === row.moduleId ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
                                Save
                              </button>
                              <button onClick={() => setEditingRow(null)}
                                className="text-xs px-2 py-1 rounded-lg transition"
                                style={{ background: "#f1efe8", color: "#5a6663" }}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingRow(row.moduleId);
                                setRowDraft({
                                  preworkDue:      toEasternInput(row.preworkDue),
                                  sessionDate:     toEasternInput(row.sessionDate),
                                  sessionLocation: row.sessionLocation ?? "",
                                  sessionZoomLink: row.sessionZoomLink ?? "",
                                  preambleDate:    toEasternInput(row.preambleDate),
                                });
                              }}
                              className="text-xs font-semibold px-2.5 py-1 rounded-lg transition"
                              style={{ background: "#f1efe8", color: "#5a6663" }}
                            >
                              Edit
                            </button>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-semibold flex items-center gap-1 mb-1" style={{ color: "#949598" }}>
                                <Calendar size={10} /> Prework due
                              </label>
                              <input type="datetime-local"
                                value={(rowDraft.preworkDue as string) ?? ""}
                                onChange={e => setRowDraft(d => ({ ...d, preworkDue: e.target.value }))}
                                className="w-full text-xs border rounded-lg px-2 py-1.5 focus:outline-none"
                                style={{ borderColor: "#e4e0d6", color: "#14211f" }}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold flex items-center gap-1 mb-1" style={{ color: "#949598" }}>
                                <Calendar size={10} /> Session date
                              </label>
                              <input type="datetime-local"
                                value={(rowDraft.sessionDate as string) ?? ""}
                                onChange={e => setRowDraft(d => ({ ...d, sessionDate: e.target.value }))}
                                className="w-full text-xs border rounded-lg px-2 py-1.5 focus:outline-none"
                                style={{ borderColor: "#e4e0d6", color: "#14211f" }}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold flex items-center gap-1 mb-1" style={{ color: "#949598" }}>
                                <MapPin size={10} /> Location
                              </label>
                              <input
                                value={(rowDraft.sessionLocation as string) ?? ""}
                                onChange={e => setRowDraft(d => ({ ...d, sessionLocation: e.target.value }))}
                                placeholder="e.g. Zoom, NYC Office…"
                                className="w-full text-xs border rounded-lg px-2 py-1.5 focus:outline-none"
                                style={{ borderColor: "#e4e0d6", color: "#14211f" }}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold flex items-center gap-1 mb-1" style={{ color: "#949598" }}>
                                <Link2 size={10} /> Zoom link
                              </label>
                              <input
                                value={(rowDraft.sessionZoomLink as string) ?? ""}
                                onChange={e => setRowDraft(d => ({ ...d, sessionZoomLink: e.target.value }))}
                                placeholder="https://zoom.us/j/…"
                                className="w-full text-xs border rounded-lg px-2 py-1.5 focus:outline-none font-mono"
                                style={{ borderColor: "#e4e0d6", color: "#14211f" }}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="text-[10px] font-semibold flex items-center gap-1 mb-1" style={{ color: "#949598" }}>
                                <Send size={10} /> Kick-off email — sends 9:00 AM ET on this date
                              </label>
                              <input type="datetime-local"
                                value={(rowDraft.preambleDate as string) ?? ""}
                                onChange={e => setRowDraft(d => ({ ...d, preambleDate: e.target.value }))}
                                className="w-full text-xs border rounded-lg px-2 py-1.5 focus:outline-none"
                                style={{ borderColor: "#e4e0d6", color: "#14211f" }}
                              />
                              <p className="text-[10px] mt-1" style={{ color: "#949598" }}>
                                Copy lives in Automation → Email Playbook as <span className="font-mono">module-preamble-{row.moduleNumber}</span>.
                                Nothing sends while that template is switched off.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {row.preambleSentAt ? (
                              <span className="text-xs flex items-center gap-1" style={{ color: "#086c64" }}>
                                <Send size={10} />
                                Kick-off sent {new Date(row.preambleSentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </span>
                            ) : row.preambleDate ? (
                              <span className="text-xs flex items-center gap-1" style={{ color: "#b45309" }}>
                                <Send size={10} />
                                Kick-off {new Date(row.preambleDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </span>
                            ) : (
                              <span className="text-xs flex items-center gap-1" style={{ color: "#949598" }}>
                                <Send size={10} /> No kick-off scheduled
                              </span>
                            )}
                            {row.preworkDue ? (
                              <span className="text-xs flex items-center gap-1" style={{ color: "#5a6663" }}>
                                <Calendar size={10} style={{ color: "#949598" }} />
                                Prework due {new Date(row.preworkDue).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                              </span>
                            ) : null}
                            {row.sessionDate ? (
                              <span className="text-xs flex items-center gap-1" style={{ color: "#5a6663" }}>
                                <Calendar size={10} style={{ color: "#086c64" }} />
                                Session {new Date(row.sessionDate).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                              </span>
                            ) : null}
                            {row.sessionLocation ? (
                              <span className="text-xs flex items-center gap-1" style={{ color: "#5a6663" }}>
                                <MapPin size={10} style={{ color: "#949598" }} /> {row.sessionLocation}
                              </span>
                            ) : null}
                            {row.sessionZoomLink ? (
                              <a href={row.sessionZoomLink} target="_blank" rel="noopener noreferrer"
                                className="text-xs flex items-center gap-1 hover:underline" style={{ color: "#086c64" }}>
                                <Link2 size={10} /> Join Zoom
                              </a>
                            ) : null}
                            {!row.preworkDue && !row.sessionDate && !row.sessionLocation && !row.sessionZoomLink && (
                              <span className="text-xs italic" style={{ color: "#c9c4b8" }}>No dates set</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
