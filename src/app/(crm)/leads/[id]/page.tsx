"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Mail, Phone, Building2, Briefcase, Linkedin, Tag,
  Loader2, CheckCircle2, Trash2, Edit2, MessageSquare, Send,
  ChevronDown, UserCheck, Sparkles, FileText, PenLine, ExternalLink, X, Plus,
} from "lucide-react";
import { STAGES, ACTIVITY_TYPES, ACTIVITY_META, LEAD_TYPES, NEXTGEN_SUB_SOURCES, stageInfo, sourceLabel, nextgenSubSourceLabel, leadTypeInfo } from "@/components/crm/constants";
import LeadForm from "@/components/crm/LeadForm";
import StudentProgressPanel from "@/components/crm/StudentProgressPanel";
import TaskPanel from "@/components/crm/TaskPanel";
import OutcomePanel from "@/components/crm/OutcomePanel";
import EmailTemplateMenu from "@/components/crm/EmailTemplates";
import SequenceEnrollPanel from "@/components/crm/SequenceEnrollPanel";
import EmailComposer from "@/components/crm/EmailComposer";
import PaymentPanel from "@/components/crm/PaymentPanel";
import TranscriptParser from "@/components/crm/TranscriptParser";
import NoteContent from "@/components/crm/NoteContent";
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
  linkedinUrl: string | null; stage: string; source: string | null; subSource: string | null; leadType: string | null;
  priority: string; paymentStatus: string | null; dealValue: number | null; assignedTo: string | null; tags: string[]; notes: string | null; lostReason: string | null;
  utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null; utmTerm: string | null;
  promoCode: string | null;
  referralCode: string | null;
  outcomeStatus: string | null; outcomeCompany: string | null; outcomeRole: string | null; outcomeSalary: number | null;
  outcomeStartDate: string | null; outcomeNotes: string | null; outcomeUpdatedAt: string | null;
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
  const [lostReasonPrompt, setLostReasonPrompt] = useState<string | null>(null);
  const [lostReasonInput,  setLostReasonInput]  = useState("");
  const [convertCohortId, setConvertCohortId] = useState("");
  const [sendInvite,    setSendInvite]    = useState(true);
  const [converting,    setConverting]    = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [enriching,     setEnriching]     = useState(false);
  const [showComposer,  setShowComposer]  = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showAllActs, setShowAllActs] = useState(false);
  const [actFilter,   setActFilter]   = useState<"ALL" | "EMAIL" | "NOTE" | "CALL">("ALL");
  const [tagInput,    setTagInput]    = useState("");
  const [savingTag,   setSavingTag]   = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/leads/${id}`);
    if (!res.ok) { router.push("/pipeline"); return; }
    setLead(await res.json());
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  // Background refresh every 30s, paused when tab is hidden
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    function start() { if (!timer) timer = setInterval(load, 30_000); }
    function stop()  { if (timer) { clearInterval(timer); timer = null; } }
    function onVisibility() { document.hidden ? stop() : start(); }
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [load]);
  useEffect(() => {
    fetch("/api/cohorts").then(r => r.json()).then((data: Cohort[]) => {
      if (Array.isArray(data)) setCohorts(data);
    });
  }, []);

  async function moveStage(newStage: string, lostReason?: string) {
    if (!lead) return;
    if (newStage === "LOST" && lostReason === undefined) {
      setShowStageMenu(false);
      setLostReasonPrompt(newStage);
      return;
    }
    setMovingStage(true);
    setShowStageMenu(false);
    const res = await fetch(`/api/crm/leads/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage, ...(lostReason ? { lostReason } : {}) }),
    });
    if (res.ok) {
      await load();
      success(`Moved to ${stageInfo(newStage).label}`);
    }
    setMovingStage(false);
    setLostReasonPrompt(null);
    setLostReasonInput("");
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

  async function removeTag(tag: string) {
    if (!lead) return;
    const newTags = lead.tags.filter(t => t !== tag);
    const res = await fetch(`/api/crm/leads/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: newTags }),
    });
    if (res.ok) setLead(l => l ? { ...l, tags: newTags } : l);
  }

  async function addTag() {
    const tag = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (!tag || !lead || lead.tags.includes(tag)) { setTagInput(""); return; }
    setSavingTag(true);
    const newTags = [...lead.tags, tag];
    const res = await fetch(`/api/crm/leads/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: newTags }),
    });
    if (res.ok) { setLead(l => l ? { ...l, tags: newTags } : l); setTagInput(""); }
    setSavingTag(false);
  }

  async function deleteLead() {
    if (!confirm("Delete this lead? This cannot be undone.")) return;
    setDeleting(true);
    const res = await fetch(`/api/crm/leads/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toastError(data.error ?? "Failed to delete lead. Please try again.");
      setDeleting(false);
      return;
    }
    success("Lead deleted.");
    router.push("/pipeline");
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin" style={{ color: "#c9c4b8" }} />
    </div>
  );

  if (!lead) return null;

  const stage      = stageInfo(lead.stage);
  const isEnrolled = lead.stage === "ENROLLED" || !!lead.enrolledUserId;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/pipeline" className="flex items-center gap-1.5 text-sm transition hover:opacity-70" style={{ color: "#8a938f" }}>
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
                ? "text-white border-[#0a6b64]"
                : "hover:bg-[#edf5f4] border-[#0a6b64]"
            }`}
            style={showComposer
              ? { background: "#0a6b64", color: "#ffffff" }
              : { color: "#0a6b64" }}>
            <PenLine size={13} /> Compose Email
          </button>
          <button onClick={() => setShowTranscript(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-800 px-3 py-1.5 rounded-lg hover:bg-violet-50 border border-violet-200 transition">
            <FileText size={13} /> Parse Transcript
          </button>
          <Link href={`/leads/${id}/proposal`}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-emerald-50 border border-emerald-200 transition text-emerald-600 hover:text-emerald-800">
            <FileText size={13} /> Proposal
          </Link>
          <button onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition hover:bg-[#f8f6f1] border-[#e4e0d6]"
            style={{ color: "#5a6663" }}>
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
          <div className="card shadow-sm p-6">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm flex-shrink-0" style={{ background: "#0a6b64" }}>
                <span className="text-white text-xl font-bold">
                  {lead.firstName[0]}{lead.lastName[0]}
                </span>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#8a938f" }}>Vantage Career Accelerator</p>
                <h1 className="text-xl font-display font-semibold leading-tight" style={{ color: "#14211f" }}>
                  {lead.firstName} {lead.lastName}
                </h1>
                {(lead.jobTitle || lead.company) && (
                  <p className="text-sm mt-0.5" style={{ color: "#8a938f" }}>
                    {lead.jobTitle}{lead.jobTitle && lead.company ? " at " : ""}{lead.company}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2.5">
              <a href={`mailto:${lead.email}`}
                className="flex items-center gap-2.5 text-sm transition group hover:opacity-70"
                style={{ color: "#5a6663" }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#edf5f4" }}>
                  <Mail size={13} style={{ color: "#0a6b64" }} />
                </div>
                <span className="truncate">{lead.email}</span>
              </a>
              {lead.phone && (
                <a href={`tel:${lead.phone}`}
                  className="flex items-center gap-2.5 text-sm transition group hover:opacity-70"
                  style={{ color: "#5a6663" }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#edf5f4" }}>
                    <Phone size={13} style={{ color: "#0a6b64" }} />
                  </div>
                  {lead.phone}
                </a>
              )}
              {lead.company && (
                <div className="flex items-center gap-2.5 text-sm" style={{ color: "#5a6663" }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#f1efe8" }}>
                    <Building2 size={13} style={{ color: "#8a938f" }} />
                  </div>
                  {lead.company}
                </div>
              )}
              {lead.jobTitle && (
                <div className="flex items-center gap-2.5 text-sm" style={{ color: "#5a6663" }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#f1efe8" }}>
                    <Briefcase size={13} style={{ color: "#8a938f" }} />
                  </div>
                  {lead.jobTitle}
                </div>
              )}
              {lead.linkedinUrl && (
                <a href={lead.linkedinUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2.5 text-sm transition group hover:opacity-70"
                  style={{ color: "#5a6663" }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#edf5f4" }}>
                    <Linkedin size={13} style={{ color: "#0a6b64" }} />
                  </div>
                  LinkedIn Profile ↗
                </a>
              )}
            </div>
          </div>

          {/* Pipeline card */}
          <div className="card shadow-sm p-5">
            <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "#8a938f" }}>Pipeline</p>

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
                  <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border rounded-xl shadow-lg py-1" style={{ borderColor: "#e4e0d6" }}>
                    {STAGES.map(s => (
                      <button key={s.key}
                        onClick={() => moveStage(s.key)}
                        disabled={s.key === lead.stage}
                        className="w-full text-left px-3 py-2 text-sm transition flex items-center gap-2 disabled:opacity-40 hover:bg-[#f8f6f1]">
                        <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                        {s.label}
                        {s.key === lead.stage && <span className="ml-auto text-[10px]" style={{ color: "#8a938f" }}>current</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span style={{ color: "#8a938f" }}>Type</span>
                <select
                  value={lead.leadType ?? "WAITLIST"}
                  onChange={async e => {
                    const newType = e.target.value;
                    await fetch(`/api/crm/leads/${id}`, {
                      method: "PATCH", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ leadType: newType }),
                    });
                    await load();
                  }}
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer ${leadTypeInfo(lead.leadType).color}`}
                  style={{ appearance: "none", WebkitAppearance: "none" }}>
                  {LEAD_TYPES.map(t => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: "#8a938f" }}>Source</span>
                <span className="font-medium" style={{ color: "#5a6663" }}>{sourceLabel(lead.source ?? "")}</span>
              </div>
              {lead.source === "3I_NEXTGEN" && (
                <div className="flex items-center justify-between">
                  <span style={{ color: "#8a938f" }}>Member type</span>
                  <select
                    value={lead.subSource ?? ""}
                    onChange={async e => {
                      const val = e.target.value || null;
                      await fetch(`/api/crm/leads/${lead.id}`, {
                        method: "PATCH", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ subSource: val }),
                      });
                      await load();
                    }}
                    className="text-xs font-semibold cursor-pointer border-0 bg-transparent focus:outline-none"
                    style={{ color: lead.subSource === "NON_MEMBER_REFERRAL" ? "#c2410c" : lead.subSource === "MEMBER" ? "#0a6b64" : "#8a938f", appearance: "none", WebkitAppearance: "none" }}>
                    <option value="">— unset —</option>
                    {NEXTGEN_SUB_SOURCES.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* Promo code */}
              {lead.promoCode && (
                <div className="pt-2 mt-1 border-t" style={{ borderColor: "#f0ede7" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#8a938f" }}>Promo Code</p>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ background: "#f0fdf4", color: "#0a6b64" }}>{lead.promoCode}</span>
                  </div>
                </div>
              )}
              {/* Referral code */}
              {lead.referralCode && (
                <div className="pt-2 mt-1 border-t" style={{ borderColor: "#f0ede7" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#8a938f" }}>Referred By</p>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ background: "#fdf4f0", color: "#9a3412" }}>{lead.referralCode}</span>
                  </div>
                </div>
              )}
              {/* UTM attribution */}
              {(lead.utmSource || lead.utmMedium || lead.utmCampaign) && (
                <div className="pt-2 mt-1 border-t" style={{ borderColor: "#f0ede7" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#8a938f" }}>UTM Attribution</p>
                  {[
                    ["Source",   lead.utmSource],
                    ["Medium",   lead.utmMedium],
                    ["Campaign", lead.utmCampaign],
                    ["Content",  lead.utmContent],
                    ["Term",     lead.utmTerm],
                  ].filter(([, v]) => v).map(([label, val]) => (
                    <div key={label as string} className="flex items-center justify-between mt-0.5">
                      <span className="text-xs" style={{ color: "#8a938f" }}>{label}</span>
                      <span className="text-xs font-medium truncate max-w-[140px]" style={{ color: "#5a6663" }}>{val}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span style={{ color: "#8a938f" }}>Priority</span>
                <span className={`font-semibold ${lead.priority === "HIGH" || lead.priority === "URGENT" ? "text-red-600" : lead.priority === "LOW" ? "text-slate-400" : ""}`}
                  style={lead.priority !== "HIGH" && lead.priority !== "URGENT" && lead.priority !== "LOW" ? { color: "#0a6b64" } : undefined}>
                  {lead.priority}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: "#8a938f" }}>Payment</span>
                <PaymentBadge status={lead.paymentStatus} />
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: "#8a938f" }}>Added</span>
                <span className="font-medium" style={{ color: "#5a6663" }}>
                  {new Date(lead.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t" style={{ borderColor: "#e4e0d6" }}>
              <div className="flex items-center gap-1 flex-wrap">
                <Tag size={11} className="mr-0.5 flex-shrink-0" style={{ color: "#8a938f" }} />
                {lead.tags.map(t => (
                  <span key={t} className="group/tag inline-flex items-center gap-0.5 text-[11px] font-medium bg-indigo-50 text-indigo-600 pl-2 pr-1 py-0.5 rounded-full">
                    {t}
                    <button onClick={() => removeTag(t)}
                      className="opacity-0 group-hover/tag:opacity-100 transition hover:text-red-500 leading-none">
                      <X size={10} />
                    </button>
                  </span>
                ))}
                {/* Inline add tag */}
                <form onSubmit={e => { e.preventDefault(); addTag(); }} className="inline-flex items-center">
                  <input
                    value={tagInput} onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Escape") setTagInput(""); }}
                    placeholder="+ tag"
                    className="text-[11px] w-14 focus:w-24 transition-all bg-transparent border-b focus:outline-none placeholder:text-slate-300"
                    style={{ borderColor: tagInput ? "#6366f1" : "#e4e0d6", color: "#6366f1" }}
                  />
                  {tagInput && (
                    <button type="submit" disabled={savingTag}
                      className="ml-1 text-indigo-600 hover:text-indigo-800 transition">
                      {savingTag ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                    </button>
                  )}
                </form>
              </div>
            </div>

            {lead.notes && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: "#e4e0d6" }}>
                <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "#8a938f" }}>Notes</p>
                <NoteContent text={lead.notes} clamp={4} />
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
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-white text-sm font-bold rounded-xl shadow-sm transition hover:opacity-90"
              style={{ background: "#0a6b64" }}>
              <UserCheck size={16} /> Convert to Student
            </button>
          )}

          {/* LMS Progress Panel — shown once enrolled */}
          {isEnrolled && (
            <>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch("/api/crm/lms-bridge", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ targetUrl: lead.enrolledUserId ? `/admin/students/${lead.enrolledUserId}` : "/admin" }),
                    });
                    const { url } = await res.json();
                    window.open(url, "_blank");
                  } catch { /* silent */ }
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: "#edf5f4", color: "#0a6b64", border: "1px solid #d8efec" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#0a6b64"; e.currentTarget.style.color = "white"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#edf5f4"; e.currentTarget.style.color = "#0a6b64"; }}
              >
                <ExternalLink size={14} /> View in LMS
              </button>
              <StudentProgressPanel leadId={id} />
              <OutcomePanel
                leadId={id}
                outcome={{
                  outcomeStatus:    lead.outcomeStatus,
                  outcomeCompany:   lead.outcomeCompany,
                  outcomeRole:      lead.outcomeRole,
                  outcomeSalary:    lead.outcomeSalary,
                  outcomeStartDate: lead.outcomeStartDate,
                  outcomeNotes:     lead.outcomeNotes,
                  outcomeUpdatedAt: lead.outcomeUpdatedAt,
                }}
                onSave={load}
              />
            </>
          )}
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

          <div className="card shadow-sm p-5">
            <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "#8a938f" }}>Log Activity</p>
            <div className="flex gap-2 mb-3 flex-wrap items-center">
              {ACTIVITY_TYPES.map(t => (
                <button key={t.key} onClick={() => setActType(t.key)}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition ${
                    actType === t.key
                      ? "text-white border-[#14211f]"
                      : "border-[#e4e0d6] hover:bg-[#f8f6f1]"
                  }`}
                  style={actType === t.key
                    ? { background: "#14211f", color: "#ffffff" }
                    : { color: "#8a938f" }}>
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
                className="flex-1 px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 resize-none leading-relaxed"
                style={{ borderColor: "#e4e0d6", color: "#5a6663", background: "#f8f6f1" }}
              />
              <button onClick={addActivity} disabled={addingAct || !actContent.trim()}
                className="flex items-center gap-1.5 disabled:opacity-50 text-white text-sm font-semibold px-3 py-2.5 rounded-xl transition flex-shrink-0 self-end hover:opacity-90"
                style={{ background: "#0a6b64" }}>
                {addingAct ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Log
              </button>
            </div>
          </div>

          <TaskPanel leadId={id} />
          <SequenceEnrollPanel leadId={id} />

          {/* Application Answers — shown for 3i NextGen applications */}
          {lead.source === "3I_NEXTGEN" && lead.notes && (() => {
            const blocks = lead.notes.split(/\n\n+/).filter(Boolean);
            const rows = blocks.map(block => {
              const colonNewline = block.indexOf(":\n");
              if (colonNewline !== -1) {
                return { label: block.slice(0, colonNewline), value: block.slice(colonNewline + 2).trim() };
              }
              const colonSpace = block.indexOf(": ");
              if (colonSpace !== -1) {
                return { label: block.slice(0, colonSpace), value: block.slice(colonSpace + 2) };
              }
              return { label: "", value: block };
            });
            return (
              <div className="card shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b flex items-center gap-2" style={{ borderColor: "#e4e0d6" }}>
                  <FileText size={14} style={{ color: "#0a6b64" }} />
                  <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#8a938f" }}>
                    Application Answers
                  </p>
                  <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#f0faf8", color: "#0a6b64" }}>
                    3i NextGen
                  </span>
                </div>
                <div className="divide-y divide-[#f1efe8]">
                  {rows.map((row, i) => (
                    <div key={i} className="px-5 py-3.5">
                      {row.label && (
                        <p className="text-xs font-bold mb-1" style={{ color: "#8a938f", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          {row.label}
                        </p>
                      )}
                      <NoteContent text={row.value} clamp={6} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="card shadow-sm overflow-hidden">
            {(() => {
              const filtered = actFilter === "ALL"
                ? lead.activities
                : lead.activities.filter(a =>
                    actFilter === "EMAIL" ? a.type === "EMAIL"
                    : actFilter === "NOTE" ? ["NOTE","CREATED"].includes(a.type)
                    : ["CALL","MEETING"].includes(a.type)
                  );
              const visible = showAllActs ? filtered : filtered.slice(0, 5);
              return (<>
            <div className="px-5 py-3.5 border-b flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: "#e4e0d6" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#8a938f" }}>
                Activity Timeline · {actFilter === "ALL" ? `${lead.activities.length} events` : `${filtered.length} of ${lead.activities.length}`}
              </p>
              <div className="flex items-center gap-1">
                {(["ALL", "EMAIL", "NOTE", "CALL"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => { setActFilter(f); setShowAllActs(false); }}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition"
                    style={actFilter === f
                      ? { background: "#0a6b64", color: "#fff" }
                      : { background: "#f1efe8", color: "#8a938f" }}
                  >
                    {f === "ALL" ? "All" : f === "EMAIL" ? "Emails" : f === "NOTE" ? "Notes" : "Calls"}
                  </button>
                ))}
              </div>
            </div>
            {lead.activities.length === 0 ? (
              <div className="p-10 text-center">
                <MessageSquare size={24} className="mx-auto mb-2" style={{ color: "#c9c4b8" }} />
                <p className="text-sm" style={{ color: "#8a938f" }}>No activity yet. Log a note, call, or email above.</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <MessageSquare size={24} className="mx-auto mb-2" style={{ color: "#c9c4b8" }} />
                <p className="text-sm" style={{ color: "#8a938f" }}>
                  No {actFilter === "EMAIL" ? "emails" : actFilter === "NOTE" ? "notes" : "calls"} logged yet.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#e4e0d6]">
                {visible.map(act => {
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
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-sm" style={{ background: "#f1efe8" }}>
                        {meta.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-xs font-bold" style={{ color: "#5a6663" }}>{meta.label}</span>
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
                          <span className="text-[11px]" style={{ color: "#8a938f" }}>
                            {new Date(act.createdAt).toLocaleDateString("en-US", {
                              month: "short", day: "numeric",
                              hour: "numeric", minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {isEmail && act.subject && (
                          <p className="text-sm font-semibold mb-0.5 truncate" style={{ color: "#14211f" }}>{act.subject}</p>
                        )}
                        {isEmail && act.emailTo && (
                          <p className="text-[11px] mb-1" style={{ color: "#8a938f" }}>To: {act.emailTo}</p>
                        )}
                        {act.type === "STAGE_CHANGE" ? (
                          <p className="text-sm" style={{ color: "#5a6663" }}>
                            <span className="line-through" style={{ color: "#8a938f" }}>{stageFrom}</span>
                            {" → "}
                            <span className="font-semibold" style={{ color: "#14211f" }}>{stageTo}</span>
                          </p>
                        ) : act.content ? (
                          <NoteContent text={act.content} />
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
            {filtered.length > 5 && (
              <div className="px-5 py-3 border-t" style={{ borderColor: "#e4e0d6" }}>
                <button
                  onClick={() => setShowAllActs(v => !v)}
                  className="w-full text-xs font-semibold transition py-1 hover:opacity-70"
                  style={{ color: "#8a938f" }}
                >
                  {showAllActs
                    ? "Show less"
                    : `Show ${filtered.length - 5} more event${filtered.length - 5 !== 1 ? "s" : ""}`}
                </button>
              </div>
            )}
          </>);
        })()}
          </div>
        </div>
      </div>

      {lostReasonPrompt && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold mb-1" style={{ color: "#14211f" }}>Why did this lead go cold?</h3>
            <p className="text-xs mb-4" style={{ color: "#8a938f" }}>This populates the "Why We Lose" chart on the home dashboard.</p>
            <textarea
              value={lostReasonInput}
              onChange={e => setLostReasonInput(e.target.value)}
              rows={3}
              placeholder="e.g. Price too high, timing not right, chose competitor…"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => moveStage("LOST", lostReasonInput.trim() || "Not specified")}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition"
              >
                Mark as Lost
              </button>
              <button
                onClick={() => { setLostReasonPrompt(null); setLostReasonInput(""); }}
                className="px-4 py-2.5 text-sm font-semibold border border-slate-200 rounded-xl hover:bg-slate-50 transition"
                style={{ color: "#5a6663" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
            leadType: lead.leadType ?? "WAITLIST",
            priority: lead.priority, paymentStatus: lead.paymentStatus ?? "UNPAID",
            dealValue: lead.dealValue != null ? String(lead.dealValue) : "",
            assignedTo: lead.assignedTo ?? "",
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
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "#edf5f4" }}>
                <UserCheck size={22} style={{ color: "#0a6b64" }} />
              </div>
              <div>
                <h2 className="text-lg font-bold" style={{ color: "#14211f" }}>Convert to Student</h2>
                <p className="text-sm" style={{ color: "#8a938f" }}>{lead.firstName} {lead.lastName}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold mb-1.5 block" style={{ color: "#5a6663" }}>Assign to Cohort</label>
                <select value={convertCohortId} onChange={e => setConvertCohortId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                  style={{ borderColor: "#e4e0d6", color: "#5a6663" }}>
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
                  className={`mt-0.5 w-10 h-6 rounded-full transition-colors flex-shrink-0 relative`}
                  style={{ background: sendInvite ? "#0a6b64" : "#e4e0d6" }}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${sendInvite ? "translate-x-5" : "translate-x-1"}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#5a6663" }}>Send invite email</p>
                  <p className="text-xs" style={{ color: "#8a938f" }}>Student gets an email with a link to set their password and access the portal.</p>
                </div>
              </label>

              <div className="rounded-xl p-4 text-sm border" style={{ background: "#edf5f4", borderColor: "rgba(10,107,100,0.25)" }}>
                <p className="font-semibold mb-1" style={{ color: "#0a6b64" }}>What happens:</p>
                <ul className="space-y-1 text-xs list-disc list-inside" style={{ color: "#0a6b64" }}>
                  <li>An LMS student account is created for <strong>{lead.email}</strong></li>
                  <li>Lead stage is set to Enrolled</li>
                  {sendInvite && <li>An invite email is sent with a password setup link</li>}
                </ul>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={convertLead} disabled={converting}
                  className="flex items-center gap-2 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition hover:opacity-90"
                  style={{ background: "#0a6b64" }}>
                  {converting ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                  {converting ? "Converting…" : "Create Student Account"}
                </button>
                <button onClick={() => setShowConvert(false)}
                  className="px-4 py-2.5 text-sm font-semibold border rounded-xl transition hover:bg-[#f8f6f1]"
                  style={{ color: "#5a6663", borderColor: "#e4e0d6" }}>
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
// Render activity note content with clickable URLs

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
