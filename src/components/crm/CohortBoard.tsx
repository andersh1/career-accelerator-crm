"use client";

/**
 * The cohort board.
 *
 * Four columns, every cohort in the one that matches what is actually true of
 * it. The card carries the single most pressing thing rather than a progress
 * bar, because the question being asked is "what needs me today", not "how far
 * along is this".
 *
 * Nothing here is draggable, on purpose. A board you move by hand is a tickbox
 * with better graphics: right the day you set it up and lying a week later.
 * The phase is computed from the data in src/lib/cohort-board.ts, so a card
 * cannot claim a cohort is ready when it is not.
 *
 * Clicking a card opens that cohort's existing panel below, on the tab where
 * the outstanding work actually happens.
 */

import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertTriangle, CheckCircle2, Circle, MinusCircle, ChevronRight } from "lucide-react";
import { PHASES, type Phase, type BoardCard, type StepStatus } from "@/lib/cohort-board";

type Tab = "setup" | "roster" | "schedule" | "sessions" | "emails";

const STATUS_ICON: Record<StepStatus, { icon: typeof Circle; color: string; label: string }> = {
  done:     { icon: CheckCircle2, color: "#086c64", label: "done" },
  todo:     { icon: Circle,       color: "#949598", label: "to do" },
  warn:     { icon: AlertTriangle,color: "#b45309", label: "needs attention" },
  optional: { icon: MinusCircle,  color: "#c9c4b8", label: "optional" },
  na:       { icon: MinusCircle,  color: "#c9c4b8", label: "not applicable" },
};

export default function CohortBoard({
  onOpen,
  refreshKey,
}: {
  /** Open a cohort's panel on a given tab. */
  onOpen: (cohortId: string, tab: Tab) => void;
  /** Bump to re-read the board after something is saved elsewhere. */
  refreshKey?: number;
}) {
  const [cards, setCards] = useState<BoardCard[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/cohorts/board${showArchived ? "?archived=1" : ""}`);
    setCards(res.ok ? (await res.json()).cards : []);
  }, [showArchived]);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (cards === null) {
    return (
      <div className="flex items-center gap-2 text-xs py-6" style={{ color: "#949598" }}>
        <Loader2 size={13} className="animate-spin" /> Reading every cohort…
      </div>
    );
  }

  const needing = cards.filter(c => c.outstanding > 0).length;

  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <p className="text-xs" style={{ color: "#5a6663" }}>
          {needing === 0
            ? "Every cohort is where it should be. Nothing is waiting on you."
            : `${needing} cohort${needing === 1 ? "" : "s"} waiting on something.`}
          {" "}Cards move themselves as the work gets done.
        </p>
        <label className="flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: "#949598" }}>
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        {PHASES.map(ph => {
          const inCol = cards.filter(c => c.phase === ph.key);
          return (
            <div key={ph.key} className="rounded-2xl border p-2.5"
              style={{ borderColor: "#e4e0d6", background: "#f8f6f1", minHeight: 150 }}>
              <div className="px-1 pb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#14211f" }}>
                  {ph.label}
                  <span className="ml-1.5 font-normal" style={{ color: "#c9c4b8" }}>{inCol.length}</span>
                </p>
                <p className="text-[9px] mt-0.5" style={{ color: "#949598" }}>{ph.blurb}</p>
              </div>

              <div className="space-y-2">
                {inCol.length === 0 && (
                  <p className="text-[10px] px-1 py-3" style={{ color: "#c9c4b8" }}>Nothing here.</p>
                )}
                {inCol.map(c => (
                  <CardTile key={c.id} card={c} phase={ph.key}
                    expanded={open === c.id}
                    onToggle={() => setOpen(open === c.id ? null : c.id)}
                    onOpen={onOpen} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardTile({
  card, phase, expanded, onToggle, onOpen,
}: {
  card: BoardCard; phase: Phase; expanded: boolean;
  onToggle: () => void; onOpen: (id: string, tab: Tab) => void;
}) {
  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ borderColor: card.urgent ? "#e8c9a0" : "#e4e0d6", background: "white" }}>
      <button onClick={onToggle} className="w-full text-left p-2.5">
        <div className="flex items-start justify-between gap-1.5">
          <span className="text-xs font-semibold leading-tight" style={{ color: "#14211f" }}>{card.name}</span>
          {card.track === "PRIVATE" && (
            <span className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ background: "#f1efe8", color: "#5a6663" }}>1:1</span>
          )}
        </div>
        <p className="text-[9px] mt-0.5" style={{ color: "#949598" }}>
          {card.fellows} Fellow{card.fellows === 1 ? "" : "s"}
          {!card.isActive && " · archived"}
        </p>

        {card.headline ? (
          <div className="mt-2 rounded-lg px-2 py-1.5"
            style={{ background: card.urgent ? "#fdf0e3" : "#f8f6f1" }}>
            <p className="text-[10px] font-semibold leading-snug"
              style={{ color: card.urgent ? "#b45309" : "#5a6663" }}>
              {card.urgent && <AlertTriangle size={9} className="inline mr-1 mb-0.5" />}
              {card.headline}
            </p>
            {card.subline && (
              <p className="text-[9px] mt-0.5 leading-snug" style={{ color: "#949598" }}>{card.subline}</p>
            )}
          </div>
        ) : (
          <p className="text-[10px] mt-2 flex items-center gap-1" style={{ color: "#086c64" }}>
            <CheckCircle2 size={10} /> Nothing outstanding
          </p>
        )}

        {card.outstanding > 0 && (
          <p className="text-[9px] mt-1.5" style={{ color: "#949598" }}>
            {card.outstanding} step{card.outstanding === 1 ? "" : "s"} left in {PHASES.find(p => p.key === phase)?.label}
          </p>
        )}
      </button>

      {expanded && (
        <div className="border-t px-2.5 py-2 space-y-2.5" style={{ borderColor: "#e4e0d6", background: "#faf9f5" }}>
          {PHASES.map(ph => {
            const ss = card.steps.filter(s => s.phase === ph.key);
            if (!ss.length) return null;
            return (
              <div key={ph.key}>
                <p className="text-[8px] font-bold uppercase tracking-widest mb-1" style={{ color: "#c9c4b8" }}>
                  {ph.label}
                </p>
                <div className="space-y-1">
                  {ss.map(s => {
                    const si = STATUS_ICON[s.status];
                    const Icon = si.icon;
                    return (
                      <button key={s.key}
                        onClick={() => s.tab && onOpen(card.id, s.tab)}
                        disabled={!s.tab}
                        className="w-full text-left flex items-start gap-1.5 rounded-lg px-1.5 py-1 transition disabled:cursor-default"
                        style={{ background: "transparent" }}
                        title={s.tab ? `Open the ${s.tab} tab` : s.where}>
                        <Icon size={10} style={{ color: si.color, marginTop: 2, flexShrink: 0 }} />
                        <span className="min-w-0">
                          <span className="text-[10px] font-semibold block leading-snug"
                            style={{ color: s.status === "na" || s.status === "optional" ? "#949598" : "#14211f" }}>
                            {s.title}
                            {!s.required && s.status !== "done" && (
                              <span className="font-normal" style={{ color: "#c9c4b8" }}> · optional</span>
                            )}
                          </span>
                          <span className="text-[9px] block leading-snug" style={{ color: "#949598" }}>{s.detail}</span>
                        </span>
                        {s.tab && <ChevronRight size={9} style={{ color: "#c9c4b8", marginTop: 3, marginLeft: "auto", flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
