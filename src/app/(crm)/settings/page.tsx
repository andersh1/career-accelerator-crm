"use client";
import React, { useState, useEffect, FormEvent } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Save, Loader2, CheckCircle2, Send, Mail, RefreshCw, Unlink, AlertCircle, UserPlus, Trash2, Lock, Users, User, Building2, Plug } from "lucide-react";

type SettingsTab = "profile" | "organization" | "team" | "integrations";

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
}

interface GmailStatus {
  connected: boolean;
  gmailEmail: string | null;
  gmailSyncedAt: string | null;
}

const inputCls = "w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {hint && <p className="text-xs text-slate-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const searchParams = useSearchParams();
  const isAdmin = (session?.user as { crmRole?: string } | undefined)?.crmRole === "ADMIN";
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

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

  // Password change
  const [currentPw,   setCurrentPw]   = useState("");
  const [newPw,       setNewPw]       = useState("");
  const [confirmPw,   setConfirmPw]   = useState("");
  const [pwSaving,    setPwSaving]    = useState(false);
  const [pwSaved,     setPwSaved]     = useState(false);
  const [pwError,     setPwError]     = useState("");

  // Team management
  const [adminUsers,    setAdminUsers]    = useState<AdminUser[]>([]);
  const [inviteName,    setInviteName]    = useState("");
  const [inviteEmail,   setInviteEmail]   = useState("");
  const [inviteRole,    setInviteRole]    = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [inviting,      setInviting]      = useState(false);
  const [inviteResult,  setInviteResult]  = useState<{ type: "success" | "warn" | "error"; msg: string } | null>(null);
  const [removingId,    setRemovingId]    = useState<string | null>(null);
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPw,       setResetPw]       = useState("");
  const [resetSaving,   setResetSaving]   = useState(false);
  const [resetResult,   setResetResult]   = useState<{ type: "success" | "error"; msg: string } | null>(null);

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

  // Load app settings, Gmail status, admin users
  useEffect(() => {
    fetch("/api/crm/app-settings").then(r => r.json()).then((d: Record<string, string>) => {
      setSlackUrl(d.slack_webhook_url ?? "");
      setProgName(d.proposal_program_name ?? "");
      setTagline( d.proposal_tagline ?? "");
      setFooter(  d.proposal_footer ?? "");
    });
    loadGmailStatus();
    loadAdminUsers();
  }, []);

  async function loadGmailStatus() {
    try {
      const res = await fetch("/api/auth/gmail?action=status");
      if (res.ok) setGmailStatus(await res.json());
    } catch { /* ignore */ }
  }

  async function loadAdminUsers() {
    try {
      const res = await fetch("/api/crm/users");
      if (res.ok) setAdminUsers(await res.json());
    } catch { /* ignore */ }
  }

  async function inviteAdmin(e: FormEvent) {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    setInviting(true); setInviteResult(null);
    try {
      const res = await fetch("/api/crm/admin/invite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: inviteName.trim(), email: inviteEmail.trim(), crmRole: inviteRole }),
      });
      const data = await res.json() as { user?: AdminUser; tempPassword?: string; emailSent?: boolean; emailError?: string | null; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      let msg = `Account created for ${inviteEmail.trim()}.`;
      if (data.emailSent) {
        msg += " Invite email sent ✓";
      } else if (data.emailError) {
        msg += ` Email failed (${data.emailError}) — share credentials manually.`;
      } else {
        msg += " Email not configured — share credentials manually.";
      }
      if (data.tempPassword) {
        msg += ` Temp password: ${data.tempPassword}`;
      }
      setInviteResult({ type: data.emailSent ? "success" : "warn", msg });
      setInviteName(""); setInviteEmail(""); setInviteRole("MEMBER");
      await loadAdminUsers();
    } catch (err: unknown) {
      setInviteResult({ type: "error", msg: err instanceof Error ? err.message : "Failed" });
    } finally { setInviting(false); }
  }

  async function resetAdminPassword(e: FormEvent) {
    e.preventDefault();
    if (!resetTargetId || resetPw.length < 8) return;
    setResetSaving(true); setResetResult(null);
    try {
      const res = await fetch(`/api/crm/admin/users/${resetTargetId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPw }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setResetResult({ type: "success", msg: "Password updated." });
      setResetPw("");
      setTimeout(() => { setResetTargetId(null); setResetResult(null); }, 2000);
    } catch (err: unknown) {
      setResetResult({ type: "error", msg: err instanceof Error ? err.message : "Failed" });
    } finally { setResetSaving(false); }
  }

  async function removeAdmin(userId: string) {
    if (!confirm("Remove this admin? They will lose access immediately.")) return;
    setRemovingId(userId);
    try {
      await fetch(`/api/crm/admin/users/${userId}`, { method: "DELETE" });
      await loadAdminUsers();
    } finally { setRemovingId(null); }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwError(""); setPwSaved(false);
    if (newPw !== confirmPw) { setPwError("New passwords don't match"); return; }
    if (newPw.length < 8)    { setPwError("Password must be at least 8 characters"); return; }
    setPwSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setPwSaved(true); setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setTimeout(() => setPwSaved(false), 3000);
    } catch (err: unknown) { setPwError(err instanceof Error ? err.message : "Failed"); }
    finally { setPwSaving(false); }
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
        body: JSON.stringify({ text: "✅ 10x Career Accelerator CRM — Slack integration is working!" }),
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

  const formatSyncDate = (iso: string | null) => {
    if (!iso) return "Never";
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  };

  const tabs: { key: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { key: "profile",      label: "Profile",      icon: <User size={14} /> },
    { key: "organization", label: "Organization", icon: <Building2 size={14} /> },
    ...(isAdmin ? [{ key: "team" as SettingsTab,  label: "Team",         icon: <Users size={14} /> }] : []),
    { key: "integrations", label: "Integrations", icon: <Plug size={14} /> },
  ];

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your account, team, and integrations.</p>
      </div>

      {/* Gmail OAuth banner */}
      {gmailBanner === "connected" && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 mb-4">
          <CheckCircle2 size={16} className="text-green-600 shrink-0" />
          <p className="text-sm text-green-800 font-medium">Gmail connected successfully!</p>
        </div>
      )}
      {gmailBanner === "disconnected" && (
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 mb-4">
          <CheckCircle2 size={16} className="text-slate-500 shrink-0" />
          <p className="text-sm text-slate-700 font-medium">Gmail disconnected.</p>
        </div>
      )}
      {gmailBanner === "error" && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4">
          <AlertCircle size={16} className="text-red-600 shrink-0" />
          <p className="text-sm text-red-800 font-medium">Gmail connection failed. Please try again or check your Google Cloud credentials.</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              activeTab === t.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {activeTab === "profile" && (
        <div className="space-y-5">
          <Section title="Your Profile">
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

          <Section title="Change Password">
            <form onSubmit={changePassword} className="space-y-4">
              <Field label="Current Password">
                <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                  placeholder="Enter your current password" className={inputCls} />
              </Field>
              <Field label="New Password">
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                  placeholder="At least 8 characters" className={inputCls} />
              </Field>
              <Field label="Confirm New Password">
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                  placeholder="Repeat new password" className={inputCls} />
              </Field>
              {pwError && <p className="text-sm text-red-600">{pwError}</p>}
              <button type="submit" disabled={pwSaving || !currentPw || !newPw || !confirmPw}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition">
                {pwSaving ? <Loader2 size={14} className="animate-spin" /> : pwSaved ? <CheckCircle2 size={14} /> : <Lock size={14} />}
                {pwSaving ? "Saving…" : pwSaved ? "Password Updated!" : "Update Password"}
              </button>
            </form>
          </Section>
        </div>
      )}

      {/* Organization tab */}
      {activeTab === "organization" && (
        <div className="space-y-5">
          <Section title="Proposal Defaults">
            <p className="text-xs text-slate-500 -mt-2">These appear on every generated proposal. Customize to match your brand.</p>
            <Field label="Program Name">
              <input value={progName} onChange={e => setProgName(e.target.value)}
                placeholder="10x Career Accelerator Program" className={inputCls} />
            </Field>
            <Field label="Tagline">
              <input value={tagline} onChange={e => setTagline(e.target.value)}
                placeholder="Land your next role. Faster." className={inputCls} />
            </Field>
            <Field label="Footer Text">
              <input value={footer} onChange={e => setFooter(e.target.value)}
                placeholder="Questions? Reply to this proposal or book a call." className={inputCls} />
            </Field>
            <button onClick={saveAppSettings} disabled={appSaving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition">
              {appSaving ? <Loader2 size={14} className="animate-spin" /> : appSaved ? <CheckCircle2 size={14} /> : <Save size={14} />}
              {appSaving ? "Saving…" : appSaved ? "Saved!" : "Save"}
            </button>
          </Section>
        </div>
      )}

      {/* Team tab */}
      {activeTab === "team" && (
        <div className="space-y-5">
          <Section title="Team">
            <p className="text-xs text-slate-500 -mt-2">
              Invite other admins to access the CRM. They&apos;ll receive an email with a temporary password.
            </p>

            {adminUsers.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {adminUsers.map((u, i) => (
                  <div key={u.id} className={i > 0 ? "border-t border-slate-100" : ""}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {(u.name ?? u.email)[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{u.name ?? "—"}</p>
                        <p className="text-xs text-slate-400 truncate">{u.email}</p>
                      </div>
                      {u.id === (session as { user?: { id?: string } })?.user?.id ? (
                        <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">You</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setResetTargetId(resetTargetId === u.id ? null : u.id); setResetPw(""); setResetResult(null); }}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition" title="Reset password">
                            <Lock size={14} />
                          </button>
                          <button onClick={() => removeAdmin(u.id)} disabled={removingId === u.id}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-50">
                            {removingId === u.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      )}
                    </div>
                    {resetTargetId === u.id && (
                      <form onSubmit={resetAdminPassword} className="px-4 pb-3 pt-1 border-t border-slate-100 bg-slate-50">
                        <p className="text-xs text-slate-500 mb-2">Set a new password for {u.name ?? u.email}</p>
                        <div className="flex gap-2">
                          <input type="password" value={resetPw} onChange={e => setResetPw(e.target.value)}
                            placeholder="New password (8+ chars)" minLength={8}
                            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <button type="submit" disabled={resetSaving || resetPw.length < 8}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5">
                            {resetSaving ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
                            {resetSaving ? "Saving…" : "Save"}
                          </button>
                        </div>
                        {resetResult && (
                          <p className={`text-xs mt-1.5 ${resetResult.type === "success" ? "text-green-600" : "text-red-600"}`}>{resetResult.msg}</p>
                        )}
                      </form>
                    )}
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={inviteAdmin} className="space-y-3 pt-1">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <UserPlus size={12} /> Invite New Admin
              </p>
              <div className="flex gap-2">
                <input value={inviteName} onChange={e => setInviteName(e.target.value)}
                  placeholder="Full name" className={inputCls} />
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  type="email" placeholder="Email address" className={inputCls} />
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value as "ADMIN" | "MEMBER")}
                  className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0">
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              {inviteResult && (
                <div className={`text-sm px-4 py-2.5 rounded-xl border font-mono break-all ${
                  inviteResult.type === "success"
                    ? "bg-green-50 border-green-200 text-green-800"
                    : inviteResult.type === "warn"
                    ? "bg-amber-50 border-amber-200 text-amber-900"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}>
                  {inviteResult.msg}
                </div>
              )}
              <button type="submit" disabled={inviting || !inviteName.trim() || !inviteEmail.trim()}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition">
                {inviting ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
                {inviting ? "Inviting…" : "Send Invite"}
              </button>
            </form>
          </Section>
        </div>
      )}

      {/* Integrations tab */}
      {activeTab === "integrations" && (
        <div className="space-y-5">
          <Section title="Gmail Integration">
            <p className="text-xs text-slate-500 -mt-2">
              Connect your Gmail account to automatically log sent emails to lead timelines.
            </p>
            {gmailStatus?.connected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-green-900">Connected</p>
                    <p className="text-xs text-green-700 truncate">{gmailStatus.gmailEmail}</p>
                  </div>
                  <Mail size={16} className="text-green-600 shrink-0" />
                </div>
                <div className="text-xs text-slate-400">Last synced: {formatSyncDate(gmailStatus.gmailSyncedAt)}</div>
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
                    <Unlink size={14} /> Disconnect
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
                  Requires <code className="bg-slate-100 px-1 rounded">GOOGLE_CLIENT_ID</code> and{" "}
                  <code className="bg-slate-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code> in your environment.
                </p>
              </div>
            )}
          </Section>

          <Section title="Slack Integration">
            <p className="text-xs text-slate-500 -mt-2">
              Get notified in Slack when a lead enrolls or goes cold.{" "}
              <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer"
                className="text-blue-600 hover:underline">How to create a webhook →</a>
            </p>
            <Field label="Webhook URL" hint="Paste your Slack Incoming Webhook URL">
              <input value={slackUrl} onChange={e => setSlackUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className={inputCls} />
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
              <button onClick={saveAppSettings} disabled={appSaving}
                className="flex items-center gap-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl transition">
                {appSaving ? <Loader2 size={14} className="animate-spin" /> : appSaved ? <CheckCircle2 size={14} /> : <Save size={14} />}
                {appSaving ? "Saving…" : appSaved ? "Saved!" : "Save"}
              </button>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
