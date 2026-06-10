"use client";
import { useState, useEffect, FormEvent } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Save, Loader2, CheckCircle2, Send, Mail, RefreshCw, Unlink, AlertCircle } from "lucide-react";

interface GmailStatus {
  connected: boolean;
  gmailEmail: string | null;
  gmailSyncedAt: string | null;
}

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const searchParams = useSearchParams();

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

  // Gmail
  const [gmailStatus,     setGmailStatus]     = useState<GmailStatus | null>(null);
  const [gmailConnecting, setGmailConnecting] = useState(false);
  const [gmailSyncing,    setGmailSyncing]    = useState(false);
  const [gmailSyncResult, setGmailSyncResult] = useState<string | null>(null);
  const [gmailBanner,     setGmailBanner]     = useState<"connected" | "disconnected" | "error" | null>(null);

  // Handle OAuth redirect query params
  useEffect(() => {
    const gmail = searchParams.get("gmail") as "connected" | "disconnected" | "error" | null;
    if (gmail) {
      setGmailBanner(gmail);
      setTimeout(() => setGmailBanner(null), 6000);
      // Remove query param from URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete("gmail");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

  // Load app settings + Gmail status
  useEffect(() => {
    fetch("/api/crm/app-settings").then(r => r.json()).then((d: Record<string, string>) => {
      setSlackUrl(d.slack_webhook_url ?? "");
      setProgName(d.proposal_program_name ?? "");
      setTagline( d.proposal_tagline ?? "");
      setFooter(  d.proposal_footer ?? "");
    });
    loadGmailStatus();
  }, []);

  async function loadGmailStatus() {
    try {
      const res = await fetch("/api/auth/gmail?action=status");
      if (res.ok) setGmailStatus(await res.json());
    } catch { /* ignore */ }
  }

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
        slack_webhook_url:     slackUrl,
        proposal_program_name: progName,
        proposal_tagline:      tagline,
        proposal_footer:       footer,
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

  async function connectGmail() {
    setGmailConnecting(true);
    try {
      const res = await fetch("/api/auth/gmail?action=url");
      const data = await res.json() as { url?: string; error?: string };
      if (data.error) throw new Error(data.error);
      if (data.url) window.location.href = data.url;
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to start Gmail auth");
    } finally {
      setGmailConnecting(false);
    }
  }

  async function disconnectGmail() {
    if (!confirm("Disconnect Gmail? Synced email history will remain in the timeline.")) return;
    window.location.href = "/api/auth/gmail?action=disconnect";
  }

  async function syncGmail() {
    setGmailSyncing(true);
    setGmailSyncResult(null);
    try {
      const res = await fetch("/api/crm/gmail-sync", { method: "POST" });
      const data = await res.json() as { synced?: number; skipped?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setGmailSyncResult(`✅ Synced ${data.synced} new email${data.synced === 1 ? "" : "s"} (${data.skipped} already logged)`);
      await loadGmailStatus();
    } catch (e: unknown) {
      setGmailSyncResult(`❌ ${e instanceof Error ? e.message : "Sync failed"}`);
    } finally {
      setGmailSyncing(false);
    }
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

  const formatSyncDate = (iso: string | null) => {
    if (!iso) return "Never";
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  };

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage account, integrations, and proposal defaults.</p>
      </div>

      {/* Gmail OAuth banner */}
      {gmailBanner === "connected" && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
          <CheckCircle2 size={16} className="text-green-600 shrink-0" />
          <p className="text-sm text-green-800 font-medium">Gmail connected successfully!</p>
        </div>
      )}
      {gmailBanner === "disconnected" && (
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
          <CheckCircle2 size={16} className="text-slate-500 shrink-0" />
          <p className="text-sm text-slate-700 font-medium">Gmail disconnected.</p>
        </div>
      )}
      {gmailBanner === "error" && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <AlertCircle size={16} className="text-red-600 shrink-0" />
          <p className="text-sm text-red-800 font-medium">Gmail connection failed. Please try again or check your Google Cloud credentials.</p>
        </div>
      )}

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

      {/* Gmail */}
      <Section title="Gmail Integration">
        <p className="text-xs text-slate-500 -mt-2">
          Connect your Gmail account to automatically log sent emails to lead timelines.
          Emails you send from Gmail to any lead&apos;s email address will appear in their activity feed.
        </p>

        {gmailStatus?.connected ? (
          <div className="space-y-4">
            {/* Connected status */}
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-900">Connected</p>
                <p className="text-xs text-green-700 truncate">{gmailStatus.gmailEmail}</p>
              </div>
              <Mail size={16} className="text-green-600 shrink-0" />
            </div>

            <div className="text-xs text-slate-400">
              Last synced: {formatSyncDate(gmailStatus.gmailSyncedAt)}
            </div>

            {gmailSyncResult && (
              <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">{gmailSyncResult}</p>
            )}

            <div className="flex gap-2">
              <button onClick={syncGmail} disabled={gmailSyncing}
                className="flex items-center gap-2 text-sm font-semibold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 px-4 py-2 rounded-xl transition">
                {gmailSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {gmailSyncing ? "Syncing…" : "Sync Now"}
              </button>
              <button onClick={disconnectGmail}
                className="flex items-center gap-2 text-sm font-semibold text-slate-500 border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 px-4 py-2 rounded-xl transition">
                <Unlink size={14} />
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              <div className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
              <p className="text-sm text-slate-500">Not connected</p>
            </div>
            <button onClick={connectGmail} disabled={gmailConnecting}
              className="flex items-center gap-2 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 border border-slate-200 text-sm font-semibold px-4 py-2.5 rounded-xl transition shadow-sm">
              {gmailConnecting
                ? <Loader2 size={14} className="animate-spin" />
                : <svg viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
              }
              {gmailConnecting ? "Redirecting…" : "Connect Gmail"}
            </button>
            <p className="text-xs text-slate-400">
              You&apos;ll be redirected to Google to authorize read + send access. Requires{" "}
              <code className="bg-slate-100 px-1 rounded">GOOGLE_CLIENT_ID</code> and{" "}
              <code className="bg-slate-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code> in your environment.
            </p>
          </div>
        )}
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
