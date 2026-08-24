"use client";
import React, { useState, useEffect, FormEvent } from "react";
import { useSession } from "next-auth/react";
import {
  UserPlus, Loader2, CheckCircle2, Trash2, Lock, X, Shield, Users, AlertCircle,
} from "lucide-react";

interface TeamMember {
  id:        string;
  name:      string | null;
  email:     string;
  crmRole:   string | null;
  createdAt: string;
}

const inputCls = "w-full px-3 py-2.5 border border-[#e4e0d6] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#086c64] focus:bg-white";

function RoleBadge({ role }: { role: string | null }) {
  if (role === "ADMIN") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
        <Shield size={10} /> Admin
      </span>
    );
  }
  if (role === "MEMBER") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: "#edf5f4", color: "#086c64", borderWidth: 1, borderStyle: "solid", borderColor: "#c4dedd" }}>
        <Users size={10} /> Member
      </span>
    );
  }
  return null;
}

export default function TeamPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { crmRole?: string } | undefined)?.crmRole === "ADMIN";
  const currentUserId = (session?.user as { id?: string } | undefined)?.id;

  const [members,    setMembers]    = useState<TeamMember[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  // Invite form
  const [inviteName,   setInviteName]   = useState("");
  const [inviteEmail,  setInviteEmail]  = useState("");
  const [inviteRole,   setInviteRole]   = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [inviting,     setInviting]     = useState(false);
  const [inviteResult, setInviteResult] = useState<{ type: "success" | "warn" | "error"; msg: string } | null>(null);

  // Role change
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

  // Remove
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Reset password
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPw,       setResetPw]       = useState("");
  const [resetSaving,   setResetSaving]   = useState(false);
  const [resetResult,   setResetResult]   = useState<{ type: "success" | "error"; msg: string } | null>(null);

  async function loadMembers() {
    try {
      const res = await fetch("/api/crm/users");
      if (res.ok) setMembers(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMembers(); }, []);

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    setInviting(true); setInviteResult(null);
    try {
      const res = await fetch("/api/crm/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: inviteName.trim(), email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json() as {
        user?: TeamMember; isNew?: boolean;
        tempPassword?: string | null; emailSent?: boolean;
        emailError?: string | null; error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed");

      let msg = data.isNew
        ? `Account created for ${inviteEmail.trim()}.`
        : `${inviteEmail.trim()} already had an account — CRM role updated to ${inviteRole}.`;

      if (data.emailSent) {
        msg += " Invite email sent.";
      } else if (data.emailError) {
        msg += ` Email failed (${data.emailError}).`;
      }
      if (data.isNew && data.tempPassword) {
        msg += ` Temp password: ${data.tempPassword}`;
      }

      setInviteResult({ type: data.emailSent ? "success" : "warn", msg });
      setInviteName(""); setInviteEmail(""); setInviteRole("MEMBER");
      await loadMembers();
    } catch (err: unknown) {
      setInviteResult({ type: "error", msg: err instanceof Error ? err.message : "Failed" });
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(userId: string, newRole: "ADMIN" | "MEMBER") {
    setChangingRoleId(userId);
    try {
      await fetch(`/api/crm/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crmRole: newRole }),
      });
      await loadMembers();
    } finally {
      setChangingRoleId(null);
    }
  }

  async function removeMember(userId: string, name: string | null) {
    if (!confirm(`Remove ${name ?? "this member"}'s CRM access? They will be logged out immediately. Their LMS account will not be deleted.`)) return;
    setRemovingId(userId);
    try {
      await fetch(`/api/crm/admin/users/${userId}`, { method: "DELETE" });
      await loadMembers();
    } finally {
      setRemovingId(null);
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    if (!resetTargetId || resetPw.length < 8) return;
    setResetSaving(true); setResetResult(null);
    try {
      const res = await fetch(`/api/crm/admin/users/${resetTargetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPw }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setResetResult({ type: "success", msg: "Password updated." });
      setResetPw("");
      setTimeout(() => { setResetTargetId(null); setResetResult(null); }, 2000);
    } catch (err: unknown) {
      setResetResult({ type: "error", msg: err instanceof Error ? err.message : "Failed" });
    } finally {
      setResetSaving(false);
    }
  }

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));

  return (
    <div className="max-w-3xl mx-auto p-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1 font-display" style={{ color: "#949598" }}>Vantage Career Accelerator</p>
          <h1 className="text-2xl font-display font-semibold" style={{ color: "#14211f" }}>Team</h1>
          <p className="text-sm mt-0.5" style={{ color: "#949598" }}>
            Manage who has access to the CRM and what they can do.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setShowInvite(true); setInviteResult(null); }}
            className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition shadow-sm"
            style={{ background: "#086c64" }}
          >
            <UserPlus size={15} /> Invite Member
          </button>
        )}
      </div>

      {/* Role legend */}
      <div className="flex gap-4 mb-5 text-xs" style={{ color: "#949598" }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200"><Shield size={9} /> Admin</span>
          Full access — can invite, delete leads, view analytics
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#edf5f4", color: "#086c64", borderWidth: 1, borderStyle: "solid", borderColor: "#c4dedd" }}><Users size={9} /> Member</span>
          Can view/edit leads and activities
        </span>
      </div>

      {/* Member list */}
      <div className="card shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12" style={{ color: "#949598" }}>
            <Loader2 size={20} className="animate-spin mr-2" /> Loading…
          </div>
        ) : members.length === 0 ? (
          <div className="py-12 text-center text-sm" style={{ color: "#949598" }}>No team members yet.</div>
        ) : (
          members.map((m, i) => (
            <div key={m.id} className={i > 0 ? "border-t border-[#e4e0d6]" : ""}>
              <div className="flex items-center gap-4 px-5 py-4">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: "linear-gradient(135deg, #086c64, #0d8a80)" }}>
                  {(m.name ?? m.email)[0].toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold" style={{ color: "#14211f" }}>{m.name ?? "—"}</p>
                    <RoleBadge role={m.crmRole} />
                    {m.id === currentUserId && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: "#949598", background: "#f1efe8" }}>You</span>
                    )}
                  </div>
                  <p className="text-xs truncate" style={{ color: "#949598" }}>{m.email}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "#c9c4b8" }}>Joined {formatDate(m.createdAt)}</p>
                </div>

                {/* Actions — ADMIN only, and can't act on yourself */}
                {isAdmin && m.id !== currentUserId && (
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Role toggle */}
                    {m.crmRole === "MEMBER" ? (
                      <button
                        onClick={() => changeRole(m.id, "ADMIN")}
                        disabled={changingRoleId === m.id}
                        title="Promote to Admin"
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-purple-600 hover:bg-purple-50 border border-transparent hover:border-purple-200 transition disabled:opacity-50"
                      >
                        {changingRoleId === m.id ? <Loader2 size={12} className="animate-spin" /> : "→ Admin"}
                      </button>
                    ) : (
                      <button
                        onClick={() => changeRole(m.id, "MEMBER")}
                        disabled={changingRoleId === m.id}
                        title="Demote to Member"
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-transparent transition disabled:opacity-50"
                        style={{ color: "#086c64" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#edf5f4")}
                        onMouseLeave={e => (e.currentTarget.style.background = "")}
                      >
                        {changingRoleId === m.id ? <Loader2 size={12} className="animate-spin" /> : "→ Member"}
                      </button>
                    )}

                    {/* Reset password */}
                    <button
                      onClick={() => { setResetTargetId(resetTargetId === m.id ? null : m.id); setResetPw(""); setResetResult(null); }}
                      title="Reset password"
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg transition text-xs font-medium"
                      style={{ color: "#5a6663" }}
                      onMouseEnter={e => { e.currentTarget.style.color = "#086c64"; e.currentTarget.style.background = "#edf5f4"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "#5a6663"; e.currentTarget.style.background = ""; }}
                    >
                      <Lock size={13} />
                      <span>Reset pw</span>
                    </button>

                    {/* Remove access */}
                    <button
                      onClick={() => removeMember(m.id, m.name)}
                      disabled={removingId === m.id}
                      title="Remove CRM access"
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg transition disabled:opacity-50 text-xs font-medium"
                      style={{ color: "#5a6663" }}
                      onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "#fef2f2"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "#5a6663"; e.currentTarget.style.background = ""; }}
                    >
                      {removingId === m.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      <span>Remove</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Inline password reset form */}
              {isAdmin && resetTargetId === m.id && (
                <form onSubmit={resetPassword} className="px-5 pb-4 pt-1 border-t border-[#e4e0d6]" style={{ background: "#f8f6f1" }}>
                  <p className="text-xs mb-2" style={{ color: "#5a6663" }}>Set a new password for {m.name ?? m.email}</p>
                  <div className="flex gap-2">
                    <input
                      type="password" value={resetPw} onChange={e => setResetPw(e.target.value)}
                      placeholder="New password (8+ chars)" minLength={8}
                      className="flex-1 px-3 py-2 border border-[#e4e0d6] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#086c64]"
                    />
                    <button
                      type="submit" disabled={resetSaving || resetPw.length < 8}
                      className="px-3 py-2 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
                      style={{ background: "#086c64" }}
                    >
                      {resetSaving ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
                      {resetSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                  {resetResult && (
                    <p className={`text-xs mt-1.5 ${resetResult.type === "success" ? "text-green-600" : "text-red-600"}`}>
                      {resetResult.msg}
                    </p>
                  )}
                </form>
              )}
            </div>
          ))
        )}
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="card shadow-2xl w-full max-w-md p-6 relative">
            <button
              onClick={() => { setShowInvite(false); setInviteResult(null); }}
              className="absolute top-4 right-4 p-1.5 rounded-lg transition"
              style={{ color: "#949598" }}
              onMouseEnter={e => { e.currentTarget.style.color = "#14211f"; e.currentTarget.style.background = "#f1efe8"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#949598"; e.currentTarget.style.background = ""; }}
            >
              <X size={16} />
            </button>

            <h2 className="text-lg font-bold mb-1" style={{ color: "#14211f" }}>Invite Team Member</h2>
            <p className="text-sm mb-5" style={{ color: "#5a6663" }}>
              They&apos;ll receive an email with login credentials. If they already have an account, their CRM access will be updated.
            </p>

            <form onSubmit={invite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#5a6663" }}>Full Name</label>
                <input
                  value={inviteName} onChange={e => setInviteName(e.target.value)}
                  placeholder="Jane Smith" className={inputCls} style={{ background: "#f8f6f1" }} required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#5a6663" }}>Email Address</label>
                <input
                  type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder="jane@example.com" className={inputCls} style={{ background: "#f8f6f1" }} required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#5a6663" }}>Role</label>
                <select
                  value={inviteRole} onChange={e => setInviteRole(e.target.value as "ADMIN" | "MEMBER")}
                  className="w-full px-3 py-2.5 border border-[#e4e0d6] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#086c64]"
                  style={{ background: "#f8f6f1" }}
                >
                  <option value="MEMBER">Member — can view/edit leads, not analytics or team</option>
                  <option value="ADMIN">Admin — full access including team management</option>
                </select>
              </div>

              {inviteResult && (
                <div className={`flex gap-2.5 items-start text-sm px-4 py-3 rounded-xl border ${
                  inviteResult.type === "success"
                    ? "bg-green-50 border-green-200 text-green-800"
                    : inviteResult.type === "warn"
                    ? "bg-amber-50 border-amber-200 text-amber-900"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}>
                  {inviteResult.type === "success"
                    ? <CheckCircle2 size={15} className="text-green-600 mt-0.5 shrink-0" />
                    : <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  }
                  <span className="font-mono text-xs break-all">{inviteResult.msg}</span>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowInvite(false); setInviteResult(null); }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-[#e4e0d6] text-sm font-semibold transition hover:bg-[#f8f6f1]"
                  style={{ color: "#5a6663" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting || !inviteName.trim() || !inviteEmail.trim()}
                  className="flex-1 flex items-center justify-center gap-2 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition"
                  style={{ background: "#086c64" }}
                >
                  {inviting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                  {inviting ? "Sending…" : "Send Invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
