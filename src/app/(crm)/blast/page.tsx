"use client";

import { useState } from "react";
import { Send, Loader2, Users, AlertCircle, CheckCircle2, ChevronDown } from "lucide-react";
import { STAGES, SOURCES } from "@/components/crm/constants";
import { useToast } from "@/lib/toast";

const PRIORITIES = ["URGENT","HIGH","NORMAL","LOW"];

interface Preview { id: string; firstName: string; lastName: string; email: string; }

export default function BlastPage() {
  const { success, error: toastError } = useToast();

  const [subject,   setSubject]   = useState("");
  const [body,      setBody]      = useState("");
  const [stage,     setStage]     = useState("");
  const [source,    setSource]    = useState("");
  const [priority,  setPriority]  = useState("");

  const [preview,   setPreview]   = useState<{ count: number; preview: Preview[] } | null>(null);
  const [checking,  setChecking]  = useState(false);
  const [sending,   setSending]   = useState(false);
  const [result,    setResult]    = useState<{ sent: number; failed: number } | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function checkRecipients() {
    setChecking(true);
    setPreview(null);
    setConfirmed(false);
    const res = await fetch("/api/crm/leads/blast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: subject || "preview", body: body || "preview", stage, source, priority, testMode: true }),
    });
    if (res.ok) setPreview(await res.json());
    setChecking(false);
  }

  async function send() {
    if (!subject.trim() || !body.trim()) { toastError("Subject and body are required"); return; }
    if (!confirmed) { toastError("Check the preview and confirm before sending"); return; }
    setSending(true);
    setResult(null);
    const res = await fetch("/api/crm/leads/blast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, stage, source, priority }),
    });
    const data = await res.json();
    if (res.ok) {
      setResult(data);
      success(`Sent to ${data.sent} lead${data.sent !== 1 ? "s" : ""} ✓`);
    } else {
      toastError(data.error ?? "Failed to send");
    }
    setSending(false);
    setConfirmed(false);
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Email Blast</h1>
        <p className="text-sm text-slate-500 mt-1">Send a one-off email to a filtered segment of leads. Enrolled and lost leads are excluded by default.</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
        <h2 className="font-bold text-slate-800 text-sm">Audience Filters</h2>
        <p className="text-xs text-slate-400">Leave filters empty to reach all active leads.</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Stage</label>
            <select value={stage} onChange={e => { setStage(e.target.value); setPreview(null); setConfirmed(false); }}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All active stages</option>
              {STAGES.filter(s => s.key !== "ENROLLED" && s.key !== "LOST").map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Source</label>
            <select value={source} onChange={e => { setSource(e.target.value); setPreview(null); setConfirmed(false); }}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All sources</option>
              {SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Priority</label>
            <select value={priority} onChange={e => { setPriority(e.target.value); setPreview(null); setConfirmed(false); }}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All priorities</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <button onClick={checkRecipients} disabled={checking}
          className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 transition disabled:opacity-50">
          {checking ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
          Preview recipient count
        </button>
        {preview && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
            <p className="text-sm font-bold text-blue-800">{preview.count} lead{preview.count !== 1 ? "s" : ""} will receive this email</p>
            {preview.preview.length > 0 && (
              <p className="text-xs text-blue-600 mt-1">
                Including: {preview.preview.map(l => `${l.firstName} ${l.lastName}`).join(", ")}
                {preview.count > 5 ? ` and ${preview.count - 5} more…` : ""}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Email */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
        <h2 className="font-bold text-slate-800 text-sm">Email Content</h2>
        <p className="text-xs text-slate-400">Use <code className="bg-slate-100 px-1 py-0.5 rounded">{"{{firstName}}"}</code> and <code className="bg-slate-100 px-1 py-0.5 rounded">{"{{fullName}}"}</code> for personalization.</p>
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">Subject *</label>
          <input value={subject} onChange={e => setSubject(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enrollment for Cohort 2 is now open" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">Body *</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={10}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
            placeholder={"Hi {{firstName}},\n\nWanted to reach out personally — we just opened enrollment for Cohort 2...\n\nBook a call here: https://calendly.com/...\n\nDan"} />
        </div>
      </div>

      {/* Send */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
        {result ? (
          <div className="flex items-center gap-3">
            <CheckCircle2 size={20} className="text-emerald-500 flex-shrink-0" />
            <div>
              <p className="font-bold text-slate-900">Blast sent!</p>
              <p className="text-sm text-slate-500">{result.sent} delivered{result.failed > 0 ? `, ${result.failed} failed` : ""}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5">
              <input type="checkbox" id="confirm" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
                className="mt-0.5 rounded" />
              <label htmlFor="confirm" className="text-sm text-slate-700">
                I've previewed the recipient count and I'm ready to send this email. I understand this will go to real leads immediately.
              </label>
            </div>
            {!subject.trim() || !body.trim() ? (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-xl">
                <AlertCircle size={13} /> Fill in subject and body before sending
              </div>
            ) : null}
            <button
              onClick={send}
              disabled={sending || !subject.trim() || !body.trim() || !confirmed}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white font-bold py-3 rounded-xl transition text-sm"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {sending ? "Sending…" : "Send Email Blast"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
