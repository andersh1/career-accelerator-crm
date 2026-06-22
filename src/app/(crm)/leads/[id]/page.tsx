"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Mail, Phone, Building2, Briefcase, Linkedin, Tag,
  Loader2, CheckCircle2, Trash2, Edit2, MessageSquare, Send,
  ChevronDown, UserCheck, Sparkles, FileText, PenLine,
} from "lucide-react";
import { STAGES, ACTIVITY_TYPES, ACTIVITY_META, stageInfo, sourceLabel } from "@/components/crm/constants";
import LeadForm from "@/components/crm/LeadForm";
import StudentProgressPanel from "@/components/crm/StudentProgressPanel";
import TaskPanel from "@/components/crm/TaskPanel";
import EmailTemplateMenu from "@/components/crm/EmailTemplates";
import SequenceEnrollPanel from "@/components/crm/SequenceEnrollPanel";
import EmailComposer from "@/components/crm/EmailComposer";
import PaymentPanel from "@/components/crm/PaymentPanel";
import TranscriptParser from "@/components/crm/TranscriptParser";
import { useToast } from "@/lib/toast";

interface Activity {
  id: string; type: string; content: string | null;
  metadata: string | null; createdBy: string | null; createdAt: string;
  subject?: string | null; emailTo?: string | null; source?: string | null;
  openedAt?: string | null;
}

interface Lead {
  id: string; firstName: string; lastName: string; email: string;
  phone: string | null; company: string | null; jobTitle: string | null;
  linkedinUrl: string | null; stage: string; source: string | null;
  priority: string; paymentStatus: string | null; dealValue: number | null; tags: string[]; notes: string | null; lostReason: string | null;
  enrolledUserId: string | null;
  enrolledUser: { id: string; name: string; email: string; cohort: string | null } | null;
  activities: Activity[];
  createdAt: string; updatedAt: string;
}

interface Cohort { id: string; name: string; isActive: boolean; capacity: number | null; enrolled: number; spotsLeft: number | null; }

export default function LeadDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const { success, error: toastError } = useToast();

  const [lead,          setLead]          = useState<Lead | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [showEdit,      setShowEdit]      = useState(false);
  const [showConvert,   setShowConvert]   = useState(false);
  const [cohorts,       setCohorts]       = useState<Cohort[]>([]);
  const [actType,       setActType]       = useState("NOTE");
  const [actContent,    setActContent]    = useState("");
  const [addingAct,     setAddingAct]     = useState(false);
  const [showStageMenu, setShowStageMenu] = useState(false);
  const [movingStage,   setMovingStage]   = useState(false);
  const [convertCohortId, setConvertCohortId] = useState("");
  const [sendInvite,    setSendInvite]    = useState(true);
  const [converting,    setConverting]    = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [enriching,     setEnriching]     = useState(false);
  const [showComposer,  setShowComposer]  = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showAllActs, setShowAllActs] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/leads/${id}`);
    if (!res.ok) { router.push("/pipeline"); return; }
    setLead(await res.json());
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/cohorts").then(r => r.json()).then((data: Cohort[]) => {
      if (Array.isArray(data)) setCohorts(data);
    });
  }, []);

  async function moveStage(newStage: string) {
    if (!lead) return;
    setMovingStage(true);
    setShowStageMenu(false);
    const res = await fetch(`/api/crm/leads/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    });
    if (res.ok) {
      await load();
      success(`Moved to ${stageInfo(newStage).label}`);
    }
    setMovingStage(false);
  }

  async function addActivity() {
    if (!actContent.trim()) return;
    setAddingAct(true);
    const res = await fetch(`/api/crm/leads/${id}/activity`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: actType, content: actContent }),
    });
    if (res.ok) {
      setActContent("");
      await load();
      success("Activity logged.");
    } else {
      toastError("Failed to log activity");
    }
    setAddingAct(false);
  }

  async function convertLead() {
    setConverting(true);
    const res = await fetch(`/api/crm/leads/${id}/convert`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cohortId: convertCohortId || null, sendInvite }),
    });
    const data = await res.json();
    if (res.ok) {
      success(data.alreadyExisted ? "Linked to existing student account." : "Student account created! Invite email sent.");
      setShowConvert(false);
      await load();
    } else {
      toastError(data.error ?? "Conversion failed");
    }
    setConverting(false);
  }

  async function deleteLead() {
    if (!confirm("Delete this lead? This cannot be undone.")) return;
    setDeleting(true);
    await fetch(`/api/crm/leads/${id}`, { method: "DELETE" });
    success("Lead deleted.");
    router.push("/pipeline");
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-slate-300" />
    </div>
  );

  if (!lead) return null;

  const stage      = stageInfo(lead.stage);
  const isEnrolled = lead.stage === "ENROLLED" || !!lead.enrolledUserId;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/pipeline" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition">
          <ArrowLeft size={15} /> Back to Pipeline
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={async () => {
              if (!lead) return;
              setEnriching(true);
              const res  = await fetch("/api/crm/leads/enrich", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ leadId: lead.id }),
              });
              const data = await res.json() as { enriched: boolean; message?: string; updated?: Record<string, string> };
              if (data.enriched && Object.keys(data.updated ?? {}).length > 0) {
                success("Lead enriched ✓"); load();
              } else { success(data.message ?? "Already up to date"); }
              setEnriching(false);
            }}
            disabled={enriching}
            className="flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-800 px-3 py-1.5 rounded-lg hover:bg-violet-50 border border-violet-200 transition disabled:opacity-50">
            {enriching ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Enrich
          </button>
          <button onClick={() => setShowComposer(v => !v)}
            className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition ${
              showComposer
                ? "bg-blue-600 text-white border-blue-600"
                : "text-blue-600 hover:text-blue-800 hover:bg-blue-50 border-blue-200"
            }`}>
            <PenLine size={13} /> Compose Email
          </button>
          <button onClick={() => setShowTranscript(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-800 px-3 py-1.5 rounded-lg hover:bg-violet-50 border border-violet-200 transition">
            <FileText size={13} /> Parse Transcript
          </button>
          <Link href={`/leads/${id}/proposal`}
            className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-800 px-3 py-1.5 rounded-lg hover:bg-emerald-50 border border-emerald-200 transition">
            <FileText size={13} /> Proposal
          </Link>
          <button onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-100 border border-slate-200 transition">
            <Edit2 size={13} /> Edit
          </button>
          <button onClick={deleteLead} disabled={deleting}
            className="flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 border border-red-200 transition disabled:opacity-50">
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: contact card */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm flex-shrink-0">
                <span className="text-white text-xl font-bold">
                  {lead.firstName[0]}{lead.lastName[0]}
                </span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 leading-tight">
                  {lead.firstName} {lead.lastName}
                </h1>
                {(lead.jobTitle || lead.company) && (
                  <p className="text-sm text-slate-500 mt-0.5">
                    {lead.jobTitle}{lead.jobTitle && lead.company ? " at " : ""}{lead.company}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2.5">
              <a href={`mailto:${lead.email}`}
                className="flex items-center gap-2.5 text-sm text-slate-700 hover:text-blue-600 transition group">
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Mail size={13} className="text-slate-500 group-hover:text-blue-500" />
                </div>
                <span className="truncate">{lead.email}</span>
              </a>
              {lead.phone && (
                <a href={`tel:${lead.phone}`}
                  className="flex items-center gap-2.5 text-sm text-slate-700 hover:text-blue-600 transition group">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Phone size={13} className="text-slate-500 group-hover:text-blue-500" />
                  </div>
                  {lead.phone}
                </a>
              )}
              {lead.company && (
                <div className="flex items-center gap-2.5 text-sm text-slate-600">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Building2 size={13} className="text-slate-500" />
                  </div>
                  {lead.company}
                </div>
              )}
              {lead.jobTitle && (
                <div className="flex items-center gap-2.5 text-sm text-slate-600">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Briefcase size={13} className="text-slate-500" />
                  </div>
                  {lead.jobTitle}
                </div>
              )}
              {lead.linkedinUrl && (
                <a href={lead.linkedinUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2.5 text-sm text-slate-700 hover:text-blue-600 transition group">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Linkedin size={13} className="text-slate-500 group-hover:text-blue-500" />
                  </div>
                  LinkedIn Profile ↗
                </a>
              )}
            </div>
          </div>

          {/* Pipeline card */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Pipeline</p>

            <div className="relative mb-4">
              <button onClick={() => setShowStageMenu(v => !v)} disabled={movingStage}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition ${stage.color}`}>
                <div className="flex items-center gap-2">
                  {movingStage ? <Loader2 size={13} className="animate-spin" /> : <div className={`w-2 h-2 rounded-full ${stage.dot}`} />}
                  {stage.label}
                </div>
                <ChevronDown size={13} />
              </button>
              {showStageMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowStageMenu(false)} />
                  <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1">
                    {STAGES.map(s => (
                      <button key={s.key}
                        onClick={() => moveStage(s.key)}
                        disabled={s.key === lead.stage}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition flex items-center gap-2 disabled:opacity-40">
                        <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                        {s.label}
                        {s.key === lead.stage && <span className="ml-auto text-[10px] text-slate-400">current</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Source</span>
                <span className="font-medium text-slate-700">{sourceLabel(lead.source ?? "")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Priority</span>
                <span className={`font-semibold ${lead.priority === "HIGH" || lead.priority === "URGENT" ? "text-red-600" : lead.priority === "LOW" ? "text-slate-400" : "text-blue-600"}`}>
                  {lead.priority}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Payment</span>
                <PaymentBadge status={lead.paymentStatus} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Added</span>
                <span className="font-medium text-slate-700">
                  {new Date(lead.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
            </div>

            {lead.tags.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-1 flex-wrap">
                  <Tag size={11} className="text-slate-400 mr-0.5" />
                  {lead.tags.map(t => (
                    <span key={t} className="text-[11px] font-medium bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {lead.notes && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Notes</p>
                <p className="text-sm text-slate-600 leading-relaxed">{lead.notes}</p>
              </div>
            )}
          </div>

          {/* Payment Panel */}
          <PaymentPanel
            leadId={id}
            dealValue={lead.dealValue ?? null}
            paymentStatus={lead.paymentStatus ?? null}
            onStatusChange={async (status) => {
              await fetch(`/api/crm/leads/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ paymentStatus: status }),
              });
              await load();
            }}
          />

          {lead.enrolledUser && (
            <div className="bg-green-50 border border-green-200 rounded-2xl shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={15} className="text-green-600" />
                <p className="text-sm font-bold text-green-800">Enrolled Student</p>
              </div>
              <p className="text-sm text-green-700">{lead.enrolledUser.name}</p>
              <p className="text-xs text-green-600">{lead.enrolledUser.email}</p>
              {lead.enrolledUser.cohort && (
                <p className="text-xs text-green-600 mt-0.5">Cohort: {lead.enrolledUser.cohort}</p>
              )}
            </div>
          )}

          {!isEnrolled && (
            <button onClick={() => setShowConvert(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-bold rounded-xl shadow-sm transition">
              <UserCheck size={16} /> Convert to Student
            </button>
          )}

          {/* LMS Progress Panel — shown once enrolled */}
          {isEnrolled && <StudentProgressPanel leadId={id} />}
        </div>

        {/* Right: activity feed */}
        <div className="lg:col-span-2 space-y-4">

          {/* Email Composer */}
          {showComposer && (
            <EmailComposer
              leadId={id}
              leadName={`${lead.firstName} ${lead.lastName}`}
              leadEmail={lead.email}
              onSent={async () => { await load(); success("Email sent and logged to timeline."); }}
              onClose={() => setShowComposer(false)}
            />
          )}

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Log Activity</p>
            <div className="flex gap-2 mb-3 flex-wrap items-center">
              {ACTIVITY_TYPES.map(t => (
                <button key={t.key} onClick={() => setActType(t.key)}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition ${
                    actType === t.key
                      ? "bg-slate-900 text-white border-slate-900"
                      : "text-slate-500 border-slate-200 hover:bg-slate-50"
                  }`}>
                  {t.icon} {t.label}
                </button>
              ))}
              <div className="ml-auto">
                <EmailTemplateMenu
                  leadName={`${lead.firstName} ${lead.lastName}`}
                  onSelect={(body) => { setActType("EMAIL"); setActContent(body); }}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <textarea
                value={actContent}
                onChange={e => setActContent(e.target.value)}
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addActivity(); }}
                placeholder={`${actType === "NOTE" ? "Add a note…" : actType === "EMAIL" ? "What did you send?" : actType === "CALL" ? "Call notes…" : "Meeting notes…"} (⌘↵ to save)`}
                rows={3}
                className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed bg-slate-50/50"
              />
              <button onClick={addActivity} disabled={addingAct || !actContent.trim()}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-3 py-2.5 rounded-xl transition flex-shrink-0 self-end">
                {addingAct ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Log
              </button>
            </div>
          </div>

          <TaskPanel leadId={id} />
          <SequenceEnrollPanel leadId={id} />

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                Activity Timeline · {lead.activities.length} events
              </p>
            </div>
            {lead.activities.length === 0 ? (
              <div className="p-10 text-center">
                <MessageSquare size={24} className="text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No activity yet. Log a note, call, or email above.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {(showAllActs ? lead.activities : lead.activities.slice(0, 5)).map(act => {
                  const meta = ACTIVITY_META[act.type] ?? ACTIVITY_META.NOTE;
                  let stageFrom = "", stageTo = "";
                  let recordingUrl = "";
                  if (act.metadata) {
                    try {
                      const parsed = JSON.parse(act.metadata);
                      if (act.type === "STAGE_CHANGE") {
                        stageFrom = stageInfo(parsed.from)?.label ?? parsed.from;
                        stageTo   = stageInfo(parsed.to)?.label   ?? parsed.to;
                      }
                      if (parsed.recordingUrl) recordingUrl = parsed.recordingUrl;
                    } catch { /* ignore */ }
                  }
                  const isEmail = act.type === "EMAIL";
                  const sourceBadge =
                    act.source === "COMPOSER"   ? { label: "Sent via CRM",  cls: "bg-blue-50 text-blue-600" }
                    : act.source === "GMAIL_SYNC" ? { label: "Gmail",         cls: "bg-red-50 text-red-600" }
                    : act.source === "SEQUENCE"   ? { label: "Sequence",      cls: "bg-violet-50 text-violet-600" }
                    : act.source === "TEMPLATE"   ? { label: "Template",      cls: "bg-emerald-50 text-emerald-600" }
                    : act.source === "BLAST"      ? { label: "Email Blast",   cls: "bg-amber-50 text-amber-600" }
                    : null;

                  return (
                    <div key={act.id} className="px-5 py-4 flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 text-sm">
                        {meta.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-700">{meta.label}</span>
                          {sourceBadge && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sourceBadge.cls}`}>
                              {sourceBadge.label}
                            </span>
                          )}
                          {isEmail && act.openedAt && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 flex items-center gap-0.5">
                              👁 Opened {new Date(act.openedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400">
                            {new Date(act.createdAt).toLocaleDateString("en-US", {
                              month: "short", day: "numeric",
                              hour: "numeric", minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {isEmail && act.subject && (
                          <p className="text-sm font-semibold text-slate-800 mb-0.5 truncate">{act.subject}</p>
                        )}
                        {isEmail && act.emailTo && (
                          <p className="text-[11px] text-slate-400 mb-1">To: {act.emailTo}</p>
                        )}
                        {act.type === "STAGE_CHANGE" ? (
                          <p className="text-sm text-slate-600">
                            <span className="line-through text-slate-400">{stageFrom}</span>
                            {" → "}
                            <span className="font-semibold text-slate-800">{stageTo}</span>
                          </p>
                        ) : act.content ? (
                          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap line-clamp-4">{act.content}</p>
                        ) : null}
                        {recordingUrl && (
                          <a
                            href={recordingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-2.5 py-1 rounded-lg transition"
                          >
                            📹 Watch Recording
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {lead.activities.length > 5 && (
              <div className="px-5 py-3 border-t border-slate-50">
                <button
                  onClick={() => setShowAllActs(v => !v)}
                  className="w-full text-xs font-semibold text-slate-400 hover:text-slate-600 transition py-1"
                >
                  {showAllActs
                    ? "Show less"
                    : `Show ${lead.activities.length - 5} more event${lead.activities.length - 5 !== 1 ? "s" : ""}`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showEdit && (
        <LeadForm
          editId={id}
          onClose={() => setShowEdit(false)}
          onSaved={async () => { await load(); }}
          initial={{
            firstName: lead.firstName, lastName: lead.lastName,
            email: lead.email, phone: lead.phone ?? "",
            company: lead.company ?? "", jobTitle: lead.jobTitle ?? "",
            linkedinUrl: lead.linkedinUrl ?? "",
            stage: lead.stage, source: lead.source ?? "",
            priority: lead.priority, paymentStatus: lead.paymentStatus ?? "UNPAID",
            tags: lead.tags.join(", "), notes: lead.notes ?? "",
          }}
        />
      )}

      {showTranscript && (
        <TranscriptParser
          leadId={id}
          currentStage={lead.stage}
          leadName={`${lead.firstName} ${lead.lastName}`}
          onApplied={() => { load(); success("Transcript applied to CRM ✓"); }}
          onClose={() => setShowTranscript(false)}
        />
      )}

      {showConvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                <UserCheck size={22} className="text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Convert to Student</h2>
                <p className="text-sm text-slate-500">{lead.firstName} {lead.lastName}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Assign to Cohort</label>
                <select value={convertCohortId} onChange={e => setConvertCohortId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— No cohort yet —</option>
                  {cohorts.filter(c => c.isActive).map(c => (
                    <option key={c.id} value={c.id} disabled={c.spotsLeft === 0}>
                      {c.name}
                      {c.spotsLeft !== null
                        ? ` — ${c.spotsLeft === 0 ? "FULL" : `${c.spotsLeft} spot${c.spotsLeft === 1 ? "" : "s"} left`}`
                        : ` (${c.enrolled} enrolled)`}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <div onClick={() => setSendInvite(v => !v)}
                  className={`mt-0.5 w-10 h-6 rounded-full transition-colors flex-shrink-0 ${sendInvite ? "bg-blue-600" : "bg-slate-200"} relative`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${sendInvite ? "translate-x-5" : "translate-x-1"}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">Send invite email</p>
                  <p className="text-xs text-slate-400">Student gets an email with a link to set their password and access the portal.</p>
                </div>
              </label>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
                <p className="font-semibold mb-1">What happens:</p>
                <ul className="space-y-1 text-xs text-blue-700 list-disc list-inside">
                  <li>An LMS student account is created for <strong>{lead.email}</strong></li>
                  <li>Lead stage is set to Enrolled</li>
                  {sendInvite && <li>An invite email is sent with a password setup link</li>}
                </ul>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={convertLead} disabled={converting}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition">
                  {converting ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                  {converting ? "Converting…" : "Create Student Account"}
                </button>
                <button onClick={() => setShowConvert(false)}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PaymentBadge ─────────────────────────────────────────────────────────────
const PAYMENT_STYLES: Record<string, string> = {
  PAID_FULL:     "bg-emerald-100 text-emerald-700",
  PAYMENT_PLAN:  "bg-blue-100 text-blue-700",
  SCHOLARSHIP:   "bg-violet-100 text-violet-700",
  OUTSTANDING:   "bg-red-100 text-red-700",
  UNPAID:        "bg-slate-100 text-slate-500",
};
const PAYMENT_LABELS: Record<string, string> = {
  PAID_FULL:    "Paid in Full",
  PAYMENT_PLAN: "Payment Plan",
  SCHOLARSHIP:  "Scholarship",
  OUTSTANDING:  "Outstanding",
  UNPAID:       "Unpaid",
};

function PaymentBadge({ status }: { status: string | null }) {
  const key = status ?? "UNPAID";
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${PAYMENT_STYLES[key] ?? PAYMENT_STYLES.UNPAID}`}>
      {PAYMENT_LABELS[key] ?? key}
    </span>
  );
}
