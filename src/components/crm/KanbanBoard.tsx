"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Search, Loader2, ArrowRight, Filter, ChevronDown, Sparkles, Mail, Phone, DollarSign } from "lucide-react";
import { STAGES, stageInfo, sourceLabel, leadTypeInfo } from "./constants";
import LeadForm from "./LeadForm";
import { scoreColor } from "@/lib/scoring";
import { useToast } from "@/lib/toast";

interface Lead {
  id:            string;
  firstName:     string;
  lastName:      string;
  email:         string;
  phone:         string | null;
  company:       string | null;
  jobTitle:      string | null;
  stage:         string;
  source:        string | null;
  leadType:      string | null;
  priority:      string;
  tags:          string[];
  score?:        number;
  dealValue:     number | null;
  paymentStatus: string | null;
  createdAt:     string;
  updatedAt:     string;
  enrolledUser:  { id: string; name: string } | null;
  _count:        { activities: number };
}

type StageEntry = typeof STAGES[number];

const DRAGGABLE_STAGES = ["WAITLIST", "LEAD", "WAITING_TO_MEET", "CONTACTED", "APPLIED", "STRATEGY_CALL", "ADMITTED", "OFFER_SENT", "COMPLETED"];

export default function KanbanBoard() {
  const { success, error: toastError } = useToast();
  const [leads,         setLeads]         = useState<Lead[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [showForm,      setShowForm]      = useState(false);
  const [search,        setSearch]        = useState("");
  const [movingId,      setMovingId]      = useState<string | null>(null);
  const [showLost,      setShowLost]      = useState(false);
  const [pendingLost,   setPendingLost]   = useState<string | null>(null);
  const [lostReason,    setLostReason]    = useState("");
  const [draggingId,    setDraggingId]    = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [mobileStage,   setMobileStage]   = useState("LEAD");
  const [sourceFilter,  setSourceFilter]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/crm/leads?all=true");
      const data = await res.json();
      if (Array.isArray(data)) setLeads(data);
    } catch {
      // network or parse error — leave leads as-is
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = leads.filter(l => {
    const matchesSearch = !search.trim() || `${l.firstName} ${l.lastName} ${l.email} ${l.company ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesSource = !sourceFilter || l.source === sourceFilter;
    return matchesSearch && matchesSource;
  });

  const kanbanStages = STAGES.filter(s => s.key !== "ENROLLED" && (showLost || s.key !== "LOST"));

  async function moveStage(leadId: string, newStage: string, lostReason?: string) {
    if (newStage === "LOST" && lostReason === undefined) {
      setPendingLost(leadId);
      return;
    }
    setMovingId(leadId);
    try {
      const res = await fetch(`/api/crm/leads/${leadId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ stage: newStage, ...(lostReason ? { lostReason } : {}) }),
      });
      if (res.ok) {
        const updated = await res.json();
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: updated.stage } : l));
        success(`Moved to ${stageInfo(newStage).label}`);
      } else {
        const data = await res.json().catch(() => ({}));
        toastError(`Failed to move lead: ${data.error ?? "server error"}`);
      }
    } catch {
      toastError("Failed to move lead — check your connection and try again.");
    } finally {
      setMovingId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Lost reason prompt modal */}
      {pendingLost && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold mb-1" style={{ color: "#14211f" }}>Why did this lead go cold?</h3>
            <p className="text-xs mb-4" style={{ color: "#949598" }}>This populates the "Why We Lose" chart on the home dashboard.</p>
            <textarea
              autoFocus
              value={lostReason}
              onChange={e => setLostReason(e.target.value)}
              rows={3}
              placeholder="e.g. Price too high, timing not right, chose competitor…"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  moveStage(pendingLost, "LOST", lostReason.trim() || "Not specified");
                  setPendingLost(null);
                  setLostReason("");
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition"
              >
                Mark as Lost
              </button>
              <button
                onClick={() => { setPendingLost(null); setLostReason(""); }}
                className="px-4 py-2.5 text-sm font-semibold border border-slate-200 rounded-xl hover:bg-slate-50 transition"
                style={{ color: "#5a6663" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-4 bg-white flex-shrink-0" style={{ borderBottom: "1px solid #e4e0d6" }}>
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#949598" }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search leads…"
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-[#086c64] focus:bg-white"
            style={{ border: "1px solid #e4e0d6", background: "#f8f6f1", color: "#14211f" }}
          />
        </div>
        <button
          onClick={() => setShowLost(v => !v)}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition ${
            showLost ? "bg-red-50 text-red-700 border-red-200" : "border-[#e4e0d6] hover:bg-[#f8f6f1]"
          }`}
        >
          <Filter size={12} /> {showLost ? "Hide Lost" : "Show Lost"}
        </button>
        <select
          value={sourceFilter ?? ""}
          onChange={e => setSourceFilter(e.target.value || null)}
          className="text-xs font-semibold px-3 py-2 rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-[#086c64]"
          style={{ border: "1px solid #e4e0d6", background: sourceFilter ? "#edf5f4" : "#f8f6f1", color: sourceFilter ? "#086c64" : "#5a6663" }}
        >
          <option value="">All sources</option>
          <option value="EVENT">Event</option>
          <option value="REFERRAL">Referral</option>
          <option value="LINKEDIN">LinkedIn</option>
          <option value="WEBSITE">Website</option>
          <option value="INSTAGRAM">Instagram</option>
          <option value="COLD_OUTREACH">Cold Outreach</option>
          <option value="PAID_AD">Paid Ad</option>
        </select>
        <div className="flex-1" />
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-xl transition shadow-sm" style={{ background: "#086c64" }} onMouseEnter={e => (e.currentTarget.style.background = "#084f4a")} onMouseLeave={e => (e.currentTarget.style.background = "#086c64")}>
          <Plus size={15} /> Add Lead
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin" style={{ color: "#c9c4b8" }} />
        </div>
      ) : (
        <>
        {/* ── Mobile view (< md) ─────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 md:hidden overflow-hidden">
          {/* Stage tabs */}
          <div className="flex gap-1 px-3 py-2 overflow-x-auto flex-shrink-0" style={{ borderBottom: "1px solid #e4e0d6", background: "#f8f6f1" }}>
            {kanbanStages.map(stg => {
              const cnt = filtered.filter(l => l.stage === stg.key).length;
              const active = mobileStage === stg.key;
              return (
                <button key={stg.key}
                  onClick={() => setMobileStage(stg.key)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex-shrink-0 transition"
                  style={{
                    background: active ? "#086c64" : "transparent",
                    color: active ? "#fff" : "#5a6663",
                  }}>
                  <div className={`w-1.5 h-1.5 rounded-full ${stg.dot}`} />
                  {stg.label}
                  <span className={`ml-0.5 px-1 py-0.5 rounded-full text-[10px] font-bold ${active ? "bg-white/20" : "bg-[#e4e0d6]"}`}
                    style={{ color: active ? "#fff" : "#949598" }}>{cnt}</span>
                </button>
              );
            })}
          </div>
          {/* Cards */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {filtered.filter(l => l.stage === mobileStage).length === 0 ? (
              <div className="border-2 border-dashed rounded-2xl p-8 text-center" style={{ borderColor: "#e4e0d6" }}>
                <p className="text-sm" style={{ color: "#949598" }}>No leads in this stage</p>
              </div>
            ) : (
              filtered.filter(l => l.stage === mobileStage).map(lead => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  stages={[...kanbanStages]}
                  moving={movingId === lead.id}
                  dragging={false}
                  draggable={false}
                  onMove={moveStage}
                  onDragStart={() => {}}
                  onDragEnd={() => {}}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Desktop kanban (≥ md) ───────────────────────────────────────── */}
        <div className="flex-1 overflow-x-auto p-6 hidden md:block">
          <div className="flex gap-4 h-full min-h-[600px]" style={{ minWidth: `${kanbanStages.length * 280}px` }}>
            {kanbanStages.map(stg => {
              const stageLeads = filtered.filter(l => l.stage === stg.key);
              const isDropTarget = dragOverStage === stg.key && draggingId !== null;
              const isDraggable  = DRAGGABLE_STAGES.includes(stg.key);

              return (
                <div
                  key={stg.key}
                  className="flex flex-col w-[272px] flex-shrink-0"
                  onDragOver={e => {
                    if (!isDraggable || !draggingId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDragEnter={e => {
                    if (!isDraggable || !draggingId) return;
                    e.preventDefault();
                    setDragOverStage(stg.key);
                  }}
                  onDragLeave={e => {
                    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                      setDragOverStage(null);
                    }
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    const leadId = e.dataTransfer.getData("leadId");
                    const fromStage = e.dataTransfer.getData("fromStage");
                    setDragOverStage(null);
                    setDraggingId(null);
                    if (leadId && fromStage !== stg.key) moveStage(leadId, stg.key);
                    // LOST drag: moveStage will intercept and show the prompt
                  }}
                >
                  <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl mb-3 transition-colors ${
                    isDropTarget ? "ring-2 ring-[#086c64] ring-offset-1 " + stg.color : stg.color
                  }`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${stg.dot}`} />
                      <span className="text-sm font-bold" style={{ color: "#14211f" }}>{stg.label}</span>
                      {isDraggable && <span className="text-[9px] font-normal" style={{ color: "#949598" }}>drag to move</span>}
                    </div>
                    <span className="text-xs font-bold bg-white px-1.5 py-0.5 rounded-full" style={{ color: "#949598" }}>
                      {stageLeads.length}
                    </span>
                  </div>

                  <div className={`flex-1 space-y-2.5 overflow-y-auto pr-0.5 scrollbar-thin rounded-2xl transition-colors ${
                    isDropTarget ? "outline-2 outline-dashed outline-offset-2" : ""
                  }`} style={isDropTarget ? { background: "#edf5f4", outlineColor: "#086c64" } : {}}>
                    {stageLeads.length === 0 && (
                      <div className="border-2 border-dashed rounded-2xl p-6 text-center transition-colors"
                        style={isDropTarget ? { borderColor: "#086c64", background: "#edf5f4" } : { borderColor: "#e4e0d6" }}>
                        <p className="text-xs" style={{ color: "#949598" }}>{isDropTarget ? "Drop here" : "No leads here"}</p>
                      </div>
                    )}
                    {stageLeads.map(lead => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        stages={[...kanbanStages]}
                        moving={movingId === lead.id}
                        dragging={draggingId === lead.id}
                        draggable={DRAGGABLE_STAGES.includes(lead.stage)}
                        onMove={moveStage}
                        onDragStart={(id) => setDraggingId(id)}
                        onDragEnd={() => { setDraggingId(null); setDragOverStage(null); }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </>
      )}

      {showForm && (
        <LeadForm
          onClose={() => setShowForm(false)}
          onSaved={(lead) => { setLeads(prev => [lead as Lead, ...prev]); }}
        />
      )}
    </div>
  );
}

function LeadCard({
  lead, stages, moving, dragging, draggable, onMove, onDragStart, onDragEnd,
}: {
  lead:        Lead;
  stages:      StageEntry[];
  moving:      boolean;
  dragging:    boolean;
  draggable:   boolean;
  onMove:      (id: string, stage: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd:   () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const initials  = `${lead.firstName[0] ?? ""}${lead.lastName[0] ?? ""}`.toUpperCase();
  const daysSince = Math.floor((Date.now() - new Date(lead.updatedAt).getTime()) / 86400000);
  const typeInfo  = leadTypeInfo(lead.leadType);

  const priorityColor: Record<string, string> = {
    HIGH:   "bg-red-100 text-red-700",
    NORMAL: "bg-[#f1efe8] text-[#5a6663]",
    LOW:    "bg-[#f8f6f1] text-[#949598]",
    URGENT: "bg-red-200 text-red-800",
  };

  const paymentColor: Record<string, string> = {
    PAID_FULL:    "text-emerald-600",
    PAYMENT_PLAN: "text-amber-600",
    SCHOLARSHIP:  "text-violet-600",
    OUTSTANDING:  "text-red-600",
    UNPAID:       "text-slate-400",
  };

  return (
    <div
      draggable={draggable}
      onDragStart={e => {
        e.dataTransfer.setData("leadId", lead.id);
        e.dataTransfer.setData("fromStage", lead.stage);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(lead.id);
      }}
      onDragEnd={onDragEnd}
      className={`bg-white rounded-2xl border shadow-sm transition-all p-4 relative select-none card-hover ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${dragging ? "opacity-40 scale-95" : ""}`}
      style={{ borderColor: dragging ? "#bfe6e2" : "#e4e0d6" }}
    >
      {/* Header: avatar + name + type + priority */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm" style={{ background: "#086c64" }}>
            <span className="text-white text-[11px] font-bold">{initials}</span>
          </div>
          <div>
            <Link href={`/leads/${lead.id}`}
              className="text-sm font-bold transition leading-tight block hover:underline" style={{ color: "#14211f" }}>
              {lead.firstName} {lead.lastName}
            </Link>
            {(lead.jobTitle || lead.company) && (
              <p className="text-[11px] leading-tight mt-0.5 truncate max-w-[130px]" style={{ color: "#949598" }}>
                {lead.jobTitle}{lead.jobTitle && lead.company ? " · " : ""}{lead.company}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${priorityColor[lead.priority] ?? priorityColor.NORMAL}`}>
            {lead.priority}
          </span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
        </div>
      </div>

      {/* Contact info */}
      <div className="space-y-1 mb-2.5">
        <a href={`mailto:${lead.email}`}
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1.5 text-[11px] transition truncate hover:underline" style={{ color: "#5a6663" }}>
          <Mail size={10} className="flex-shrink-0" style={{ color: "#949598" }} />
          <span className="truncate">{lead.email}</span>
        </a>
        {lead.phone && (
          <a href={`tel:${lead.phone}`}
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1.5 text-[11px] transition hover:underline" style={{ color: "#5a6663" }}>
            <Phone size={10} className="flex-shrink-0" style={{ color: "#949598" }} />
            {lead.phone}
          </a>
        )}
        {(lead.dealValue ?? 0) > 0 && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <DollarSign size={10} className="flex-shrink-0" style={{ color: "#949598" }} />
            <span className="font-semibold" style={{ color: "#14211f" }}>${lead.dealValue!.toLocaleString()}</span>
            {lead.paymentStatus && lead.paymentStatus !== "UNPAID" && (
              <span className={`font-medium ${paymentColor[lead.paymentStatus] ?? ""}`}>
                · {lead.paymentStatus.replace("_", " ")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tags row */}
      <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
        {lead.source && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            lead.source === "EVENT"    ? "bg-amber-50 text-amber-700" :
            lead.source === "REFERRAL" ? "bg-blue-50 text-blue-700"  :
            lead.source === "LINKEDIN" ? "bg-indigo-50 text-indigo-700" :
            "bg-[#f1efe8] text-[#5a6663]"
          }`}>
            {sourceLabel(lead.source)}
          </span>
        )}
        {lead.tags.slice(0, 2).map(tag => (
          <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: "#edf5f4", color: "#086c64" }}>
            {tag}
          </span>
        ))}
        {lead.score !== undefined && lead.stage !== "ENROLLED" && lead.stage !== "LOST" && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${scoreColor(lead.score)}`}>
            <Sparkles size={8} /> {lead.score}
          </span>
        )}
      </div>

      {/* Footer: activity + move */}
      <div className="flex items-center justify-between gap-2 pt-2" style={{ borderTop: "1px solid #e4e0d6" }}>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: "#949598" }}>
          <span>{lead._count.activities} {lead._count.activities === 1 ? "activity" : "activities"}</span>
          <span>·</span>
          <span>{daysSince === 0 ? "Today" : `${daysSince}d ago`}</span>
          {lead.enrolledUser && <span className="text-green-600 font-semibold">✓ Enrolled</span>}
        </div>

        <div className="relative">
          <button
            onClick={() => setShowMenu(v => !v)}
            disabled={moving}
            className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition disabled:opacity-40"
            style={{ color: "#5a6663" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#edf5f4"; (e.currentTarget as HTMLButtonElement).style.color = "#086c64"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#5a6663"; }}
          >
            {moving ? <Loader2 size={11} className="animate-spin" /> : <ArrowRight size={11} />}
            Move
            <ChevronDown size={10} />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 bottom-full mb-1 z-20 bg-white rounded-xl shadow-lg py-1 min-w-[140px]" style={{ border: "1px solid #e4e0d6" }}>
                {stages.filter(s => s.key !== lead.stage).map(s => (
                  <button key={s.key}
                    onClick={() => { onMove(lead.id, s.key); setShowMenu(false); }}
                    className="w-full text-left px-3 py-2 text-xs font-medium transition flex items-center gap-2"
                    style={{ color: "#5a6663" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f8f6f1")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                    {s.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
