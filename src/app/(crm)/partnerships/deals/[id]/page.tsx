"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, ChevronDown, X, Plus, Building2,
  Users, Calendar, DollarSign, UserRound, Trash2, Search,
} from "lucide-react";
import { useToast } from "@/lib/toast";
import NoteContent from "@/components/crm/NoteContent";

const STATUSES = [
  { key: "PROSPECTING",   label: "Prospecting",    color: "bg-slate-100 text-slate-600"     },
  { key: "PROPOSAL_SENT", label: "Proposal Sent",  color: "bg-blue-100 text-blue-700"       },
  { key: "NEGOTIATING",   label: "Negotiating",    color: "bg-amber-100 text-amber-700"     },
  { key: "SIGNED",        label: "Signed",         color: "bg-teal-100 text-teal-700"       },
  { key: "ACTIVE",        label: "Active",         color: "bg-green-100 text-green-700"     },
  { key: "CLOSED_WON",    label: "Closed Won",     color: "bg-emerald-100 text-emerald-700" },
  { key: "CLOSED_LOST",   label: "Closed Lost",    color: "bg-red-100 text-red-600"         },
];

const ACTIVITY_TYPES = ["NOTE", "CALL", "MEETING", "EMAIL"];
const PAYMENT_TYPES = [
  { key: "ORG_INVOICE", label: "Org Invoice" },
  { key: "INDIVIDUAL",  label: "Individual"  },
  { key: "MIXED",       label: "Mixed"       },
];

function statusInfo(key: string) {
  return STATUSES.find(s => s.key === key) ?? STATUSES[0];
}

interface DealActivity {
  id: string; type: string; content: string | null;
  createdBy: string | null; createdAt: string;
}

interface Lead {
  id: string; firstName: string; lastName: string; email: string;
  stage: string; leadType: string | null; company?: string | null;
}

interface Deal {
  id: string;
  title: string;
  orgName: string;
  status: string;
  seats: number | null;
  pricePerSeat: number | null;
  totalValue: number | null;
  paymentType: string | null;
  assignedTo: string | null;
  notes: string | null;
  proposalSentAt: string | null;
  signedAt: string | null;
  startDate: string | null;
  createdAt: string;
  updatedAt: string;
  contactLead: { id: string; firstName: string; lastName: string; email: string; company: string | null } | null;
  participants: Lead[];
  activities: DealActivity[];
}

function fmt$(n: number | null | undefined) {
  if (n == null) return null;
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`;
}

function computedValue(d: Deal): number | null {
  if (d.totalValue) return d.totalValue;
  if (d.seats && d.pricePerSeat) return d.seats * d.pricePerSeat;
  return null;
}

function activityIcon(type: string) {
  const icons: Record<string, string> = {
    NOTE: "📝", CALL: "📞", MEETING: "🤝", EMAIL: "📧", STATUS_CHANGE: "🔄",
  };
  return icons[type] ?? "•";
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function toDateInputVal(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function DealDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const { success, error: toastError } = useToast();

  const [deal, setDeal]     = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<{ id: string; name: string | null; email: string }[]>([]);

  // Status dropdown
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Inline edit for title
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft]     = useState("");

  // Activity feed
  const [actType, setActType]       = useState("NOTE");
  const [actContent, setActContent] = useState("");
  const [addingAct, setAddingAct]   = useState(false);

  // Sidebar inline edits
  const [saving, setSaving] = useState(false);

  // Contact search
  const [showContactSearch, setShowContactSearch] = useState(false);
  const [contactQuery, setContactQuery]           = useState("");
  const [contactResults, setContactResults]       = useState<Lead[]>([]);
  const [searchingContact, setSearchingContact]   = useState(false);

  // Participant search
  const [showParticipantSearch, setShowParticipantSearch] = useState(false);
  const [participantQuery, setParticipantQuery]           = useState("");
  const [participantResults, setParticipantResults]       = useState<Lead[]>([]);
  const [searchingParticipant, setSearchingParticipant]   = useState(false);

  // Delete
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const [dealRes, usersRes] = await Promise.all([
      fetch(`/api/crm/deals/${id}`),
      fetch("/api/crm/users"),
    ]);
    if (!dealRes.ok) { router.push("/partnerships/deals"); return; }
    setDeal(await dealRes.json());
    if (usersRes.ok) setAdmins(await usersRes.json());
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  // Background refresh every 30s, paused when tab is hidden
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    function start() { if (!timer) timer = setInterval(load, 30_000); }
    function stop()  { if (timer) { clearInterval(timer); timer = null; } }
    function onVisibility() { document.hidden ? stop() : start(); }
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [load]);

  async function patch(data: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/deals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await load();
        success("Saved ✓");
      } else {
        toastError("Save failed.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(newStatus: string) {
    setShowStatusMenu(false);
    setUpdatingStatus(true);
    await patch({ status: newStatus });
    setUpdatingStatus(false);
  }

  async function saveTitle() {
    if (!titleDraft.trim()) return;
    setEditingTitle(false);
    await patch({ title: titleDraft.trim() });
  }

  async function addActivity() {
    if (!actContent.trim()) return;
    setAddingAct(true);
    try {
      const res = await fetch(`/api/crm/deals/${id}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: actType, content: actContent }),
      });
      if (res.ok) {
        setActContent("");
        await load();
        success("Note added ✓");
      } else {
        toastError("Failed to add note.");
      }
    } finally {
      setAddingAct(false);
    }
  }

  async function searchLeads(q: string, setter: (leads: Lead[]) => void, loadingSetter: (v: boolean) => void) {
    if (!q.trim()) { setter([]); return; }
    loadingSetter(true);
    try {
      const res = await fetch(`/api/crm/leads?q=${encodeURIComponent(q)}&all=true&leadType=ALL`);
      if (res.ok) {
        const data = await res.json();
        setter(Array.isArray(data) ? data.slice(0, 8) : (data.leads ?? []).slice(0, 8));
      }
    } finally {
      loadingSetter(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => searchLeads(contactQuery, setContactResults, setSearchingContact), 300);
    return () => clearTimeout(t);
  }, [contactQuery]);

  useEffect(() => {
    const t = setTimeout(() => searchLeads(participantQuery, setParticipantResults, setSearchingParticipant), 300);
    return () => clearTimeout(t);
  }, [participantQuery]);

  async function linkContact(leadId: string) {
    await patch({ contactLeadId: leadId });
    setShowContactSearch(false);
    setContactQuery("");
    setContactResults([]);
  }

  async function linkParticipant(leadId: string) {
    const res = await fetch(`/api/crm/deals/${id}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    });
    if (res.ok) {
      await load();
      success("Participant linked ✓");
      setShowParticipantSearch(false);
      setParticipantQuery("");
      setParticipantResults([]);
    } else {
      toastError("Failed to link participant.");
    }
  }

  async function unlinkParticipant(leadId: string) {
    const res = await fetch(`/api/crm/deals/${id}/participants`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    });
    if (res.ok) { await load(); success("Participant removed ✓"); }
    else toastError("Failed to remove participant.");
  }

  async function deleteDeal() {
    if (!confirm("Delete this deal? This cannot be undone.")) return;
    setDeleting(true);
    const res = await fetch(`/api/crm/deals/${id}`, { method: "DELETE" });
    if (res.ok) {
      success("Deal deleted.");
      router.push("/partnerships/deals");
    } else {
      toastError("Delete failed.");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={28} className="animate-spin" style={{ color: "#c9c4b8" }} />
      </div>
    );
  }

  if (!deal) return null;

  const stg = statusInfo(deal.status);
  const val = computedValue(deal);

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-up">
      {/* Back link */}
      <Link
        href="/partnerships/deals"
        className="inline-flex items-center gap-1.5 text-sm font-medium mb-5 transition hover:opacity-70"
        style={{ color: "#949598" }}
      >
        <ArrowLeft size={14} /> Deals
      </Link>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── Left: main content ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Deal title + status */}
          <div className="bg-white border border-[#e4e0d6] rounded-3xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-1 min-w-0">
                {editingTitle ? (
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={e => setTitleDraft(e.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
                    className="text-xl font-bold w-full border-b-2 border-[#086c64] bg-transparent focus:outline-none pb-1"
                    style={{ color: "#14211f" }}
                  />
                ) : (
                  <button
                    className="text-xl font-bold text-left hover:opacity-70 transition"
                    style={{ color: "#14211f" }}
                    onClick={() => { setTitleDraft(deal.title); setEditingTitle(true); }}
                    title="Click to edit"
                  >
                    {deal.title}
                  </button>
                )}
                <p className="text-sm mt-0.5 flex items-center gap-1" style={{ color: "#949598" }}>
                  <Building2 size={12} /> {deal.orgName}
                </p>
              </div>

              {/* Status badge + dropdown */}
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowStatusMenu(v => !v)}
                  disabled={updatingStatus}
                  className={`flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full transition ${stg.color}`}
                >
                  {updatingStatus ? <Loader2 size={12} className="animate-spin" /> : null}
                  {stg.label}
                  <ChevronDown size={12} />
                </button>
                {showStatusMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowStatusMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-2xl shadow-xl border border-[#e4e0d6] w-48 py-1.5">
                      {STATUSES.map(s => (
                        <button
                          key={s.key}
                          onClick={() => changeStatus(s.key)}
                          className={`w-full text-left px-4 py-2.5 hover:bg-[#f8f6f1] transition flex items-center gap-2 ${deal.status === s.key ? "bg-[#f8f6f1]" : ""}`}
                        >
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Value summary bar */}
            <div className="flex items-center gap-4 p-3 rounded-xl text-sm" style={{ background: "#f8f6f1" }}>
              {val && (
                <div className="flex items-center gap-1.5">
                  <DollarSign size={14} style={{ color: "#086c64" }} />
                  <span className="font-bold" style={{ color: "#086c64" }}>{fmt$(val)}</span>
                  <span className="text-xs" style={{ color: "#949598" }}>total</span>
                </div>
              )}
              {deal.seats && (
                <div className="flex items-center gap-1.5">
                  <Users size={14} style={{ color: "#949598" }} />
                  <span className="font-semibold" style={{ color: "#5a6663" }}>{deal.seats} seats</span>
                </div>
              )}
              {deal.assignedTo && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <UserRound size={14} style={{ color: "#949598" }} />
                  <span className="text-xs" style={{ color: "#949598" }}>{deal.assignedTo}</span>
                </div>
              )}
            </div>
          </div>

          {/* Activity feed */}
          <div className="bg-white border border-[#e4e0d6] rounded-3xl p-6">
            <h2 className="font-bold text-sm mb-4" style={{ color: "#14211f" }}>Activity</h2>

            {/* Add activity */}
            <div className="mb-5">
              <div className="flex gap-2 mb-2">
                {ACTIVITY_TYPES.map(t => (
                  <button
                    key={t}
                    onClick={() => setActType(t)}
                    className={`text-xs font-semibold px-3 py-1 rounded-full transition ${
                      actType === t ? "text-white" : "border border-[#e4e0d6] hover:bg-[#f8f6f1]"
                    }`}
                    style={actType === t ? { background: "#086c64" } : { color: "#5a6663" }}
                  >
                    {t[0] + t.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <textarea
                  value={actContent}
                  onChange={e => setActContent(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addActivity(); }}
                  placeholder={`Add a ${actType.toLowerCase()}…`}
                  rows={2}
                  className="flex-1 text-sm border border-[#e4e0d6] rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#086c64]/40 resize-none"
                  style={{ color: "#14211f" }}
                />
                <button
                  onClick={addActivity}
                  disabled={addingAct || !actContent.trim()}
                  className="self-end text-white text-sm font-semibold px-4 py-2 rounded-xl transition disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0"
                  style={{ background: "#086c64" }}
                >
                  {addingAct ? <Loader2 size={13} className="animate-spin" /> : null}
                  Log
                </button>
              </div>
            </div>

            {/* Feed */}
            {deal.activities.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: "#c9c4b8" }}>No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {deal.activities.map(act => (
                  <div key={act.id} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm" style={{ background: "#f8f6f1" }}>
                      {activityIcon(act.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#949598" }}>{act.type}</span>
                        <span className="text-[10px]" style={{ color: "#c9c4b8" }}>
                          {new Date(act.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          {act.createdBy && ` · ${act.createdBy}`}
                        </span>
                      </div>
                      {act.content && (
                        <NoteContent text={act.content} clamp={4} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: sidebar ─────────────────────────────────────────────── */}
        <div className="lg:w-80 xl:w-96 flex-shrink-0 space-y-4">
          {/* Org / deal details */}
          <div className="bg-white border border-[#e4e0d6] rounded-3xl p-5">
            <h3 className="font-bold text-sm mb-4 flex items-center gap-2" style={{ color: "#14211f" }}>
              <Building2 size={14} style={{ color: "#086c64" }} /> Organization
            </h3>
            <div className="space-y-3">
              <InlineField
                label="Org Name"
                value={deal.orgName}
                onSave={v => patch({ orgName: v })}
              />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#949598" }}>Payment Type</p>
                <select
                  value={deal.paymentType ?? "ORG_INVOICE"}
                  onChange={e => patch({ paymentType: e.target.value })}
                  className="w-full text-sm border border-[#e4e0d6] rounded-lg px-2 py-1.5 bg-white focus:outline-none"
                  style={{ color: "#14211f" }}
                >
                  {PAYMENT_TYPES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#949598" }}>Assigned To</p>
                <select
                  value={deal.assignedTo ?? ""}
                  onChange={e => patch({ assignedTo: e.target.value || null })}
                  className="w-full text-sm border border-[#e4e0d6] rounded-lg px-2 py-1.5 bg-white focus:outline-none"
                  style={{ color: "#14211f" }}
                >
                  <option value="">Unassigned</option>
                  {admins.map(a => <option key={a.email} value={a.email}>{a.name ?? a.email}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Financials */}
          <div className="bg-white border border-[#e4e0d6] rounded-3xl p-5">
            <h3 className="font-bold text-sm mb-4 flex items-center gap-2" style={{ color: "#14211f" }}>
              <DollarSign size={14} style={{ color: "#086c64" }} /> Financials
            </h3>
            <div className="space-y-3">
              <InlineNumberField label="Seats" value={deal.seats} onSave={v => patch({ seats: v })} />
              <InlineNumberField label="Price per Seat ($)" value={deal.pricePerSeat} onSave={v => patch({ pricePerSeat: v })} />
              <InlineNumberField label="Total Value Override ($)" value={deal.totalValue} onSave={v => patch({ totalValue: v })} />
              {val && (
                <div className="pt-2 border-t border-[#e4e0d6]">
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#949598" }}>Computed Total</p>
                  <p className="text-lg font-bold" style={{ color: "#086c64" }}>{fmt$(val)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Key dates */}
          <div className="bg-white border border-[#e4e0d6] rounded-3xl p-5">
            <h3 className="font-bold text-sm mb-4 flex items-center gap-2" style={{ color: "#14211f" }}>
              <Calendar size={14} style={{ color: "#086c64" }} /> Key Dates
            </h3>
            <div className="space-y-3">
              <DateField label="Proposal Sent" value={deal.proposalSentAt} onSave={v => patch({ proposalSentAt: v })} />
              <DateField label="Signed" value={deal.signedAt} onSave={v => patch({ signedAt: v })} />
              <DateField label="Start Date" value={deal.startDate} onSave={v => patch({ startDate: v })} />
            </div>
          </div>

          {/* Contact */}
          <div className="bg-white border border-[#e4e0d6] rounded-3xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: "#14211f" }}>
                <UserRound size={14} style={{ color: "#086c64" }} /> Contact
              </h3>
              <button
                onClick={() => setShowContactSearch(v => !v)}
                className="text-xs font-semibold transition hover:opacity-70"
                style={{ color: "#086c64" }}
              >
                {deal.contactLead ? "Change" : "Link"}
              </button>
            </div>

            {deal.contactLead ? (
              <Link href={`/leads/${deal.contactLead.id}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#f8f6f1] transition">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#edf5f4" }}>
                  <span className="text-[10px] font-bold" style={{ color: "#086c64" }}>
                    {deal.contactLead.firstName[0]}{deal.contactLead.lastName[0]}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "#14211f" }}>
                    {deal.contactLead.firstName} {deal.contactLead.lastName}
                  </p>
                  <p className="text-xs truncate" style={{ color: "#949598" }}>{deal.contactLead.email}</p>
                  {deal.contactLead.company && (
                    <p className="text-xs truncate" style={{ color: "#949598" }}>{deal.contactLead.company}</p>
                  )}
                </div>
              </Link>
            ) : (
              <p className="text-sm" style={{ color: "#c9c4b8" }}>No contact linked.</p>
            )}

            {showContactSearch && (
              <div className="mt-3">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#949598" }} />
                  <input
                    autoFocus
                    value={contactQuery}
                    onChange={e => setContactQuery(e.target.value)}
                    placeholder="Search by name or email…"
                    className="w-full text-sm border border-[#e4e0d6] rounded-lg pl-7 pr-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
                    style={{ color: "#14211f" }}
                  />
                </div>
                {searchingContact && <p className="text-xs mt-2" style={{ color: "#949598" }}>Searching…</p>}
                {contactResults.length > 0 && (
                  <div className="mt-2 border border-[#e4e0d6] rounded-xl overflow-hidden">
                    {contactResults.map(l => (
                      <button
                        key={l.id}
                        onClick={() => linkContact(l.id)}
                        className="w-full text-left px-3 py-2 hover:bg-[#f8f6f1] transition border-b border-[#e4e0d6] last:border-0 text-sm"
                        style={{ color: "#14211f" }}
                      >
                        {l.firstName} {l.lastName}
                        <span className="text-xs ml-1" style={{ color: "#949598" }}>{l.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Participants */}
          <div className="bg-white border border-[#e4e0d6] rounded-3xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: "#14211f" }}>
                <Users size={14} style={{ color: "#086c64" }} /> Participants
                {deal.participants.length > 0 && (
                  <span className="text-xs font-semibold text-white px-2 py-0.5 rounded-full" style={{ background: "#086c64" }}>
                    {deal.participants.length}
                  </span>
                )}
              </h3>
              <button
                onClick={() => setShowParticipantSearch(v => !v)}
                className="text-xs font-semibold flex items-center gap-1 transition hover:opacity-70"
                style={{ color: "#086c64" }}
              >
                <Plus size={12} /> Link
              </button>
            </div>

            {deal.participants.length === 0 && !showParticipantSearch && (
              <p className="text-sm" style={{ color: "#c9c4b8" }}>No participants linked.</p>
            )}

            <div className="space-y-2">
              {deal.participants.map(p => {
                const stgBadge = getStageColor(p.stage);
                return (
                  <div key={p.id} className="flex items-center gap-2 group">
                    <Link href={`/leads/${p.id}`} className="flex items-center gap-2 flex-1 min-w-0 p-2 rounded-xl hover:bg-[#f8f6f1] transition">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#edf5f4" }}>
                        <span className="text-[9px] font-bold" style={{ color: "#086c64" }}>{p.firstName[0]}{p.lastName[0]}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: "#14211f" }}>{p.firstName} {p.lastName}</p>
                        <p className="text-[10px] truncate" style={{ color: "#949598" }}>{p.email}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-auto flex-shrink-0 ${stgBadge}`}>
                        {p.stage}
                      </span>
                    </Link>
                    <button
                      onClick={() => unlinkParticipant(p.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition hover:bg-red-50"
                      title="Unlink"
                    >
                      <X size={12} style={{ color: "#949598" }} />
                    </button>
                  </div>
                );
              })}
            </div>

            {showParticipantSearch && (
              <div className="mt-3">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#949598" }} />
                  <input
                    autoFocus
                    value={participantQuery}
                    onChange={e => setParticipantQuery(e.target.value)}
                    placeholder="Search by name or email…"
                    className="w-full text-sm border border-[#e4e0d6] rounded-lg pl-7 pr-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
                    style={{ color: "#14211f" }}
                  />
                </div>
                {searchingParticipant && <p className="text-xs mt-2" style={{ color: "#949598" }}>Searching…</p>}
                {participantResults.length > 0 && (
                  <div className="mt-2 border border-[#e4e0d6] rounded-xl overflow-hidden">
                    {participantResults
                      .filter(l => !deal.participants.some(p => p.id === l.id))
                      .map(l => (
                      <button
                        key={l.id}
                        onClick={() => linkParticipant(l.id)}
                        className="w-full text-left px-3 py-2 hover:bg-[#f8f6f1] transition border-b border-[#e4e0d6] last:border-0 text-sm"
                        style={{ color: "#14211f" }}
                      >
                        {l.firstName} {l.lastName}
                        <span className="text-xs ml-1" style={{ color: "#949598" }}>{l.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-white border border-[#e4e0d6] rounded-3xl p-5">
            <h3 className="font-bold text-sm mb-3" style={{ color: "#14211f" }}>Notes</h3>
            <NotesField value={deal.notes} onSave={v => patch({ notes: v })} />
          </div>

          {/* Danger zone */}
          <div className="bg-white border border-red-100 rounded-3xl p-5">
            <h3 className="font-bold text-sm mb-3" style={{ color: "#14211f" }}>Danger Zone</h3>
            <button
              onClick={deleteDeal}
              disabled={deleting}
              className="flex items-center gap-2 text-sm font-semibold text-red-500 border border-red-200 px-4 py-2 rounded-xl hover:bg-red-50 transition disabled:opacity-50"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete Deal
            </button>
          </div>

          {saving && (
            <div className="text-xs text-center py-1" style={{ color: "#949598" }}>Saving…</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helper sub-components ──────────────────────────────────────────────────────

function getStageColor(stage: string): string {
  const map: Record<string, string> = {
    LEAD:          "bg-slate-100 text-slate-600",
    CONTACTED:     "bg-blue-100 text-blue-700",
    STRATEGY_CALL: "bg-purple-100 text-purple-700",
    OFFER_SENT:    "bg-amber-100 text-amber-700",
    ENROLLED:      "bg-emerald-100 text-emerald-700",
    LOST:          "bg-red-100 text-red-600",
  };
  return map[stage] ?? "bg-slate-100 text-slate-600";
}

function InlineField({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    setEditing(false);
    if (draft.trim() !== value) onSave(draft.trim());
  }

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#949598" }}>{label}</p>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          className="w-full text-sm border border-[#086c64] rounded-lg px-2 py-1 focus:outline-none"
          style={{ color: "#14211f" }}
        />
      ) : (
        <button
          onClick={() => { setDraft(value); setEditing(true); }}
          className="text-sm w-full text-left hover:opacity-70 transition"
          style={{ color: value ? "#14211f" : "#c9c4b8" }}
        >
          {value || "Click to edit"}
        </button>
      )}
    </div>
  );
}

function InlineNumberField({ label, value, onSave }: { label: string; value: number | null; onSave: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? "");

  function commit() {
    setEditing(false);
    const n = draft.trim() ? parseInt(draft) : null;
    if (n !== value) onSave(n);
  }

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#949598" }}>{label}</p>
      {editing ? (
        <input
          autoFocus
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          className="w-full text-sm border border-[#086c64] rounded-lg px-2 py-1 focus:outline-none"
          style={{ color: "#14211f" }}
        />
      ) : (
        <button
          onClick={() => { setDraft(value?.toString() ?? ""); setEditing(true); }}
          className="text-sm w-full text-left hover:opacity-70 transition"
          style={{ color: value != null ? "#14211f" : "#c9c4b8" }}
        >
          {value != null ? value.toLocaleString() : "Click to set"}
        </button>
      )}
    </div>
  );
}

function DateField({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string | null) => void }) {
  const [draft, setDraft] = useState(toDateInputVal(value));

  // Sync when parent reloads deal data
  useEffect(() => { setDraft(toDateInputVal(value)); }, [value]);

  function commit() {
    const next = draft || null;
    if (next !== toDateInputVal(value)) onSave(next);
  }

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#949598" }}>{label}</p>
      <input
        type="date"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        className="w-full text-sm border border-[#e4e0d6] rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
        style={{ color: "#14211f" }}
      />
    </div>
  );
}

function NotesField({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const [saved, setSaved] = useState(false);

  function commit() {
    onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <textarea
        value={draft}
        onChange={e => { setDraft(e.target.value); setSaved(false); }}
        onBlur={commit}
        rows={4}
        placeholder="Add notes about this deal…"
        className="w-full text-sm border border-[#e4e0d6] rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#086c64]/40 resize-none"
        style={{ color: "#14211f" }}
      />
      {saved && <p className="text-[10px] mt-1" style={{ color: "#086c64" }}>Saved ✓</p>}
    </div>
  );
}

