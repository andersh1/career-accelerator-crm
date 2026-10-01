"use client";

import { useEffect, useState, useCallback } from "react";
import CohortBoard from "@/components/crm/CohortBoard";
import Link from "next/link";
import { toEasternInput } from "@/lib/timezone";
import { Plus, Edit2, Check, X, Loader2, Power, GraduationCap, Rocket, ChevronDown, ChevronUp, Target, AlertTriangle, Send, BookOpen, Calendar, Link2, MapPin, Save, CalendarDays, FileText, Film } from "lucide-react";

// ─── LMS status helpers ───────────────────────────────────────────────────────

type LmsStatus = "pending" | "invited" | "active" | "graduated" | "withdrawn";

/**
 * "Invited" means we sent them a set-up link — it used to key off onboardedAt,
 * which publishing stamped on every student. Publishing no longer does that (it
 * made them skip the welcome sequence), so invited now has its own field and
 * this reads what actually happened rather than a side effect.
 */
function lmsStatus(s: Student): LmsStatus {
  // Outranks everything. Someone who left still has sections completed and a
  // last-active date, and "Active" is the wrong word for them — it was showing
  // Ethan and Noa as Active two days after their access was revoked.
  if (s.withdrawnAt) return "withdrawn";
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
  withdrawn: "Withdrawn",
};

const STATUS_COLOR: Record<LmsStatus, { bg: string; text: string; dot: string }> = {
  pending:   { bg: "#f1efe8", text: "#949598",  dot: "#c9c4b8" },
  invited:   { bg: "#fef3c7", text: "#92400e",  dot: "#f59e0b" },
  active:    { bg: "#edf5f4", text: "#086c64",  dot: "#086c64" },
  graduated: { bg: "#f0fdf4", text: "#166534",  dot: "#22c55e" },
  withdrawn: { bg: "#fef3c7", text: "#92400e",  dot: "#d97706" },
};

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Student {
  id: string; name: string; email: string; cohort: string | null; cohortId: string | null;
  onboardedAt: string | null;
  invitedAt: string | null;
  certificateIssuedAt: string | null;
  withdrawnAt: string | null;
  sectionsCompleted: number;
  lastActiveAt: string | null;
}


/** "2026-10-12T11:00" → "Mon 12 Oct, 11:00". The generator returns naive
 *  Eastern strings, so this formats the characters rather than constructing a
 *  Date, which would re-interpret them in the browser's own timezone. */
function fmtNaive(naive: string): string {
  const [d, t] = naive.split("T");
  const [y, mo, day] = d.split("-").map(Number);
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(y, mo - 1, day)).getUTCDay()];
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][mo - 1];
  return `${dow} ${day} ${mon}, ${t}`;
}

interface Cohort {
  id: string; name: string; isActive: boolean; founderMode: boolean; capacity: number | null;
  /** COHORT | PRIVATE — a private cohort is one paying 1:1 client. */
  track: string;
  orientationDate: string | null;
  orientationZoomLink: string | null;
  /** This cohort's own Slack invite. Null falls back to the shared one. */
  slackInviteUrl: string | null;
  /** Which content package this cohort is running. Null = the code constants. */
  contentVersionId: string | null;
  contentVersionName: string | null;
  orientationDeckUrl: string | null;
  startDate: string | null; createdAt: string;
  publishedAt: string | null; invitesSent: number;
  enrolled: number; fillPct: number | null; spotsLeft: number | null;
}

/** A row of the generated plan, as naive ET strings, before anything is saved. */
const LMS_BASE = "https://lms.vantagecareer.co";

interface WorkingSession {
  id: string;
  title: string;
  kind: string;
  startsAt: string;
  durationMins: number | null;
  zoomLink: string | null;
  published: boolean;
}

interface ReadinessStep {
  key: string;
  title: string;
  status: "done" | "todo" | "warn" | "optional";
  detail: string;
  where: string;
  href?: string;
  tab?: "setup" | "roster" | "schedule";
}

interface GenRow {
  moduleNumber:   number;
  moduleTitle:    string;
  startDate:      string;
  preworkDue:     string;
  preambleDate:   string;
  sessionDate:    string;
  assignmentDue:  string;
  preambleLocked: boolean;
}

/** One automated email, with the shared copy and this cohort's override side
 *  by side. A null override field means this cohort inherits the shared one. */
interface EmailRow {
  key: string;
  name: string;
  sharedSubject: string;
  sharedBody: string;
  sharedEnabled: boolean;
  subject: string | null;
  body: string | null;
  enabled: boolean | null;
  overridden: boolean;
}

type CohortTab = "setup" | "roster" | "schedule" | "sessions" | "emails";

interface ScheduleEntry {
  moduleId:        string;
  moduleNumber:    number;
  moduleTitle:     string;
  /** The module unlock gate. Blank means it falls back to the global module
   *  date, which is the previous cohort's calendar. */
  startDate:       string | null;
  assignmentDue:   string | null;
  titleOverride:   string | null;
  preworkDue:      string | null;
  sessionDate:     string | null;
  sessionLocation: string | null;
  sessionZoomLink: string | null;
  preambleDate:    string | null;
  preambleSentAt:  string | null;
  preambleSkipped: boolean;
  /** Slide deck and recording for THIS cohort's session. They live in the LMS
   *  as resources on the module's replay section, tagged with this cohort, so
   *  another cohort's Module 4 recording never appears on this one's. */
  deckUrl:         string | null;
  recordingUrl:    string | null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CohortsPage() {
  const [cohorts,  setCohorts]  = useState<Cohort[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  /** Set by the board when a step is clicked, so the card opens on the tab
   *  where that work actually happens rather than always on Setup. */
  const [jumpTo, setJumpTo] = useState<{ id: string; tab: CohortTab; n: number } | null>(null);
  const [boardKey, setBoardKey] = useState(0);

  // Create
  const [creating,      setCreating]      = useState(false);
  const [newName,       setNewName]       = useState("");
  const [newCap,        setNewCap]        = useState("");
  const [newStartDate,  setNewStartDate]  = useState("");
  const [newTrack,      setNewTrack]      = useState<"COHORT" | "PRIVATE">("COHORT");
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
      body: JSON.stringify({ name: newName.trim(), capacity: newCap || null, startDate: newStartDate || null, track: newTrack }),
    });
    const cohort = await res.json();
    setCohorts(prev => [cohort, ...prev]);
    setNewName(""); setNewCap(""); setNewStartDate(""); setNewTrack("COHORT"); setCreating(false); setSavingNew(false);
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
    <div className="p-6 sm:p-8 max-w-6xl mx-auto animate-fade-up space-y-8">
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

      {/* The board. Every cohort in the column its data puts it in, with the
          one thing that needs doing next. Clicking a step opens that cohort's
          panel below, on the tab where the work happens. */}
      <CohortBoard
        refreshKey={boardKey}
        onOpen={(id, tab) => {
          setExpanded(id);
          setJumpTo({ id, tab, n: Date.now() });
          document.getElementById(`cohort-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

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
          <p className="text-sm font-semibold mb-1" style={{ color: "#14211f" }}>New Cohort</p>
          <p className="text-xs mb-4" style={{ color: "#949598" }}>
            A <strong>private</strong> cohort is one paying 1:1 client. They run the same modules on their own
            schedule, with the hot seat, the peer roster and the cohort name switched off — nobody to compare with.
          </p>
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
            <select
              value={newTrack}
              onChange={e => setNewTrack(e.target.value as "COHORT" | "PRIVATE")}
              className="w-48 px-3 py-2.5 text-sm rounded-xl focus:outline-none"
              style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
              title="A private cohort is one paying 1:1 client"
            >
              <option value="COHORT">Group cohort</option>
              <option value="PRIVATE">Private — 1:1 client</option>
            </select>
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
                jumpTo={jumpTo?.id === cohort.id ? jumpTo : null}
                onChanged={() => setBoardKey(k => k + 1)}
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
                jumpTo={jumpTo?.id === cohort.id ? jumpTo : null}
                onChanged={() => setBoardKey(k => k + 1)}
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
  /** The board asked to open this cohort on a tab. `n` makes repeat clicks work. */
  jumpTo?: { tab: CohortTab; n: number } | null;
  /** Tell the board to re-read after something here changes it. */
  onChanged?: () => void;
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
  cohort, students, expanded, onToggleExpand, jumpTo, onChanged,
  editing, editName, editCap, editStartDate,
  onEditStart, onEditName, onEditCap, onEditStartDate,
  onEditSave, onEditCancel, saving,
  onToggleActive, onToggleFounder, onGraduate, onPublish,
  onAssignStudent, reassigning,
}: CohortCardProps) {
  /**
   * Withdrawn Fellows stay on the roster — the record of who was in the cohort
   * matters — but they are not counted as enrolled, and they sort to the
   * bottom so the list reads as the people actually in the program.
   */
  const roster = students.filter(s => s.cohortId === cohort.id);
  const enrolled = roster.filter(s => !s.withdrawnAt);
  const withdrawn = roster.filter(s => s.withdrawnAt);
  const rosterSorted = [...enrolled, ...withdrawn];
  const unenrolled = students.filter(s => !s.cohortId || s.cohortId !== cohort.id);

  // Schedule tab state
  const [activeTab,    setActiveTab]    = useState<CohortTab>("setup");

  // The board asked for a particular tab. Keyed on `n` rather than the tab
  // name so clicking the same step twice still works.
  useEffect(() => { if (jumpTo) setActiveTab(jumpTo.tab); }, [jumpTo?.n, jumpTo]);

  // Working sessions: links and publishing, where the rest of the cohort is set
  // up. Creating them and writing descriptions stays in the LMS.
  const [sessions,     setSessions]     = useState<WorkingSession[] | null>(null);
  const [sessLoading,  setSessLoading]  = useState(false);
  const [sessDraft,    setSessDraft]    = useState<Record<string, { zoomLink: string; published: boolean }>>({});
  const [sessBusy,     setSessBusy]     = useState(false);
  const [sessResult,   setSessResult]   = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setSessLoading(true);
    try {
      const res = await fetch(`/api/crm/cohorts/${cohort.id}/sessions`);
      if (res.ok) {
        const rows: WorkingSession[] = await res.json();
        setSessions(rows);
        setSessDraft(Object.fromEntries(rows.map(r => [r.id, { zoomLink: r.zoomLink ?? "", published: r.published }])));
      }
    } finally {
      setSessLoading(false);
    }
  }, [cohort.id]);

  useEffect(() => {
    if (expanded && activeTab === "sessions" && sessions === null) loadSessions();
  }, [expanded, activeTab, sessions, loadSessions]);

  async function saveSessions() {
    if (!sessions) return;
    setSessBusy(true); setSessResult(null);
    try {
      const updates = sessions
        .filter(r => (sessDraft[r.id]?.zoomLink ?? "") !== (r.zoomLink ?? "")
                  || (sessDraft[r.id]?.published ?? r.published) !== r.published)
        .map(r => ({ id: r.id, zoomLink: sessDraft[r.id].zoomLink, published: sessDraft[r.id].published }));
      if (updates.length === 0) {
        setSessResult("Nothing to save — no links or checkboxes were changed.");
        return;
      }
      const res = await fetch(`/api/crm/cohorts/${cohort.id}/sessions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const r = await res.json();
      if (!res.ok) { setSessResult(r.error ?? "Could not save."); return; }
      setSessResult(`Saved ${r.saved} session${r.saved !== 1 ? "s" : ""}.`);
      await loadSessions();
      await loadReadiness();
    } finally {
      setSessBusy(false);
    }
  }

  // Readiness — read from the database every time the tab opens, so it cannot
  // drift from what is actually configured.
  const [readiness,    setReadiness]    = useState<{ steps: ReadinessStep[]; ready: boolean; outstanding: number } | null>(null);
  const [readyLoading, setReadyLoading] = useState(false);

  // Orientation, edited here rather than in the LMS.
  const [oriDate, setOriDate] = useState("");
  const [oriZoom, setOriZoom] = useState("");
  const [oriDeck, setOriDeck] = useState("");
  const [slackUrl, setSlackUrl] = useState("");
  const [contentVersionId, setContentVersionId] = useState("");
  // Only PUBLISHED versions are offered. A draft is a rewrite in progress, and
  // enrolling a live cohort into one means every save reaches them mid-module.
  const [contentVersions, setContentVersions] = useState<{ id: string; name: string; track: string; status: string }[]>([]);
  const [oriSaving, setOriSaving] = useState(false);
  const [oriSaved,  setOriSaved]  = useState(false);

  // The pre-orientation email. Sent by hand: it goes once, and the timing is a
  // judgement call rather than something to put on a schedule.
  const [oriMail,     setOriMail]     = useState<{ subject: string; html: string; recipients: string[]; alreadySent: string | null } | null>(null);
  const [oriMailBusy, setOriMailBusy] = useState(false);
  const [oriMailMsg,  setOriMailMsg]  = useState<string | null>(null);

  async function orientationEmail(send: boolean, force = false) {
    setOriMailBusy(true); setOriMailMsg(null);
    try {
      const res = await fetch(`/api/crm/cohorts/${cohort.id}/orientation-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(send ? { force } : { dryRun: true }),
      });
      const r = await res.json();
      if (!res.ok) { setOriMailMsg(r.error ?? "Could not do that."); return; }
      if (send) {
        setOriMailMsg(`Sent to ${r.sent} of ${r.of}.`);
        setOriMail(null);
        await loadReadiness();
      } else {
        setOriMail({ subject: r.subject, html: r.html, recipients: r.recipients, alreadySent: r.alreadySent });
      }
    } finally {
      setOriMailBusy(false);
    }
  }

  // One Zoom link across every module, without touching any date.
  const [bulkZoom,   setBulkZoom]   = useState("");
  const [bulkBusy,   setBulkBusy]   = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  // Per-module links, for a cohort where every session is its own Zoom meeting
  // (which is the case whenever the recordings need to carry their own topic).
  const [perModuleOpen, setPerModuleOpen] = useState(false);
  const [perModule,     setPerModule]     = useState<Record<string, string>>({});
  const [perModuleBusy, setPerModuleBusy] = useState(false);

  function openPerModule() {
    setPerModule(Object.fromEntries((schedule ?? []).map(r => [r.moduleId, r.sessionZoomLink ?? ""])));
    setPerModuleOpen(true);
  }

  async function savePerModule() {
    setPerModuleBusy(true); setBulkResult(null);
    try {
      const changed = (schedule ?? []).filter(r => (perModule[r.moduleId] ?? "") !== (r.sessionZoomLink ?? ""));
      for (const r of changed) {
        await fetch(`/api/crm/cohorts/${cohort.id}/schedule`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moduleId: r.moduleId, sessionZoomLink: perModule[r.moduleId] || null }),
        });
      }
      setBulkResult(changed.length
        ? `Saved ${changed.length} link${changed.length !== 1 ? "s" : ""}.`
        : "Nothing changed.");
      setPerModuleOpen(false);
      setSchedule(null);
      await loadReadiness();
    } finally {
      setPerModuleBusy(false);
    }
  }

  async function applyZoomToAll(overwrite: boolean) {
    setBulkBusy(true); setBulkResult(null);
    try {
      const res = await fetch(`/api/crm/cohorts/${cohort.id}/schedule/zoom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zoomLink: bulkZoom, overwrite }),
      });
      const r = await res.json();
      if (!res.ok) { setBulkResult(r.error ?? "Could not apply the link."); return; }
      setBulkResult(
        `Added to ${r.updated} module${r.updated !== 1 ? "s" : ""}` +
        (r.skipped ? `. Left M${r.skippedModules.join(", M")} alone, they already had one.` : ".")
      );
      setSchedule(null);          // refetch so the rows show it
      setBulkZoom("");
    } finally {
      setBulkBusy(false);
    }
  }

  const loadReadiness = useCallback(async () => {
    setReadyLoading(true);
    try {
      const res = await fetch(`/api/crm/cohorts/${cohort.id}/readiness`);
      if (res.ok) setReadiness(await res.json());
    } finally {
      setReadyLoading(false);
    }
  }, [cohort.id]);

  useEffect(() => {
    if (expanded && activeTab === "setup") {
      loadReadiness();
      setOriDate(toEasternInput(cohort.orientationDate));
      setOriZoom(cohort.orientationZoomLink ?? "");
      setOriDeck(cohort.orientationDeckUrl ?? "");
      setSlackUrl(cohort.slackInviteUrl ?? "");
      setContentVersionId(cohort.contentVersionId ?? "");
      fetch("/api/crm/content-versions").then(r => r.ok ? r.json() : [])
        .then(d => setContentVersions(Array.isArray(d) ? d : []))
        .catch(() => setContentVersions([]));
    }
  }, [expanded, activeTab, loadReadiness, cohort.orientationDate, cohort.orientationZoomLink, cohort.orientationDeckUrl]);

  async function saveOrientation() {
    setOriSaving(true);
    try {
      const res = await fetch(`/api/crm/cohorts/${cohort.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orientationDate: oriDate || null,
          orientationZoomLink: oriZoom || null,
          orientationDeckUrl: oriDeck || null,
          slackInviteUrl: slackUrl || null,
          contentVersionId: contentVersionId || null,
        }),
      });
      if (res.ok) {
        await loadReadiness();
        // The checklist above updates, but quietly. Without a word here it
        // reads as if the button did nothing.
        setOriSaved(true);
        onChanged?.();
        setTimeout(() => setOriSaved(false), 4000);
      }
    } finally {
      setOriSaving(false);
    }
  }
  // Per-cohort email overrides. Null until the tab is opened.
  const [emails,       setEmails]       = useState<EmailRow[] | null>(null);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [emailEditing, setEmailEditing]  = useState<string | null>(null);
  const [emailDraft,   setEmailDraft]    = useState<{ subject: string; body: string; enabled: "inherit" | "on" | "off" }>({ subject: "", body: "", enabled: "inherit" });
  const [emailSaving,  setEmailSaving]   = useState<string | null>(null);

  const loadEmails = useCallback(async () => {
    setEmailsLoading(true);
    try {
      const res = await fetch(`/api/crm/cohorts/${cohort.id}/emails`);
      if (res.ok) setEmails(await res.json());
    } finally { setEmailsLoading(false); }
  }, [cohort.id]);

  useEffect(() => {
    if (expanded && activeTab === "emails" && emails === null) loadEmails();
  }, [expanded, activeTab, emails, loadEmails]);

  async function saveEmail(key: string) {
    setEmailSaving(key);
    try {
      const res = await fetch(`/api/crm/cohorts/${cohort.id}/emails`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          subject: emailDraft.subject.trim() || null,
          body:    emailDraft.body.trim() || null,
          enabled: emailDraft.enabled === "inherit" ? null : emailDraft.enabled === "on",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "That did not save.");
        return;
      }
      await loadEmails();
      setEmailEditing(null);
    } finally { setEmailSaving(null); }
  }

  const [schedule,     setSchedule]     = useState<ScheduleEntry[] | null>(null);
  const [schedLoading, setSchedLoading] = useState(false);
  const [editingRow,   setEditingRow]   = useState<string | null>(null);
  const [rowDraft,     setRowDraft]     = useState<Partial<ScheduleEntry>>({});
  const [savingRow,    setSavingRow]    = useState<string | null>(null);

  // Schedule generator — three inputs instead of forty dates.
  const [genOpen,     setGenOpen]     = useState(false);
  const [genFirst,    setGenFirst]    = useState("");
  const [genCadence,  setGenCadence]  = useState(1);
  const [genBreaks,   setGenBreaks]   = useState("");
  const [genZoom,     setGenZoom]     = useState("");
  const [genPreview,  setGenPreview]  = useState<GenRow[] | null>(null);
  const [genErrors,   setGenErrors]   = useState<string[]>([]);
  const [genBusy,     setGenBusy]     = useState(false);

  async function runGenerate(apply: boolean) {
    setGenBusy(true);
    try {
      const res = await fetch(`/api/crm/cohorts/${cohort.id}/schedule/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstSession: genFirst,
          cadenceWeeks: genCadence,
          breakAfter: genBreaks.split(",").map(x => parseInt(x.trim())).filter(n => !isNaN(n)),
          sessionZoomLink: genZoom || null,
          apply,
        }),
      });
      const r = await res.json();
      if (!res.ok) { setGenErrors(r.errors ?? [r.error ?? "Could not build that schedule."]); setGenPreview(null); return; }
      if (apply) {
        setGenOpen(false); setGenPreview(null); setGenErrors([]);
        setSchedule(null);           // force a refetch so the table shows what was written
        setActiveTab("roster"); setActiveTab("schedule");
      } else {
        setGenPreview(r.rows); setGenErrors(r.errors ?? []);
      }
    } finally {
      setGenBusy(false);
    }
  }
  const [sendingPreamble, setSendingPreamble] = useState<string | null>(null);

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

  /**
   * Send a module's kick-off email to the whole cohort, now.
   *
   * Deliberately two calls: a dry run first, so the confirmation names the real
   * recipients and their count rather than asking "are you sure?" about
   * something nobody can see. Eleven people is small enough that sending to the
   * wrong cohort is recoverable and embarrassing, and large enough that it is
   * worth one look before it goes.
   */
  async function sendPreambleNow(moduleId: string, moduleNumber: number) {
    setSendingPreamble(moduleId);
    try {
      const dry = await fetch(`/api/crm/cohorts/${cohort.id}/preamble`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, dryRun: true }),
      });
      const d = await dry.json();
      if (!dry.ok) { alert(d.error ?? "Could not prepare that send."); return; }

      const names = d.wouldSendTo.map((f: { name: string | null; email: string }) => `  ${f.name ?? f.email}`).join("\n");
      if (!confirm(`Send the Module ${moduleNumber} kick-off to ${d.count} Fellows in ${d.cohort}?\n\n${names}\n\nThis cannot be unsent.`)) return;

      const res = await fetch(`/api/crm/cohorts/${cohort.id}/preamble`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId }),
      });
      const r = await res.json();
      if (!res.ok) { alert(r.error ?? "Send failed."); return; }
      alert(r.failed?.length
        ? `Sent to ${r.sent} of ${r.of}. Failed: ${r.failed.join(", ")}`
        : `Sent to all ${r.sent} Fellows.`);
      setSchedule(prev => prev?.map(r => r.moduleId === moduleId ? { ...r, preambleSentAt: new Date().toISOString() } : r) ?? null);
    } finally {
      setSendingPreamble(null);
    }
  }

  /**
   * Re-send one module's kick-off to a single Fellow — the recovery path for
   * when the batch dropped someone (a transient Resend 429). Does not re-mail
   * the cohort: the endpoint sends only to this address and leaves the batch's
   * sent-marker untouched.
   */
  async function resendPreambleToOne(moduleId: string, moduleNumber: number, email: string, name: string) {
    if (!email) return;
    if (!confirm(`Resend the Module ${moduleNumber} kick-off to just ${name} (${email})?\n\nOnly this person gets it — the rest of the cohort is not re-mailed.`)) return;
    setSendingPreamble(moduleId);
    try {
      const res = await fetch(`/api/crm/cohorts/${cohort.id}/preamble`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, resendTo: email }),
      });
      const r = await res.json();
      if (!res.ok || !r.ok) { alert(r.error ?? "Resend failed. Try again in a moment."); return; }
      alert(`Resent to ${r.name ?? r.resendTo}.`);
    } finally {
      setSendingPreamble(null);
    }
  }

  async function saveRow(moduleId: string) {
    setSavingRow(moduleId);
    try {
      // The deck and recording are not CohortSchedule columns — they become
      // resources in the LMS — so they travel separately.
      const { deckUrl, recordingUrl, ...dates } = rowDraft;
      const current = schedule?.find(r => r.moduleId === moduleId);

      const res = await fetch(`/api/crm/cohorts/${cohort.id}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, ...dates }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "The dates did not save. Nothing was changed.");
        return;
      }
      const updated = await res.json();

      // Only post media when it actually changed, so re-saving a date does not
      // rewrite a recording that is already right.
      let media: { deckUrl: string | null; recordingUrl: string | null } | null = null;
      const deckChanged = (deckUrl ?? "") !== (current?.deckUrl ?? "");
      const recChanged  = (recordingUrl ?? "") !== (current?.recordingUrl ?? "");
      if (deckChanged || recChanged) {
        const mRes = await fetch(`/api/crm/cohorts/${cohort.id}/recording`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            moduleId,
            ...(deckChanged ? { deckUrl: deckUrl || null } : {}),
            ...(recChanged  ? { recordingUrl: recordingUrl || null } : {}),
          }),
        });
        if (!mRes.ok) {
          const err = await mRes.json().catch(() => ({}));
          // The dates DID save. Say exactly that, so nobody re-enters them.
          alert(`Dates saved, but the deck and recording did not reach the LMS:\n\n${err.error ?? mRes.status}\n\nYour links are still in the boxes. Try Save again.`);
          return;
        }
        media = await mRes.json();
      }

      setSchedule(prev => prev?.map(r =>
        r.moduleId === moduleId
          ? { ...r, startDate: updated.startDate, assignmentDue: updated.assignmentDue, titleOverride: updated.titleOverride, preworkDue: updated.preworkDue, sessionDate: updated.sessionDate, sessionLocation: updated.sessionLocation, sessionZoomLink: updated.sessionZoomLink, preambleDate: updated.preambleDate, preambleSentAt: updated.preambleSentAt, preambleSkipped: updated.preambleSkipped,
              deckUrl:      media ? media.deckUrl      : r.deckUrl,
              recordingUrl: media ? media.recordingUrl : r.recordingUrl }
          : r
      ) ?? null);
      setEditingRow(null);
      onChanged?.();
    } finally {
      setSavingRow(null);
    }
  }

  const gradCount     = enrolled.filter(s => s.certificateIssuedAt).length;
  const activeCount   = enrolled.filter(s => lmsStatus(s) === "active").length;
  const invitedCount  = enrolled.filter(s => lmsStatus(s) === "invited").length;
  const pendingCount  = enrolled.filter(s => lmsStatus(s) === "pending").length;

  const fillPct  = cohort.capacity ? Math.round((cohort.enrolled / cohort.capacity) * 100) : null;
  /**
   * Filling up is the goal, so it should not look like an emergency.
   *
   * This went red at 90%, which meant a private 1:1 client with one seat and
   * one Fellow — exactly right — rendered as a red 100% bar. Red is now
   * reserved for the one state that is genuinely wrong: more Fellows enrolled
   * than there are seats. Full is amber, as a "plan the next one" nudge, and a
   * private cohort at capacity is simply done.
   */
  const fillColor = fillPct == null ? "#086c64"
    : cohort.track === "PRIVATE" ? "#086c64"
    : fillPct > 100 ? "#dc2626"
    : fillPct >= 90 ? "#d97706"
    : "#086c64";

  return (
    <div id={`cohort-${cohort.id}`} className="card overflow-hidden scroll-mt-4">
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
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "#14211f" }}>{cohort.name}</p>
                  {cohort.track === "PRIVATE" && (
                    <span
                      className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: "#efe7f7", color: "#6d28d9", letterSpacing: "0.1em" }}
                      title="One paying 1:1 client. Hot seat, peer roster and the cohort name are switched off for them."
                    >
                      Private
                    </span>
                  )}
                </div>
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
                  ? "ON — every Fellow in this cohort sees a momentum score and suggested next moves at the top of their dashboard. Click to turn it off."
                  : "OFF — turning it on adds a momentum score and suggested next moves to the top of every Fellow's dashboard in this cohort. It changes what they see, not what you see."}
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
            {(["setup", "roster", "schedule", "sessions", "emails"] as CohortTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="text-xs font-bold uppercase tracking-wide py-2.5 px-3 border-b-2 transition mr-1"
                style={{
                  borderColor:  activeTab === tab ? "#086c64" : "transparent",
                  color:        activeTab === tab ? "#086c64"  : "#949598",
                }}
              >
                {tab === "setup"
                  ? (readiness && readiness.outstanding > 0 ? `Setup (${readiness.outstanding})` : "Setup")
                  : tab === "roster" ? `Roster (${enrolled.length})`
                  : tab === "schedule" ? "Schedule"
                  : tab === "sessions" ? "Sessions"
                  : (emails && emails.some(e => e.overridden) ? `Emails (${emails.filter(e => e.overridden).length})` : "Emails")}
              </button>
            ))}
          </div>


          {/* Emails tab — per-cohort overrides of the shared copy. */}
          {activeTab === "emails" && (
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs" style={{ color: "#5a6663" }}>
                Every automated email uses the shared copy from <strong>Automation → Email Playbook</strong>.
                Override one here and only <strong>{cohort.name}</strong> gets the different version. Leave a
                box blank to keep using the shared one, so changing just the subject still picks up later
                edits to the shared body.
              </p>

              {emailsLoading && <p className="text-xs" style={{ color: "#949598" }}>Loading…</p>}

              {emails?.map(row => {
                const isEditing = emailEditing === row.key;
                const effEnabled = row.enabled ?? row.sharedEnabled;
                return (
                  <div key={row.key} className="rounded-xl border p-3" style={{ borderColor: "#e4e0d6", background: "white" }}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold font-mono" style={{ color: "#14211f" }}>{row.key}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                          style={effEnabled
                            ? { background: "#e6f4f1", color: "#086c64" }
                            : { background: "#f1efe8", color: "#949598" }}>
                          {effEnabled ? "On" : "Off"}
                        </span>
                        {row.overridden && (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                            style={{ background: "#fdf0e3", color: "#b45309" }}>
                            Custom for this cohort
                          </span>
                        )}
                      </div>
                      {isEditing ? (
                        <div className="flex gap-1.5">
                          <button onClick={() => saveEmail(row.key)} disabled={emailSaving === row.key}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg text-white" style={{ background: "#086c64" }}>
                            {emailSaving === row.key ? "Saving…" : "Save"}
                          </button>
                          <button onClick={() => setEmailEditing(null)}
                            className="text-xs px-2 py-1 rounded-lg" style={{ background: "#f1efe8", color: "#5a6663" }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEmailEditing(row.key);
                            setEmailDraft({
                              subject: row.subject ?? "",
                              body:    row.body ?? "",
                              enabled: row.enabled === null ? "inherit" : row.enabled ? "on" : "off",
                            });
                          }}
                          className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                          style={{ background: "#f1efe8", color: "#5a6663" }}>
                          {row.overridden ? "Edit override" : "Override for this cohort"}
                        </button>
                      )}
                    </div>

                    {!isEditing && (
                      <p className="text-xs mt-1.5" style={{ color: "#949598" }}>
                        {row.subject ?? row.sharedSubject}
                        {!row.overridden && " · using the shared copy"}
                      </p>
                    )}

                    {isEditing && (
                      <div className="mt-3 space-y-2">
                        <div>
                          <label className="text-[10px] font-semibold block mb-1" style={{ color: "#949598" }}>
                            Subject — blank keeps the shared one
                          </label>
                          <input
                            value={emailDraft.subject}
                            onChange={e => setEmailDraft(d => ({ ...d, subject: e.target.value }))}
                            placeholder={row.sharedSubject}
                            className="w-full text-xs border rounded-lg px-2 py-1.5"
                            style={{ borderColor: "#e4e0d6", color: "#14211f" }}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold block mb-1" style={{ color: "#949598" }}>
                            Body — blank keeps the shared one
                          </label>
                          <textarea
                            value={emailDraft.body}
                            onChange={e => setEmailDraft(d => ({ ...d, body: e.target.value }))}
                            placeholder={row.sharedBody}
                            rows={8}
                            className="w-full text-xs border rounded-lg px-2 py-1.5 font-mono"
                            style={{ borderColor: "#e4e0d6", color: "#14211f" }}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold block mb-1" style={{ color: "#949598" }}>
                            On or off, for this cohort only
                          </label>
                          <select
                            value={emailDraft.enabled}
                            onChange={e => setEmailDraft(d => ({ ...d, enabled: e.target.value as "inherit" | "on" | "off" }))}
                            className="text-xs border rounded-lg px-2 py-1.5"
                            style={{ borderColor: "#e4e0d6", color: "#14211f" }}>
                            <option value="inherit">Follow the shared setting ({row.sharedEnabled ? "on" : "off"})</option>
                            <option value="on">On for this cohort</option>
                            <option value="off">Off for this cohort</option>
                          </select>
                        </div>
                        <p className="text-[10px]" style={{ color: "#949598" }}>
                          Clearing both boxes and choosing &ldquo;Follow the shared setting&rdquo; removes the
                          override entirely and puts this cohort back on the shared email.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Setup tab — the ordered walkthrough, read from the database so it
              cannot disagree with what is actually configured. */}
          {activeTab === "setup" && (
            <div className="px-5 py-4 space-y-4">
              {readyLoading && !readiness ? (
                <div className="flex items-center gap-2 py-4">
                  <Loader2 size={14} className="animate-spin" style={{ color: "#949598" }} />
                  <span className="text-sm" style={{ color: "#949598" }}>Checking…</span>
                </div>
              ) : readiness ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#949598", letterSpacing: "0.14em" }}>
                      Before this cohort can run
                    </p>
                    <button onClick={loadReadiness} className="text-[10px] font-semibold" style={{ color: "#086c64" }}>
                      {readyLoading ? "Checking…" : "Re-check"}
                    </button>
                  </div>

                  {readiness.ready && (
                    <div className="rounded-xl px-4 py-3" style={{ background: "#edf5f4", border: "1px solid #d0e8e6" }}>
                      <p className="text-xs font-semibold" style={{ color: "#086c64" }}>
                        Everything is set. This cohort is ready to run.
                      </p>
                    </div>
                  )}

                  <ol className="space-y-2">
                    {readiness.steps.map((step, i) => {
                      const tone =
                        step.status === "done"     ? { dot: "#0A7A70", bg: "white",   text: "#5a6663" } :
                        step.status === "warn"     ? { dot: "#c0622f", bg: "#fdf6f2", text: "#8a4520" } :
                        step.status === "optional" ? { dot: "#c9c4b8", bg: "white",   text: "#949598" } :
                                                     { dot: "#b91c1c", bg: "#fef7f7", text: "#8a2020" };
                      return (
                        <li key={step.key} className="rounded-xl border p-3 flex gap-3"
                            style={{ borderColor: "#e4e0d6", background: tone.bg }}>
                          <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white mt-0.5"
                                style={{ background: tone.dot }}>
                            {step.status === "done" ? "✓" : i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold" style={{ color: "#14211f" }}>{step.title}</p>
                            <p className="text-[11px] mt-0.5" style={{ color: tone.text }}>{step.detail}</p>
                            <p className="text-[10px] mt-1">
                              {step.href ? (
                                <a href={step.href} target={step.href.startsWith("http") ? "_blank" : undefined}
                                   rel="noopener noreferrer"
                                   className="font-semibold underline" style={{ color: "#086c64" }}>
                                  {step.where} {step.href.startsWith("http") ? "↗" : "→"}
                                </a>
                              ) : step.tab ? (
                                <button
                                  onClick={() => setActiveTab(step.tab!)}
                                  className="font-semibold underline"
                                  style={{ color: "#086c64" }}
                                >
                                  {step.where} →
                                </button>
                              ) : (
                                <span style={{ color: "#949598" }}>{step.where}</span>
                              )}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>

                  {/* Orientation, inline — it used to live only in the LMS. */}
                  <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: "#e4e0d6" }}>
                    <p className="text-xs font-semibold" style={{ color: "#14211f" }}>Orientation</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold" style={{ color: "#949598" }}>Date and time (ET)</span>
                        <input type="datetime-local" value={oriDate} onChange={e => setOriDate(e.target.value)}
                          className="text-xs border rounded-lg px-2 py-1.5" style={{ borderColor: "#e4e0d6", color: "#14211f" }} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold" style={{ color: "#949598" }}>Zoom link</span>
                        <input value={oriZoom} onChange={e => setOriZoom(e.target.value)} placeholder="https://zoom.us/j/…"
                          className="text-xs border rounded-lg px-2 py-1.5" style={{ borderColor: "#e4e0d6", color: "#14211f" }} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold" style={{ color: "#949598" }}>Deck link</span>
                        <input value={oriDeck} onChange={e => setOriDeck(e.target.value)} placeholder="Google Slides /preview link"
                          className="text-xs border rounded-lg px-2 py-1.5" style={{ borderColor: "#e4e0d6", color: "#14211f" }} />
                      </label>
                      <label className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-[10px] font-semibold" style={{ color: "#949598" }}>Content version</span>
                        <select value={contentVersionId} onChange={e => setContentVersionId(e.target.value)}
                          className="text-xs border rounded-lg px-2 py-1.5" style={{ borderColor: "#e4e0d6", color: "#14211f" }}>
                          <option value="">Latest code — whatever is deployed</option>
                          {contentVersions.filter(v => v.status === "PUBLISHED" || v.id === contentVersionId)
                            .map(v => <option key={v.id} value={v.id}>{v.name} ({v.track}){v.status !== "PUBLISHED" ? ` — ${v.status.toLowerCase()}` : ""}</option>)}
                        </select>
                        <span className="text-[9px]" style={{ color: "#949598" }}>
                          The module content this cohort runs. Pick it once at launch and it stays put, so
                          rewriting the next version never changes what this group is reading. Leave it on
                          &ldquo;Latest code&rdquo; and nothing changes from how it has always worked. Manage versions
                          under Content.
                        </span>
                      </label>
                      <label className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-[10px] font-semibold" style={{ color: "#949598" }}>Slack invite for this cohort</span>
                        <input value={slackUrl} onChange={e => setSlackUrl(e.target.value)} placeholder="Leave blank to use the shared Vantage Slack invite"
                          className="text-xs border rounded-lg px-2 py-1.5 font-mono" style={{ borderColor: "#e4e0d6", color: "#14211f" }} />
                        <span className="text-[9px]" style={{ color: "#949598" }}>
                          Blank means this cohort gets the shared invite, which is how every cohort worked before.
                          Set one when a group needs its own workspace: a private 1:1 client should not land in a
                          group cohort&rsquo;s Slack.
                        </span>
                      </label>
                    </div>
                    <button onClick={saveOrientation} disabled={oriSaving}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40"
                      style={{ background: "#086c64" }}>
                      {oriSaving ? "Saving…" : "Save orientation"}
                    </button>
                    {oriSaved && (
                      <span className="text-xs font-semibold ml-2" style={{ color: "#086c64" }}>
                        Saved. The checklist above has been re-checked.
                      </span>
                    )}
                    {/* What the Founder Mode button in the header actually does.
                        It had a tooltip, but a tooltip you have to hover is how
                        a control ends up unexplained for months. */}
                    <div className="mt-4 pt-3 border-t" style={{ borderColor: "#e4e0d6" }}>
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#949598" }}>
                        Founder Mode — currently {cohort.founderMode ? "ON" : "off"} for this cohort
                      </p>
                      <p className="text-[11px]" style={{ color: "#5a6663" }}>
                        It changes what <strong>Fellows</strong> see, not what you see. With it on, everyone in this
                        cohort gets a momentum score and a short list of suggested next moves at the top of their
                        dashboard. The toggle is the rocket button at the top of this card.
                      </p>
                    </div>

                    <button
                      onClick={() => orientationEmail(false)}
                      disabled={oriMailBusy}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg ml-2 disabled:opacity-40"
                      style={{ border: "1px solid #086c64", color: "#086c64" }}
                    >
                      {oriMailBusy ? "…" : "Preview the orientation email"}
                    </button>
                    {oriMailMsg && (
                      <p className="text-[11px] mt-2 font-semibold" style={{ color: "#086c64" }}>{oriMailMsg}</p>
                    )}

                    {oriMail && (
                      <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "#e4e0d6", background: "#fbfaf7" }}>
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#949598" }}>
                          Goes to {oriMail.recipients.length} {oriMail.recipients.length === 1 ? "person" : "people"}
                        </p>
                        <p className="text-[11px] mb-2" style={{ color: "#5a6663" }}>
                          {oriMail.recipients.join(", ") || "Nobody yet. Publish the cohort first."}
                        </p>
                        {oriMail.alreadySent && (
                          <p className="text-[11px] mb-2 font-semibold" style={{ color: "#c0622f" }}>
                            Already sent {new Date(oriMail.alreadySent).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
                          </p>
                        )}
                        <p className="text-xs font-semibold mb-2" style={{ color: "#14211f" }}>{oriMail.subject}</p>
                        <div
                          className="rounded-lg overflow-auto bg-white"
                          style={{ maxHeight: 340, border: "1px solid #e4e0d6" }}
                          dangerouslySetInnerHTML={{ __html: oriMail.html }}
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => orientationEmail(true, !!oriMail.alreadySent)}
                            disabled={oriMailBusy || oriMail.recipients.length === 0}
                            className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-40"
                            style={{ background: "#086c64" }}
                          >
                            {oriMailBusy ? "Sending…" : oriMail.alreadySent ? "Send again" : `Send to ${oriMail.recipients.length}`}
                          </button>
                          <button onClick={() => setOriMail(null)}
                            className="px-3 py-1.5 text-xs rounded-lg" style={{ background: "#f1efe8", color: "#5a6663" }}>
                            Close
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm py-4" style={{ color: "#949598" }}>Could not load the checklist.</p>
              )}
            </div>
          )}

          {/* Working sessions: the two fields touched every week. Creating a
              session and writing its description stays in the LMS. */}
          {activeTab === "sessions" && (
            <div className="px-5 py-4">
              {sessLoading && !sessions ? (
                <div className="flex items-center gap-2 py-4">
                  <Loader2 size={14} className="animate-spin" style={{ color: "#949598" }} />
                  <span className="text-sm" style={{ color: "#949598" }}>Loading…</span>
                </div>
              ) : !sessions || sessions.length === 0 ? (
                <div className="py-4">
                  <p className="text-sm" style={{ color: "#949598" }}>
                    No working sessions for this cohort yet.
                  </p>
                  <a href={`${LMS_BASE}/admin/sessions`} target="_blank" rel="noopener noreferrer"
                     className="text-xs font-semibold underline" style={{ color: "#086c64" }}>
                    Create them in the LMS ↗
                  </a>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: "#949598", letterSpacing: "0.14em" }}>
                    Zoom links and publishing
                  </p>
                  <p className="text-[10px] mb-3" style={{ color: "#949598" }}>
                    Paste the links, tick the ones Fellows should see, save once. Titles, dates and descriptions are
                    edited in the LMS.
                  </p>

                  {sessions.map(r => (
                    <div key={r.id} className="rounded-xl border p-3" style={{ borderColor: "#e4e0d6", background: "white" }}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate" style={{ color: "#14211f" }}>{r.title}</p>
                          <p className="text-[10px]" style={{ color: "#949598" }}>
                            {new Date(r.startsAt).toLocaleString("en-US", {
                              timeZone: "America/New_York", weekday: "short", month: "short",
                              day: "numeric", hour: "numeric", minute: "2-digit",
                            })} ET{r.durationMins ? ` · ${r.durationMins} min` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {!r.published && (
                            <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                                  style={{ background: "#fdf0e8", color: "#c0622f", letterSpacing: "0.1em" }}>
                              Hidden now
                            </span>
                          )}
                          {/* The label says what ticking DOES. An unticked box
                              beside the word "Hidden" reads as "tick to hide". */}
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={sessDraft[r.id]?.published ?? r.published}
                              onChange={e => setSessDraft(d => ({ ...d, [r.id]: { ...d[r.id], published: e.target.checked } }))}
                            />
                            <span className="text-[10px] font-semibold" style={{ color: "#086c64" }}>
                              Show to Fellows
                            </span>
                          </label>
                        </div>
                      </div>
                      <input
                        value={sessDraft[r.id]?.zoomLink ?? ""}
                        onChange={e => setSessDraft(d => ({ ...d, [r.id]: { ...d[r.id], zoomLink: e.target.value } }))}
                        placeholder="https://zoom.us/j/…"
                        className="w-full px-2 py-1.5 text-[11px] rounded-lg"
                        style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
                      />
                    </div>
                  ))}

                  {sessions.some(r => !(sessDraft[r.id]?.published ?? r.published)) && (
                    <button
                      onClick={() => setSessDraft(d => Object.fromEntries(
                        sessions.map(r => [r.id, { ...d[r.id], published: true }])
                      ))}
                      className="text-[11px] font-semibold underline"
                      style={{ color: "#086c64" }}
                    >
                      Tick them all →
                    </button>
                  )}

                  <div className="flex items-center gap-3 pt-1">
                    <button onClick={saveSessions} disabled={sessBusy}
                      className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-40"
                      style={{ background: "#086c64" }}>
                      {sessBusy ? "Saving…" : "Save all sessions"}
                    </button>
                    {sessResult && (
                      <span className="text-[11px] font-semibold" style={{ color: "#086c64" }}>{sessResult}</span>
                    )}
                    <a href={`${LMS_BASE}/admin/sessions`} target="_blank" rel="noopener noreferrer"
                       className="text-[10px] underline ml-auto" style={{ color: "#949598" }}>
                      Edit titles or descriptions in the LMS ↗
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Roster tab */}
          {activeTab === "roster" && (
          <div>
          <div className="px-5 py-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#949598", letterSpacing: "0.14em" }}>
                Enrolled · {enrolled.length}
                {withdrawn.length > 0 && (
                  <span style={{ color: "#b45309", marginLeft: 6 }}>
                    · {withdrawn.length} withdrawn
                  </span>
                )}
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
            {rosterSorted.length === 0 ? (
              <p className="text-sm py-2" style={{ color: "#949598" }}>No students enrolled yet.</p>
            ) : (
              <div className="space-y-1">
                {rosterSorted.map(s => {
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
                  {/* One link on every module. Separate from the generator on
                      purpose: adding Zoom links is the routine job, rewriting
                      the whole schedule is not, and doing it through the
                      generator would move dates to change one field. */}
                  <div className="rounded-xl border p-3 mb-2" style={{ borderColor: "#e4e0d6", background: "white" }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: "#14211f" }}>Zoom link for every module</p>
                    <p className="text-[10px] mb-2" style={{ color: "#949598" }}>
                      For a cohort that meets on one recurring link. Fills in the modules that have none and leaves
                      any module you have given its own. No dates are changed.
                    </p>
                    <div className="flex gap-2 flex-wrap items-center">
                      <input
                        value={bulkZoom}
                        onChange={e => setBulkZoom(e.target.value)}
                        placeholder="https://zoom.us/j/…"
                        className="flex-1 min-w-[220px] px-2.5 py-2 text-xs rounded-lg"
                        style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
                      />
                      <button
                        onClick={() => applyZoomToAll(false)}
                        disabled={!bulkZoom.trim() || bulkBusy}
                        className="px-3 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-40"
                        style={{ background: "#086c64" }}
                      >
                        {bulkBusy ? "Applying…" : "Add to all modules"}
                      </button>
                      <button
                        onClick={() => applyZoomToAll(true)}
                        disabled={!bulkZoom.trim() || bulkBusy}
                        className="px-3 py-2 text-xs font-semibold rounded-lg disabled:opacity-40"
                        style={{ border: "1px solid #e4e0d6", color: "#5a6663" }}
                        title="Replace the link on every module, including ones that already have one"
                      >
                        Replace all
                      </button>
                    </div>
                    {bulkResult && (
                      <p className="text-[11px] mt-2 font-semibold" style={{ color: "#086c64" }}>{bulkResult}</p>
                    )}

                    {/* A separate Zoom meeting per session is the right call when
                        the recordings have to carry their own topic, which means
                        eight different links. Eight edit-and-save cycles for that
                        is the friction this avoids. */}
                    {!perModuleOpen ? (
                      <button onClick={openPerModule} className="text-[11px] font-semibold mt-2 underline" style={{ color: "#086c64" }}>
                        Each module has its own Zoom meeting? Paste all eight here →
                      </button>
                    ) : (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-[10px]" style={{ color: "#949598" }}>
                          One link per module. Leave a row blank to clear it. Saved together when you press Save.
                        </p>
                        {(schedule ?? []).map(r => (
                          <div key={r.moduleId} className="flex items-center gap-2">
                            <span className="text-[10px] font-bold w-8 flex-shrink-0" style={{ color: "#5a6663" }}>
                              M{r.moduleNumber}
                            </span>
                            <input
                              value={perModule[r.moduleId] ?? ""}
                              onChange={e => setPerModule(m => ({ ...m, [r.moduleId]: e.target.value }))}
                              placeholder="https://zoom.us/j/…"
                              className="flex-1 px-2 py-1.5 text-[11px] rounded-lg"
                              style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
                            />
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <button onClick={savePerModule} disabled={perModuleBusy}
                            className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-40"
                            style={{ background: "#086c64" }}>
                            {perModuleBusy ? "Saving…" : "Save all links"}
                          </button>
                          <button onClick={() => setPerModuleOpen(false)}
                            className="px-3 py-1.5 text-xs rounded-lg"
                            style={{ background: "#f1efe8", color: "#5a6663" }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Generator — lays out all eight modules from the first session.
                      Doing this by hand is forty dates typed one at a time. */}
                  <div className="rounded-xl border p-3 mb-3" style={{ borderColor: "#d0e8e6", background: "#f4faf9" }}>
                    <button
                      onClick={() => setGenOpen(o => !o)}
                      className="flex items-center gap-2 text-xs font-semibold"
                      style={{ color: "#086c64" }}
                    >
                      <CalendarDays size={13} />
                      {genOpen ? "Hide" : "Build the whole schedule from the first session"}
                    </button>

                    {genOpen && (
                      <div className="mt-3 space-y-3">
                        <div className="flex gap-2 flex-wrap items-end">
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold" style={{ color: "#5a6663" }}>First session (ET)</span>
                            <input
                              type="datetime-local"
                              value={genFirst}
                              onChange={e => setGenFirst(e.target.value)}
                              className="px-2.5 py-2 text-xs rounded-lg"
                              style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold" style={{ color: "#5a6663" }}>Every</span>
                            <select
                              value={genCadence}
                              onChange={e => setGenCadence(parseInt(e.target.value))}
                              className="px-2.5 py-2 text-xs rounded-lg"
                              style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
                            >
                              <option value={1}>1 week</option>
                              <option value={2}>2 weeks</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold" style={{ color: "#5a6663" }}>Break week after module</span>
                            <input
                              value={genBreaks}
                              onChange={e => setGenBreaks(e.target.value)}
                              placeholder="e.g. 5"
                              className="w-28 px-2.5 py-2 text-xs rounded-lg"
                              style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
                            />
                          </label>
                          <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
                            <span className="text-[10px] font-semibold" style={{ color: "#5a6663" }}>Zoom link for every session (optional)</span>
                            <input
                              value={genZoom}
                              onChange={e => setGenZoom(e.target.value)}
                              placeholder="https://zoom.us/j/…"
                              className="px-2.5 py-2 text-xs rounded-lg"
                              style={{ border: "1px solid #e4e0d6", color: "#14211f" }}
                            />
                          </label>
                          <button
                            onClick={() => runGenerate(false)}
                            disabled={!genFirst || genBusy}
                            className="px-3 py-2 text-xs font-semibold rounded-lg disabled:opacity-40"
                            style={{ border: "1px solid #086c64", color: "#086c64" }}
                          >
                            {genBusy ? "…" : "Preview"}
                          </button>
                        </div>

                        <p className="text-[10px]" style={{ color: "#949598" }}>
                          Content opens 6 days before each session, pre-work is due 2 nights before, the kick-off email
                          goes 4 days before, and the assignment is due the Friday after. Nothing is saved until you
                          press Apply.
                        </p>
                        <p className="text-[10px]" style={{ color: "#c0622f" }}>
                          This rewrites every date. If you only need Zoom links, use the box above instead. On a cohort
                          with a break week, regenerating can also move a module&rsquo;s opening date, so check the
                          preview against what is already there.
                        </p>

                        {genErrors.length > 0 && (
                          <div className="rounded-lg p-2.5" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
                            {genErrors.map((e, i) => (
                              <p key={i} className="text-[11px]" style={{ color: "#b91c1c" }}>{e}</p>
                            ))}
                          </div>
                        )}

                        {genPreview && (
                          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #e4e0d6" }}>
                            <table className="w-full text-[10px]">
                              <thead>
                                <tr style={{ background: "#f8f6f1", color: "#5a6663" }}>
                                  <th className="text-left px-2 py-1.5 font-semibold">Module</th>
                                  <th className="text-left px-2 py-1.5 font-semibold">Opens</th>
                                  <th className="text-left px-2 py-1.5 font-semibold">Pre-work due</th>
                                  <th className="text-left px-2 py-1.5 font-semibold">Kick-off email</th>
                                  <th className="text-left px-2 py-1.5 font-semibold">Session</th>
                                  <th className="text-left px-2 py-1.5 font-semibold">Assignment due</th>
                                </tr>
                              </thead>
                              <tbody>
                                {genPreview.map(r => (
                                  <tr key={r.moduleNumber} style={{ borderTop: "1px solid #e4e0d6", color: "#14211f" }}>
                                    <td className="px-2 py-1.5 font-semibold">M{r.moduleNumber}</td>
                                    <td className="px-2 py-1.5">{fmtNaive(r.startDate)}</td>
                                    <td className="px-2 py-1.5">{fmtNaive(r.preworkDue)}</td>
                                    <td className="px-2 py-1.5">
                                      {r.preambleLocked
                                        ? <span style={{ color: "#949598" }}>already sent — unchanged</span>
                                        : fmtNaive(r.preambleDate)}
                                    </td>
                                    <td className="px-2 py-1.5 font-semibold">{fmtNaive(r.sessionDate)}</td>
                                    <td className="px-2 py-1.5">{fmtNaive(r.assignmentDue)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="flex items-center justify-between px-2 py-2" style={{ background: "#f8f6f1" }}>
                              <span className="text-[10px]" style={{ color: "#949598" }}>
                                This replaces the dates on all {genPreview.length} modules for this cohort.
                              </span>
                              <button
                                onClick={() => runGenerate(true)}
                                disabled={genBusy || genErrors.length > 0}
                                className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-40"
                                style={{ background: "#086c64" }}
                              >
                                {genBusy ? "Saving…" : "Apply to this cohort"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

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
                                  startDate:       toEasternInput(row.startDate),
                                  assignmentDue:   toEasternInput(row.assignmentDue),
                                  titleOverride:   row.titleOverride ?? "",
                                  preworkDue:      toEasternInput(row.preworkDue),
                                  sessionDate:     toEasternInput(row.sessionDate),
                                  sessionLocation: row.sessionLocation ?? "",
                                  sessionZoomLink: row.sessionZoomLink ?? "",
                                  preambleDate:    toEasternInput(row.preambleDate),
                                  preambleSkipped: row.preambleSkipped,
                                  deckUrl:         row.deckUrl ?? "",
                                  recordingUrl:    row.recordingUrl ?? "",
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
                                <Calendar size={10} /> Module opens
                              </label>
                              <input type="datetime-local"
                                value={(rowDraft.startDate as string) ?? ""}
                                onChange={e => setRowDraft(d => ({ ...d, startDate: e.target.value }))}
                                className="w-full text-xs border rounded-lg px-2 py-1.5 focus:outline-none"
                                style={{ borderColor: "#e4e0d6", color: "#14211f" }}
                              />
                              <p className="text-[9px] mt-0.5" style={{ color: "#c0622f" }}>
                                {row.startDate ? "" : "Blank — this module will use the LMS global date, which is the previous cohort's."}
                              </p>
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold flex items-center gap-1 mb-1" style={{ color: "#949598" }}>
                                <Calendar size={10} /> Assignment due
                              </label>
                              <input type="datetime-local"
                                value={(rowDraft.assignmentDue as string) ?? ""}
                                onChange={e => setRowDraft(d => ({ ...d, assignmentDue: e.target.value }))}
                                className="w-full text-xs border rounded-lg px-2 py-1.5 focus:outline-none"
                                style={{ borderColor: "#e4e0d6", color: "#14211f" }}
                              />
                            </div>
                            {cohort.track === "PRIVATE" && (
                              <div>
                                <label className="text-[10px] font-semibold flex items-center gap-1 mb-1" style={{ color: "#949598" }}>
                                  Module title for this client
                                </label>
                                <input
                                  value={(rowDraft.titleOverride as string) ?? ""}
                                  onChange={e => setRowDraft(d => ({ ...d, titleOverride: e.target.value }))}
                                  placeholder={row.moduleTitle}
                                  className="w-full text-xs border rounded-lg px-2 py-1.5 focus:outline-none"
                                  style={{ borderColor: "#e4e0d6", color: "#14211f" }}
                                />
                                <p className="text-[9px] mt-0.5" style={{ color: "#949598" }}>
                                  Leave blank to use &ldquo;{row.moduleTitle}&rdquo;.
                                </p>
                              </div>
                            )}
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

                            {/* After the session: what the Fellows get to keep.
                                Saved to the LMS against THIS cohort, so another
                                cohort's Module 4 recording is never replaced. */}
                            <div className="sm:col-span-2 rounded-lg border p-2.5" style={{ borderColor: "#e4e0d6", background: "#faf9f5" }}>
                              <p className="text-[10px] font-semibold mb-2" style={{ color: "#14211f" }}>
                                After the session — only {cohort.name} sees these
                              </p>
                              <div className="grid sm:grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10px] font-semibold flex items-center gap-1 mb-1" style={{ color: "#949598" }}>
                                    <FileText size={10} /> Slide deck
                                  </label>
                                  <input
                                    value={(rowDraft.deckUrl as string) ?? ""}
                                    onChange={e => setRowDraft(d => ({ ...d, deckUrl: e.target.value }))}
                                    placeholder="Google Slides or PDF link"
                                    className="w-full text-xs border rounded-lg px-2 py-1.5 focus:outline-none font-mono"
                                    style={{ borderColor: "#e4e0d6", color: "#14211f" }}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold flex items-center gap-1 mb-1" style={{ color: "#949598" }}>
                                    <Film size={10} /> Session recording
                                  </label>
                                  <input
                                    value={(rowDraft.recordingUrl as string) ?? ""}
                                    onChange={e => setRowDraft(d => ({ ...d, recordingUrl: e.target.value }))}
                                    placeholder="Zoom cloud, Drive, YouTube…"
                                    className="w-full text-xs border rounded-lg px-2 py-1.5 focus:outline-none font-mono"
                                    style={{ borderColor: "#e4e0d6", color: "#14211f" }}
                                  />
                                </div>
                              </div>
                              <p className="text-[9px] mt-1.5" style={{ color: "#949598" }}>
                                Paste the normal share link. Google links are converted so they play inside the LMS
                                instead of opening a sign-in page. Clear a box to remove it. Saved with this module.
                              </p>
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
                              <label className="flex items-start gap-2 mt-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!!rowDraft.preambleSkipped}
                                  onChange={e => setRowDraft(d => ({ ...d, preambleSkipped: e.target.checked }))}
                                  className="mt-0.5"
                                />
                                <span className="text-[10px]" style={{ color: "#5a6663" }}>
                                  <strong>Skip this kick-off for this cohort.</strong> Only this cohort. The template
                                  stays on for everyone else, and the date above is kept so you can turn it back on
                                  without retyping it.
                                </span>
                              </label>
                              <p className="text-[10px] mt-1" style={{ color: "#949598" }}>
                                Copy lives in Automation → Email Playbook as <span className="font-mono">module-preamble-{row.moduleNumber}</span>.
                                Nothing sends while that template is switched off.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            <span className="text-xs flex items-center gap-1"
                              style={{ color: row.deckUrl ? "#086c64" : "#949598" }}>
                              <FileText size={10} /> {row.deckUrl ? "Deck posted" : "No deck"}
                            </span>
                            <span className="text-xs flex items-center gap-1"
                              style={{ color: row.recordingUrl ? "#086c64" : "#949598" }}>
                              <Film size={10} /> {row.recordingUrl ? "Recording posted" : "No recording"}
                            </span>
                            {row.preambleSentAt ? (
                              <span className="text-xs flex items-center gap-1" style={{ color: "#086c64" }}>
                                <Send size={10} />
                                Kick-off sent {new Date(row.preambleSentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </span>
                            ) : row.preambleSkipped ? (
                              <span className="text-xs flex items-center gap-1" style={{ color: "#949598" }}>
                                <Send size={10} /> Kick-off skipped for this cohort
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
                            {!row.preambleSentAt && (
                              <button
                                onClick={() => sendPreambleNow(row.moduleId, row.moduleNumber)}
                                disabled={sendingPreamble === row.moduleId}
                                className="text-xs font-semibold px-2 py-0.5 rounded-lg border hover:shadow-sm transition disabled:opacity-50"
                                style={{ borderColor: "#e4e0d6", color: "#086c64" }}>
                                {sendingPreamble === row.moduleId ? "Sending…" : "Send kick-off now"}
                              </button>
                            )}
                            {/* Once the batch has gone out, offer a one-Fellow
                                resend for anyone the send dropped (a transient
                                Resend 429). Picks by name; nobody else is mailed. */}
                            {row.preambleSentAt && enrolled.length > 0 && (
                              <select
                                aria-label="Resend this kick-off to one Fellow"
                                disabled={sendingPreamble === row.moduleId}
                                value=""
                                onChange={e => {
                                  const f = enrolled.find(s => s.email === e.target.value);
                                  e.currentTarget.value = "";
                                  if (f) resendPreambleToOne(row.moduleId, row.moduleNumber, f.email, f.name);
                                }}
                                className="text-xs font-semibold px-2 py-0.5 rounded-lg border hover:shadow-sm transition disabled:opacity-50 bg-white"
                                style={{ borderColor: "#e4e0d6", color: "#086c64" }}>
                                <option value="">{sendingPreamble === row.moduleId ? "Resending…" : "Resend to one…"}</option>
                                {enrolled.map(s => (
                                  <option key={s.id} value={s.email}>{s.name}</option>
                                ))}
                              </select>
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
