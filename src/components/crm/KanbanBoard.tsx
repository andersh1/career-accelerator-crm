"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Search, Loader2, ArrowRight, Filter, ChevronDown, Sparkles } from "lucide-react";
import { STAGES, stageInfo, sourceLabel } from "./constants";
import LeadForm from "./LeadForm";
import { scoreColor } from "@/lib/scoring";
import { useToast } from "@/lib/toast";

interface Lead {
  id:         string;
  firstName:  string;
  lastName:   string;
  email:      string;
  company:    string | null;
  jobTitle:   string | null;
  stage:      string;
  source:     string | null;
  priority:   string;
  tags:       string[];
  score?:     number;
  createdAt:  string;
  updatedAt:  string;
  enrolledUser: { id: string; name: string } | null;
  _count:     { activities: number };
}

type StageEntry = typeof STAGES[number];

const DRAGGABLE_STAGES = ["LEAD", "CONTACTED", "QUALIFIED", "PROPOSAL"];

export default function KanbanBoard() {
  const { success } = useToast();
  const [leads,         setLeads]         = useState<Lead[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [showForm,      setShowForm]      = useState(false);
  const [search,        setSearch]        = useState("");
  const [movingId,      setMovingId]      = useState<string | null>(null);
  const [showLost,      setShowLost]      = useState(false);
  const [draggingId,    setDraggingId]    = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/crm/leads");
    const data = await res.json();
    if (Array.isArray(data)) setLeads(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = search.trim()
    ? leads.filter(l =>
        `${l.firstName} ${l.lastName} ${l.email} ${l.company ?? ""}`.toLowerCase()
          .includes(search.toLowerCase()))
    : leads;

  const kanbanStages = STAGES.filter(s => showLost ? true : s.key !== "LOST");

  async function moveStage(leadId: string, newStage: string) {
    setMovingId(leadId);
    const res = await fetch(`/api/crm/leads/${leadId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ stage: newStage }),
    });
    if (res.ok) {
      const updated = await res.json();
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: updated.stage } : l));
      success(`Moved to ${stageInfo(newStage).label}`);
    }
    setMovingId(null);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-white flex-shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search leads…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
        </div>
        <button
          onClick={() => setShowLost(v => !v)}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition ${
            showLost ? "bg-red-50 text-red-700 border-red-200" : "text-slate-500 border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Filter size={12} /> {showLost ? "Hide Lost" : "Show Lost"}
        </button>
        <div className="flex-1" />
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition shadow-sm">
          <Plus size={15} /> Add Lead
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto p-6">
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
                  }}
                >
                  <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl mb-3 transition-colors ${
                    isDropTarget ? "ring-2 ring-blue-400 ring-offset-1 " + stg.color : stg.color
                  }`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${stg.dot}`} />
                      <span className="text-sm font-bold text-slate-700">{stg.label}</span>
                      {isDraggable && <span className="text-[9px] text-slate-400 font-normal">drag to move</span>}
                    </div>
                    <span className="text-xs font-bold text-slate-400 bg-white px-1.5 py-0.5 rounded-full">
                      {stageLeads.length}
                    </span>
                  </div>

                  <div className={`flex-1 space-y-2.5 overflow-y-auto pr-0.5 scrollbar-thin rounded-2xl transition-colors ${
                    isDropTarget ? "bg-blue-50/60 outline-2 outline-dashed outline-blue-300 outline-offset-2" : ""
                  }`}>
                    {stageLeads.length === 0 && (
                      <div className={`border-2 border-dashed rounded-2xl p-6 text-center transition-colors ${
                        isDropTarget ? "border-blue-300 bg-blue-50" : "border-slate-200"
                      }`}>
                        <p className="text-xs text-slate-400">{isDropTarget ? "Drop here" : "No leads here"}</p>
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

  const priorityColor: Record<string, string> = {
    HIGH:   "bg-red-100 text-red-700",
    NORMAL: "bg-blue-50 text-blue-600",
    LOW:    "bg-slate-100 text-slate-500",
    URGENT: "bg-red-200 text-red-800",
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
      className={`bg-white rounded-2xl border shadow-sm transition-all p-4 relative select-none ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${
        dragging
          ? "opacity-40 scale-95 border-blue-300"
          : "border-slate-200 hover:shadow-md hover:border-slate-300"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-white text-[11px] font-bold">{initials}</span>
          </div>
          <div>
            <Link href={`/leads/${lead.id}`}
              className="text-sm font-bold text-slate-900 hover:text-blue-600 transition leading-tight block">
              {lead.firstName} {lead.lastName}
            </Link>
            {(lead.jobTitle || lead.company) && (
              <p className="text-[11px] text-slate-400 leading-tight mt-0.5 truncate max-w-[130px]">
                {lead.jobTitle}{lead.jobTitle && lead.company ? " · " : ""}{lead.company}
              </p>
            )}
          </div>
        </div>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${priorityColor[lead.priority] ?? priorityColor.NORMAL}`}>
          {lead.priority}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        {lead.source && (
          <span className="text-[10px] font-medium bg-slate-50 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded">
            {sourceLabel(lead.source)}
          </span>
        )}
        {lead.tags.slice(0, 2).map(tag => (
          <span key={tag} className="text-[10px] font-medium bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
            {tag}
          </span>
        ))}
        {lead.score !== undefined && lead.stage !== "ENROLLED" && lead.stage !== "LOST" && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${scoreColor(lead.score)}`}>
            <Sparkles size={8} /> {lead.score}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span>{lead._count.activities} {lead._count.activities === 1 ? "activity" : "activities"}</span>
          <span>·</span>
          <span>{daysSince === 0 ? "Today" : `${daysSince}d ago`}</span>
          {lead.enrolledUser && <span className="text-green-600 font-semibold">✓ Student</span>}
        </div>

        <div className="relative">
          <button
            onClick={() => setShowMenu(v => !v)}
            disabled={moving}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-50 transition disabled:opacity-40"
          >
            {moving ? <Loader2 size={11} className="animate-spin" /> : <ArrowRight size={11} />}
            Move
            <ChevronDown size={10} />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 bottom-full mb-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[140px]">
                {stages.filter(s => s.key !== lead.stage).map(s => (
                  <button key={s.key}
                    onClick={() => { onMove(lead.id, s.key); setShowMenu(false); }}
                    className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 transition flex items-center gap-2">
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
