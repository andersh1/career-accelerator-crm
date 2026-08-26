"use client";

import { useState } from "react";
import { Send, Loader2, ChevronDown, X, Maximize2, Minimize2 } from "lucide-react";
import { TEMPLATES } from "./EmailTemplates";

interface Props {
  leadId:   string;
  leadName: string;
  leadEmail: string;
  onSent:   () => void;        // refresh timeline after send
  onClose:  () => void;
  initialSubject?: string;
  initialBody?:    string;
}

export default function EmailComposer({ leadId, leadName, leadEmail, onSent, onClose, initialSubject, initialBody }: Props) {
  const firstName = leadName.split(" ")[0] || leadName;

  const [subject,    setSubject]    = useState(initialSubject ?? "");
  const [body,       setBody]       = useState(initialBody ?? "");
  const [sending,    setSending]    = useState(false);
  const [error,      setError]      = useState("");
  const [showTpls,   setShowTpls]   = useState(false);
  const [expanded,   setExpanded]   = useState(false);

  function applyTemplate(tpl: typeof TEMPLATES[0]) {
    setSubject(tpl.subject);
    setBody(tpl.body(firstName));
    setShowTpls(false);
  }

  async function send() {
    if (!subject.trim() || !body.trim()) {
      setError("Subject and body are required.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/crm/leads/${leadId}/send-email`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ subject: subject.trim(), body: body.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      onSent();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  const expandedH = expanded ? "h-[520px]" : "h-[340px]";

  return (
    <div className={`flex flex-col bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden transition-all ${expandedH}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">New Email</span>
          <span className="text-xs text-slate-400">to {leadEmail}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setExpanded(v => !v)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition">
            {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Subject */}
      <div className="border-b border-slate-100 shrink-0">
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Subject"
          className="w-full px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
        />
      </div>

      {/* Body */}
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder={`Write your email to ${firstName}…`}
        className="flex-1 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none resize-none leading-relaxed"
      />

      {/* Footer toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 shrink-0 bg-slate-50">
        <div className="flex items-center gap-2">
          {/* Templates picker */}
          <div className="relative">
            <button onClick={() => setShowTpls(v => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-blue-200 hover:bg-blue-50 transition">
              Templates <ChevronDown size={11} />
            </button>
            {showTpls && (
              <div className="absolute bottom-full mb-2 left-0 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
                {TEMPLATES.map(tpl => (
                  <button key={tpl.key} onClick={() => applyTemplate(tpl)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 hover:text-blue-700 transition text-slate-700">
                    {tpl.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <button onClick={send} disabled={sending || !subject.trim() || !body.trim()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">
          {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
