"use client";

import { useState } from "react";
import { END_REASONS } from "@/components/crm/constants";

/**
 * Asks why a deal ended, on the way into a terminal stage.
 *
 * It is deliberately impossible to skip. The old prompt lived only on the lead
 * page and could be walked around by changing the stage from the list, which is
 * how most stages actually get changed — so most closed deals carried no reason
 * at all, and the chart built on them was answering a question with four fifths
 * of the evidence missing.
 */
export default function EndReasonModal({
  stage, name, busy, onCancel, onConfirm,
}: {
  stage: string;
  name: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (category: string, note: string) => void;
}) {
  const spec = END_REASONS[stage];
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  if (!spec) return null;

  const isLost = stage === "LOST";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-base font-bold mb-1" style={{ color: "#14211f" }}>{spec.heading}</h3>
        <p className="text-xs mb-4" style={{ color: "#949598" }}>
          {name} · {spec.blurb}
        </p>

        <div className="space-y-1.5 mb-4">
          {spec.options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => setCategory(opt)}
              className={`w-full text-left text-sm px-3 py-2 rounded-xl border transition ${
                category === opt
                  ? "border-[#086c64] bg-[#edf5f4] font-semibold"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
              style={{ color: "#14211f" }}
            >
              {opt}
            </button>
          ))}
        </div>

        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          placeholder="Anything worth remembering — what they actually said."
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#086c64]/30 resize-none mb-4"
        />

        <div className="flex gap-2">
          <button
            onClick={() => onConfirm(category, note.trim())}
            disabled={!category || busy}
            className={`flex-1 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition disabled:opacity-40 ${
              isLost ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"}`}
          >
            {busy ? "Saving…" : isLost ? "Mark as Lost" : "Mark as Denied"}
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2.5 text-sm font-semibold border border-slate-200 rounded-xl hover:bg-slate-50 transition"
            style={{ color: "#5a6663" }}
          >
            Cancel
          </button>
        </div>

        {!category && (
          <p className="mt-2.5 text-[11px] text-center" style={{ color: "#949598" }}>
            Pick a reason to continue — this is the whole point of the stage.
          </p>
        )}
      </div>
    </div>
  );
}
