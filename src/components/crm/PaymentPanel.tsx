"use client";

import { useEffect, useState } from "react";
import { DollarSign, Plus, Trash2, Loader2, ChevronDown } from "lucide-react";

interface PaymentRecord {
  id: string; amount: number; note: string | null; paidAt: string; createdBy: string | null;
}

const PAYMENT_STATUSES = [
  { id: "UNPAID",       label: "Unpaid",        cls: "bg-slate-100 text-slate-600"     },
  { id: "PAYMENT_PLAN", label: "Payment Plan",   cls: "bg-blue-100 text-blue-700"       },
  { id: "PAID_FULL",    label: "Paid in Full",   cls: "bg-emerald-100 text-emerald-700" },
  { id: "SCHOLARSHIP",  label: "Scholarship",    cls: "bg-violet-100 text-violet-700"   },
  { id: "OUTSTANDING",  label: "Outstanding",    cls: "bg-red-100 text-red-700"         },
];

function statusInfo(id: string | null) {
  return PAYMENT_STATUSES.find(s => s.id === (id ?? "UNPAID")) ?? PAYMENT_STATUSES[0];
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PaymentPanel({
  leadId,
  dealValue,
  paymentStatus,
  onStatusChange,
}: {
  leadId: string;
  dealValue: number | null;
  paymentStatus: string | null;
  onStatusChange: (status: string) => Promise<void>;
}) {
  const [records,       setRecords]      = useState<PaymentRecord[]>([]);
  const [totalPaid,     setTotalPaid]    = useState(0);
  const [loading,       setLoading]      = useState(true);
  const [showAdd,       setShowAdd]      = useState(false);
  const [amount,        setAmount]       = useState("");
  const [note,          setNote]         = useState("");
  const [adding,        setAdding]       = useState(false);
  const [showStatus,    setShowStatus]   = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function load() {
    const data = await fetch(`/api/crm/leads/${leadId}/payments`).then(r => r.json());
    setRecords(data.records ?? []);
    setTotalPaid(data.total ?? 0);
    setLoading(false);
  }

  useEffect(() => { load(); }, [leadId]);

  async function addRecord() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setAdding(true);
    const res = await fetch(`/api/crm/leads/${leadId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Math.round(amt), note: note || undefined }),
    });
    if (res.ok) {
      await load();
      setAmount("");
      setNote("");
      setShowAdd(false);
    }
    setAdding(false);
  }

  async function deleteRecord(id: string) {
    await fetch(`/api/crm/leads/${leadId}/payments?recordId=${id}`, { method: "DELETE" });
    await load();
  }

  async function updateStatus(newStatus: string) {
    setUpdatingStatus(true);
    setShowStatus(false);
    await onStatusChange(newStatus);
    setUpdatingStatus(false);
  }

  const deal    = dealValue ?? 0;
  const pct     = deal > 0 ? Math.min(100, Math.round((totalPaid / deal) * 100)) : 0;
  const status  = statusInfo(paymentStatus);
  const remaining = deal > 0 ? Math.max(0, deal - totalPaid) : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Payment</p>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
        >
          <Plus size={12} /> Log Payment
        </button>
      </div>

      {/* Status selector */}
      <div className="relative mb-4">
        <button
          onClick={() => setShowStatus(v => !v)}
          disabled={updatingStatus}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition ${status.cls}`}
        >
          <div className="flex items-center gap-2">
            {updatingStatus ? <Loader2 size={13} className="animate-spin" /> : <DollarSign size={13} />}
            {status.label}
          </div>
          <ChevronDown size={12} />
        </button>
        {showStatus && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowStatus(false)} />
            <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1">
              {PAYMENT_STATUSES.map(s => (
                <button
                  key={s.id}
                  onClick={() => updateStatus(s.id)}
                  disabled={s.id === (paymentStatus ?? "UNPAID")}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition flex items-center gap-2 disabled:opacity-40"
                >
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
                  {s.id === (paymentStatus ?? "UNPAID") && <span className="ml-auto text-[10px] text-slate-400">current</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Deal value summary */}
      {deal > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-500">
              ${totalPaid.toLocaleString()} paid of ${deal.toLocaleString()}
            </span>
            <span className={`font-bold ${pct >= 100 ? "text-emerald-600" : "text-blue-600"}`}>{pct}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : "bg-blue-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {remaining > 0 && (
            <p className="text-xs text-slate-400 mt-1">${remaining.toLocaleString()} remaining</p>
          )}
        </div>
      )}

      {/* Add payment form */}
      {showAdd && (
        <div className="bg-slate-50 rounded-xl p-3 mb-3 space-y-2 border border-slate-200">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Amount"
                min="1"
                className="w-full pl-6 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <button
              onClick={addRecord}
              disabled={!amount || adding}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition disabled:opacity-40"
            >
              {adding ? <Loader2 size={13} className="animate-spin" /> : "Add"}
            </button>
          </div>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
      )}

      {/* Payment history */}
      {loading ? (
        <div className="flex justify-center py-3">
          <Loader2 size={16} className="animate-spin text-slate-300" />
        </div>
      ) : records.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-2">No payments recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {records.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-emerald-600">${r.amount.toLocaleString()}</span>
                  <span className="text-xs text-slate-400">{fmtDate(r.paidAt)}</span>
                </div>
                {r.note && <p className="text-xs text-slate-500 truncate">{r.note}</p>}
              </div>
              <button
                onClick={() => deleteRecord(r.id)}
                className="p-1 text-slate-300 hover:text-red-400 transition shrink-0"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}

          {records.length > 1 && (
            <div className="pt-2 border-t border-slate-100 flex justify-between text-xs font-bold">
              <span className="text-slate-500">Total</span>
              <span className="text-emerald-600">${totalPaid.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
