"use client";
import { useState, useEffect, FormEvent } from "react";
import { useSession } from "next-auth/react";
import { Save, Loader2, CheckCircle2, Slack, FileText, Send } from "lucide-react";

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const [name,    setName]    = useState(session?.user?.name ?? "");
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState("");

  // App settings
  const [slackUrl,   setSlackUrl]   = useState("");
  const [progName,   setProgName]   = useState("");
  const [tagline,    setTagline]    = useState("");
  const [footer,     setFooter]     = useState("");
  const [appSaving,  setAppSaving]  = useState(false);
  const [appSaved,   setAppSaved]   = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);
  const [slackResult,  setSlackResult]  = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/crm/app-settings").then(r => r.json()).then((d: Record<string, string>) => {
      setSlackUrl(d.slack_webhook_url ?? "");
      setProgName(d.proposal_program_name ?? "");
      setTagline( d.proposal_tagline ?? "");
      setFooter(  d.proposal_footer ?? "");
    });
  }, []);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      await update({ name: name.trim() });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function saveAppSettings() {
    setAppSaving(true); setAppSaved(false);
    await fetch("/api/crm/app-settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slack_webhook_url:    slackUrl,
        proposal_program_name: progName,
        proposal_tagline:     tagline,
        proposal_footer:      footer,
      }),
    });
    setAppSaved(true); setAppSaving(false);
    setTimeout(() => setAppSaved(false), 3000);
  }

  async function testSlack() {
    setTestingSlack(true); setSlackResult(null);
    const url = slackUrl || undefined;
    if (!url) { setSlackResult("❌ Enter a webhook URL first"); setTestingSlack(false); return; }
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "✅ Career Accelerator CRM — Slack integration is working!" }),
      });
      setSlackResult(res.ok ? "✅ Message sent! Check your Slack channel." : `❌ Slack returned ${res.status}`);
    } catch { setSlackResult("❌ Could not reach Slack. Check the URL."); }
    setTestingSlack(false);
  }

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      {children}
    </div>
  );

  const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {hint && <p className="text-xs text-slate-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );

  const inputCls = "w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white";

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage account, integrations, and proposal defaults.</p>
      </div>

      {/* Profile */}
      <Section title="Profile">
        <form onSubmit={saveProfile} className="space-y-4">
          <Field label="Display Name">
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Email">
            <input value={session?.user?.email ?? ""} disabled
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-100 text-slate-500 cursor-not-allowed" />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition">
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
            {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
          </button>
        </form>
      </Section>

      {/* Slack */}
      <Section title="Slack Integration">
        <p className="text-xs text-slate-500 -mt-2">
          Get notified in Slack when a lead enrolls or goes cold.{" "}
          <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer"
            className="text-blue-600 hover:underline">How to create a webhook →</a>
        </p>
        <Field label="Webhook URL" hint="Paste your Slack Incoming Webhook URL">
          <div className="flex gap-2">
            <input value={slackUrl} onChange={e => setSlackUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className={inputCls + " flex-1"} />
          </div>
        </Field>
        {slackResult && (
          <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">{slackResult}</p>
        )}
        <div className="flex gap-2">
          <button onClick={testSlack} disabled={testingSlack}
            className="flex items-center gap-2 text-sm font-semibold text-slate-600 border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition">
            {testingSlack ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send test message
          </button>
        </div>
      </Section>

      {/* Proposal defaults */}
      <Section title="Proposal Defaults">
        <p className="text-xs text-slate-500 -mt-2">
          These appear on every generated proposal. Customize to match your brand.
        </p>
        <Field label="Program Name">
          <input value={progName} onChange={e => setProgName(e.target.value)}
            placeholder="Career Accelerator Program" className={inputCls} />
        </Field>
        <Field label="Tagline">
          <input value={tagline} onChange={e => setTagline(e.target.value)}
            placeholder="Land your next role. Faster." className={inputCls} />
        </Field>
        <Field label="Footer Text">
          <input value={footer} onChange={e => setFooter(e.target.value)}
            placeholder="Questions? Reply to this proposal or book a call." className={inputCls} />
        </Field>
      </Section>

      {/* Save app settings */}
      <button onClick={saveAppSettings} disabled={appSaving}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition">
        {appSaving ? <Loader2 size={14} className="animate-spin" /> : appSaved ? <CheckCircle2 size={14} /> : <Save size={14} />}
        {appSaving ? "Saving…" : appSaved ? "Saved!" : "Save Integrations & Proposal"}
      </button>
    </div>
  );
}
