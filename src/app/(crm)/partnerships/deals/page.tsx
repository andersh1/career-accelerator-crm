"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, X, Handshake, Building2, Users } from "lucide-react";
import { useToast } from "@/lib/toast";

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
  contactLead: { id: string; firstName: string; lastName: string; company: string | null; email: string } | null;
  _count: { participants: number };
}

const STATUSES = [
  { key: "PROSPECTING",   label: "Prospecting",    color: "bg-slate-100 text-slate-600"   },
  { key: "PROPOSAL_SENT", label: "Proposal Sent",  color: "bg-blue-100 text-blue-700"     },
  { key: "NEGOTIATING",   label: "Negotiating",    color: "bg-amber-100 text-amber-700"   },
  { key: "SIGNED",        label: "Signed",         color: "bg-teal-100 text-teal-700"     },
  { key: "ACTIVE",        label: "Active",         color: "bg-green-100 text-green-700"   },
  { key: "CLOSED_WON",    label: "Closed Won",     color: "bg-emerald-100 text-emerald-700" },
  { key: "CLOSED_LOST",   label: "Closed Lost",    color: "bg-red-100 text-red-600"       },
];

const PAYMENT_TYPES = [
  { key: "ORG_INVOICE", label: "Org Invoice" },
  { key: "INDIVIDUAL",  label: "Individual"  },
  { key: "MIXED",       label: "Mixed"       },
];

function statusInfo(key: string) {
  return STATUSES.find(s => s.key === key) ?? STATUSES[0];
}

function fmt$(n: number | null | undefined): string | null {
  if (n == null) return null;
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`;
}

function dealValue(d: Deal): number | null {
  if (d.totalValue) return d.totalValue;
  if (d.seats && d.pricePerSeat) return d.seats * d.pricePerSeat;
  return null;
}

export default function DealsPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [deals, setDeals]       = useState<Deal[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showNew, setShowNew]   = useState(false);
  const [admins, setAdmins]     = useState<{ id: string; name: string | null; email: string }[]>([]);

  // New deal form state
  const [title, setTitle]           = useState("");
  const [orgName, setOrgName]       = useState("");
  const [seats, setSeats]           = useState("");
  const [pricePerSeat, setPricePerSeat] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [paymentType, setPaymentType] = useState("ORG_INVOICE");
  const [notes, setNotes]           = useState("");
  const [creating, setCreating]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dealsRes, usersRes] = await Promise.all([
        fetch("/api/crm/deals"),
        fetch("/api/crm/users"),
      ]);
      if (dealsRes.ok) setDeals(await dealsRes.json());
      if (usersRes.ok) setAdmins(await usersRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createDeal(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !orgName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/crm/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          orgName: orgName.trim(),
          seats: seats ? parseInt(seats) : null,
          pricePerSeat: pricePerSeat ? parseInt(pricePerSeat) : null,
          assignedTo: assignedTo || null,
          paymentType,
          notes: notes.trim() || null,
        }),
      });
      if (res.ok) {
        const deal = await res.json() as Deal;
        success("Deal created ✓");
        setShowNew(false);
        setTitle(""); setOrgName(""); setSeats(""); setPricePerSeat(""); setAssignedTo(""); setNotes("");
        router.push(`/partnerships/deals/${deal.id}`);
      } else {
        toastError("Failed to create deal.");
      }
    } finally {
      setCreating(false);
    }
  }

  const byStatus = STATUSES.map(s => ({
    ...s,
    deals: deals.filter(d => d.status === s.key),
  }));

  return (
    <div className="p-6 max-w-[1600px] mx-auto animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#949598" }}>Partnerships</p>
          <h1 className="text-xl sm:text-2xl font-display font-semibold flex items-center gap-2" style={{ color: "#14211f" }}>
            <Handshake size={22} style={{ color: "#086c64" }} /> Deals
          </h1>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: "#949598" }}>
            {deals.length} deal{deals.length !== 1 ? "s" : ""} total
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-xl transition shadow-sm"
          style={{ background: "#086c64" }}
        >
          <Plus size={15} /> New Deal
        </button>
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="animate-spin" style={{ color: "#c9c4b8" }} />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-6" style={{ minHeight: "60vh" }}>
          {byStatus.map(col => (
            <div key={col.key} className="flex-shrink-0 w-72">
              {/* Column header */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${col.color}`}>
                    {col.label}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: "#949598" }}>
                    {col.deals.length}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {col.deals.length === 0 && (
                  <div
                    className="border-2 border-dashed rounded-2xl p-4 text-center text-xs"
                    style={{ borderColor: "#e4e0d6", color: "#c9c4b8" }}
                  >
                    No deals
                  </div>
                )}
                {col.deals.map(deal => {
                  const val = dealValue(deal);
                  return (
                    <button
                      key={deal.id}
                      onClick={() => router.push(`/partnerships/deals/${deal.id}`)}
                      className="w-full text-left bg-white border border-[#e4e0d6] rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-[#086c64]/30 transition-all"
                    >
                      <p className="font-semibold text-sm leading-snug mb-0.5" style={{ color: "#14211f" }}>
                        {deal.title}
                      </p>
                      <p className="text-xs flex items-center gap-1 mb-3" style={{ color: "#949598" }}>
                        <Building2 size={10} /> {deal.orgName}
                      </p>

                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          {deal.seats && (
                            <span className="flex items-center gap-1" style={{ color: "#5a6663" }}>
                              <Users size={10} /> {deal.seats}
                            </span>
                          )}
                          {val && (
                            <span className="font-bold" style={{ color: "#086c64" }}>
                              {fmt$(val)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {deal._count.participants > 0 && (
                            <span className="text-[10px] font-medium" style={{ color: "#949598" }}>
                              {deal._count.participants} participant{deal._count.participants !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>

                      {deal.assignedTo && (
                        <p className="mt-2 text-[10px]" style={{ color: "#c9c4b8" }}>
                          {deal.assignedTo}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Deal modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#e4e0d6]">
              <h2 className="font-bold text-base" style={{ color: "#14211f" }}>New Deal</h2>
              <button
                onClick={() => setShowNew(false)}
                className="p-1.5 rounded-lg hover:bg-[#f8f6f1] transition"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={createDeal} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "#949598" }}>
                  Deal Title <span className="text-red-400">*</span>
                </label>
                <input
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Northwestern SPS — Fall 2026"
                  className="w-full text-sm border border-[#e4e0d6] rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
                  style={{ color: "#14211f" }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "#949598" }}>
                  Organization <span className="text-red-400">*</span>
                </label>
                <input
                  required
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder="University / firm name"
                  className="w-full text-sm border border-[#e4e0d6] rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
                  style={{ color: "#14211f" }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: "#949598" }}>Seats</label>
                  <input
                    type="number"
                    min="0"
                    value={seats}
                    onChange={e => setSeats(e.target.value)}
                    placeholder="0"
                    className="w-full text-sm border border-[#e4e0d6] rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
                    style={{ color: "#14211f" }}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: "#949598" }}>Price / Seat ($)</label>
                  <input
                    type="number"
                    min="0"
                    value={pricePerSeat}
                    onChange={e => setPricePerSeat(e.target.value)}
                    placeholder="0"
                    className="w-full text-sm border border-[#e4e0d6] rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
                    style={{ color: "#14211f" }}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "#949598" }}>Payment Type</label>
                <select
                  value={paymentType}
                  onChange={e => setPaymentType(e.target.value)}
                  className="w-full text-sm border border-[#e4e0d6] rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
                  style={{ color: "#14211f" }}
                >
                  {PAYMENT_TYPES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "#949598" }}>Assigned To</label>
                <select
                  value={assignedTo}
                  onChange={e => setAssignedTo(e.target.value)}
                  className="w-full text-sm border border-[#e4e0d6] rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
                  style={{ color: "#14211f" }}
                >
                  <option value="">Unassigned</option>
                  {admins.map(a => <option key={a.email} value={a.email}>{a.name ?? a.email}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "#949598" }}>Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any initial notes…"
                  rows={3}
                  className="w-full text-sm border border-[#e4e0d6] rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#086c64]/40 resize-none"
                  style={{ color: "#14211f" }}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="flex-1 text-sm font-semibold border border-[#e4e0d6] px-4 py-2.5 rounded-xl hover:bg-[#f8f6f1] transition"
                  style={{ color: "#5a6663" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !title.trim() || !orgName.trim()}
                  className="flex-1 text-sm font-semibold text-white px-4 py-2.5 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "#086c64" }}
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : null}
                  {creating ? "Creating…" : "Create Deal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
