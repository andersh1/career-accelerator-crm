"use client";

import { useState } from "react";
import { Webhook, ExternalLink, Send, CheckCircle, XCircle } from "lucide-react";

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
    "toStage": "QUALIFIED"
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
  const [testUrl, setTestUrl]     = useState("");
  const [testing, setTesting]     = useState(false);
  const [result, setResult]       = useState<{ success?: boolean; message?: string } | null>(null);
  const [expanded, setExpanded]   = useState<string | null>(null);

  async function handleTest() {
    if (!testUrl.trim()) return;
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/crm/admin/webhook-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: testUrl }),
      });
      const json = await res.json();
      if (json.success) {
        setResult({ success: true, message: `Delivered — target responded with status ${json.status}` });
      } else {
        setResult({ success: false, message: json.error ?? "Unknown error" });
      }
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

      {/* Env var note */}
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 flex items-start gap-3">
        <Webhook className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-sky-800">Set your URL in Vercel</p>
          <p className="text-sky-700 mt-0.5">
            Add{" "}
            <code className="font-mono bg-sky-100 px-1 rounded text-xs">WEBHOOK_URL</code>{" "}
            or{" "}
            <code className="font-mono bg-sky-100 px-1 rounded text-xs">ZAPIER_WEBHOOK_URL</code>{" "}
            as environment variables in your Vercel project settings.
            Both can be set simultaneously — events are sent to all configured URLs.
          </p>
        </div>
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
            Enter a URL and send a test payload to confirm your endpoint is receiving events correctly.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={testUrl}
            onChange={(e) => { setTestUrl(e.target.value); setResult(null); }}
            placeholder="https://hooks.zapier.com/hooks/catch/..."
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            onClick={handleTest}
            disabled={testing || !testUrl.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 text-white text-sm font-semibold px-4 py-2 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            {testing ? "Sending…" : "Send Test"}
          </button>
        </div>

        {result && (
          <div
            className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${
              result.success
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-red-50 border border-red-200 text-red-800"
            }`}
          >
            {result.success ? (
              <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
            )}
            <span>{result.message}</span>
          </div>
        )}
      </div>

      {/* Zapier link */}
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
