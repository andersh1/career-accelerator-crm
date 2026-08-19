"use client";

import { useState, useEffect } from "react";
import { Webhook, ExternalLink, Send, CheckCircle, XCircle, Save, Loader2 } from "lucide-react";

const WEBHOOK_EVENTS = [
  {
    event: "lead.created",
    description: "Fires when a new lead is added to the CRM.",
    examplePayload: `{
  "event": "lead.created",
  "data": {
    "leadId": "clxyz123",
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@example.com",
    "source": "Instagram",
    "stage": "LEAD"
  },
  "timestamp": "2026-06-16T12:00:00.000Z"
}`,
  },
  {
    event: "lead.stage_changed",
    description: "Fires whenever a lead moves from one pipeline stage to another.",
    examplePayload: `{
  "event": "lead.stage_changed",
  "data": {
    "leadId": "clxyz123",
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@example.com",
    "fromStage": "LEAD",
    "toStage": "STRATEGY_CALL"
  },
  "timestamp": "2026-06-16T13:00:00.000Z"
}`,
  },
  {
    event: "lead.enrolled",
    description: "Fires when a lead's stage is set to ENROLLED (deal closed).",
    examplePayload: `{
  "event": "lead.enrolled",
  "data": {
    "leadId": "clxyz123",
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@example.com",
    "dealValue": 3000
  },
  "timestamp": "2026-06-16T14:00:00.000Z"
}`,
  },
];

export function WebhooksSection() {
  const [webhookUrl,   setWebhookUrl]   = useState("");
  const [zapierUrl,    setZapierUrl]    = useState("");
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [saveOk,       setSaveOk]       = useState(false);

  const [testUrl,  setTestUrl]  = useState("");
  const [testing,  setTesting]  = useState(false);
  const [result,   setResult]   = useState<{ success?: boolean; message?: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Load saved URLs
  useEffect(() => {
    fetch("/api/crm/app-settings")
      .then(r => r.json())
      .then(d => {
        setWebhookUrl(d.webhook_url       ?? "");
        setZapierUrl( d.zapier_webhook_url ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true); setSaveOk(false);
    try {
      await fetch("/api/crm/app-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook_url: webhookUrl, zapier_webhook_url: zapierUrl }),
      });
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    const url = testUrl.trim() || webhookUrl.trim() || zapierUrl.trim();
    if (!url) return;
    setTesting(true); setResult(null);
    try {
      const res = await fetch("/api/crm/admin/webhook-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      setResult(json.success
        ? { success: true,  message: `Delivered — target responded with status ${json.status}` }
        : { success: false, message: json.error ?? "Unknown error" }
      );
    } catch {
      setResult({ success: false, message: "Network error — could not reach webhook test endpoint" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="space-y-4 border-t border-slate-200 pt-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 rounded-lg bg-sky-600/10 flex items-center justify-center">
            <Webhook className="w-3.5 h-3.5 text-sky-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Outbound Webhooks</h2>
        </div>
        <p className="text-sm text-slate-500 ml-9">
          Connect the CRM to Zapier, Make.com, or any custom system. When a key event
          happens, we POST a JSON payload to your webhook URL automatically.
        </p>
      </div>

      {/* URL Inputs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">Webhook Endpoints</h3>

        {loading ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 size={14} className="animate-spin text-slate-400" />
            <span className="text-sm text-slate-400">Loading saved URLs…</span>
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: "#5a6663" }}>
                Primary Webhook URL
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.make.com/…  or any custom endpoint"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: "#5a6663" }}>
                Zapier Webhook URL
              </label>
              <input
                type="url"
                value={zapierUrl}
                onChange={e => setZapierUrl(e.target.value)}
                placeholder="https://hooks.zapier.com/hooks/catch/…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-sky-600 text-white text-sm font-semibold px-4 py-2 hover:bg-sky-700 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {saving ? "Saving…" : "Save URLs"}
              </button>
              {saveOk && (
                <div className="flex items-center gap-1.5 text-sm text-emerald-700 font-medium">
                  <CheckCircle size={14} className="text-emerald-600" />
                  Saved
                </div>
              )}
            </div>

            <p className="text-xs text-slate-400">
              URLs are saved to the database and take effect immediately — no redeployment needed.
              Environment variables{" "}
              <code className="font-mono bg-slate-100 px-1 rounded">WEBHOOK_URL</code>{" "}
              and{" "}
              <code className="font-mono bg-slate-100 px-1 rounded">ZAPIER_WEBHOOK_URL</code>{" "}
              still work as fallbacks if no DB value is set.
            </p>
          </>
        )}
      </div>

      {/* Supported events */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">Supported Events</h3>
        {WEBHOOK_EVENTS.map((ev) => (
          <div key={ev.event} className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <button
              onClick={() => setExpanded(expanded === ev.event ? null : ev.event)}
              className="w-full text-left p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <code className="text-xs font-mono font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded">
                  {ev.event}
                </code>
                <p className="text-sm text-slate-600 mt-1">{ev.description}</p>
              </div>
              <span className="text-xs text-slate-400 shrink-0">
                {expanded === ev.event ? "Hide" : "Example"}
              </span>
            </button>
            {expanded === ev.event && (
              <div className="px-4 pb-4">
                <pre className="text-xs font-mono text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-wrap leading-relaxed overflow-auto">
                  {ev.examplePayload}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Test Webhook */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Test Webhook</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Enter a URL below, or leave blank to test against your saved Primary URL.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={testUrl}
            onChange={(e) => { setTestUrl(e.target.value); setResult(null); }}
            placeholder={webhookUrl || "https://hooks.zapier.com/hooks/catch/…"}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            onClick={handleTest}
            disabled={testing || (!testUrl.trim() && !webhookUrl.trim() && !zapierUrl.trim())}
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 text-white text-sm font-semibold px-4 py-2 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            {testing ? "Sending…" : "Send Test"}
          </button>
        </div>

        {result && (
          <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${
            result.success
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}>
            {result.success
              ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
              : <XCircle    className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
            }
            <span>{result.message}</span>
          </div>
        )}
      </div>

      <a
        href="https://zapier.com/apps/webhook/integrations"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-sky-600 hover:text-sky-800 font-medium"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        How to connect with Zapier
      </a>
    </section>
  );
}
